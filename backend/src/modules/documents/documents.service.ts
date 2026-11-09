import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateDocumentDto } from "./dto/create-document.dto";
import { UpdateDocumentDto } from "./dto/update-document.dto";
import { FileStorageService, StoredFileNotFoundError } from "../storage/file-storage.service";
import { DocumentExtractionService } from "./document-extraction.service";
import { DocumentInsightsService } from "./document-insights.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import {
  Prisma,
  AuditAction,
  DocumentRole,
  DocumentStatus,
} from "../../../generated/prisma/client";
import { anyAccessWhere, resolveDocumentRole, workspaceAccessWhere } from "../access/document-access";

const documentSelect = {
  id: true,
  name: true,
  description: true,
  originalName: true,
  mimeType: true,
  size: true,
  status: true,
  extractedText: true,
  processingError: true,
  deletedAt: true,
  insights: true,
  insightsGeneratedAt: true,
  userId: true,
  categoryId: true,
  category: {
    select: {
      id: true,
      name: true,
    },
  },
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      chunks: true,
    },
  },
} as const;

type DocumentRecord = {
  id: number;
  name: string;
  description: string | null;
  originalName: string | null;
  mimeType: string | null;
  size: number | null;
  status: DocumentStatus;
  extractedText: string | null;
  processingError: string | null;
  deletedAt: Date | null;
  insights: Prisma.JsonValue;
  insightsGeneratedAt: Date | null;
  userId: number;
  categoryId: number | null;
  category: { id: number; name: string } | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { chunks: number };
};

type AccessRole = "OWNER" | DocumentRole;

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly extractionService: DocumentExtractionService,
    private readonly auditLog: AuditLogService,
    private readonly insightsService: DocumentInsightsService,
    private readonly storage: FileStorageService,
  ) {}

  async create(
    userId: number,
    dto: CreateDocumentDto,
    file?: Express.Multer.File,
    ipAddress?: string | null,
  ) {
    if (dto.categoryId !== undefined) {
      await this.assertCategoryExists(dto.categoryId);
    }

    if (file) {
      await this.storeUpload(file);
    }

    const document = await this.prisma.document
      .create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim(),
        categoryId: dto.categoryId ?? null,
        userId,
        ...(file
          ? {
              originalName: file.originalname,
              mimeType: file.mimetype,
              size: file.size,
              filePath: file.filename,
            }
          : {}),
      },
      select: documentSelect,
      })
      .catch(async (error) => {
        if (file) await this.storage.remove(`documents/${file.filename}`);
        throw error;
      });

    await this.auditLog.log({
      actorId: userId,
      action: AuditAction.DOCUMENT_UPLOAD,
      targetType: "Document",
      targetId: document.id,
      metadata: { name: document.name },
      ipAddress,
    });

    if (file) {
      await this.extractionService.processDocument(document.id);

      const processed = await this.prisma.document.findUnique({
        where: { id: document.id },
        select: documentSelect,
      });

      return this.toResponse(processed!, "OWNER");
    }

    return this.toResponse(document, "OWNER");
  }

  async findAll(userId: number) {
    const documents = await this.prisma.document.findMany({
      where: {
        deletedAt: null,
        ...workspaceAccessWhere(userId),
      },
      select: {
        ...documentSelect,
        permissions: { where: { userId }, select: { role: true } },
        favorites: { where: { userId }, select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return documents.map((document) => {
      const { permissions, favorites, ...rest } = document;
      const accessRole: AccessRole =
        rest.userId === userId ? "OWNER" : permissions[0]?.role ?? "VIEWER";
      return { ...this.toResponse(rest, accessRole), isFavorite: favorites.length > 0 };
    });
  }

  /** Per-user favorite flag. Requires the user to be able to view the document. */
  async setFavorite(userId: number, id: number, isFavorite: boolean) {
    await this.loadWithAccess(userId, id);

    if (isFavorite) {
      await this.prisma.documentFavorite.upsert({
        where: { documentId_userId: { documentId: id, userId } },
        create: { documentId: id, userId },
        update: {},
      });
    } else {
      await this.prisma.documentFavorite.deleteMany({
        where: { documentId: id, userId },
      });
    }

    return { id, isFavorite };
  }

  /** Documents other users explicitly shared with this user (never their own). */
  async findShared(userId: number) {
    const documents = await this.prisma.document.findMany({
      where: {
        deletedAt: null,
        userId: { not: userId },
        ...workspaceAccessWhere(userId),
      },
      select: {
        ...documentSelect,
        user: { select: { id: true, name: true } },
        permissions: {
          where: { userId },
          select: { role: true, createdAt: true },
        },
        favorites: { where: { userId }, select: { id: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return documents.map((document) => {
      const { permissions, user, favorites, ...rest } = document;
      return {
        ...this.toResponse(rest, permissions[0]?.role ?? "VIEWER"),
        isFavorite: favorites.length > 0,
        owner: user,
        sharedAt: permissions[0]?.createdAt ?? null,
      };
    });
  }

  async findOne(userId: number, id: number) {
    const { document, role } = await this.loadWithAccess(userId, id);
    return this.toResponse(document, role);
  }

  async getExtractedText(userId: number, id: number) {
    const { document } = await this.loadWithAccess(userId, id);

    if (document.status !== DocumentStatus.READY || !document.extractedText) {
      throw new BadRequestException(
        document.processingError ??
          "Extracted text is not available for this document yet.",
      );
    }

    return { id: document.id, extractedText: document.extractedText };
  }

  async update(
    userId: number,
    id: number,
    dto: UpdateDocumentDto,
    ipAddress?: string | null,
  ) {
    const { role } = await this.loadWithAccess(userId, id);

    if (role !== "OWNER" && role !== DocumentRole.EDITOR) {
      throw new ForbiddenException(
        "You only have view access to this document",
      );
    }

    if (dto.categoryId !== undefined) {
      await this.assertCategoryExists(dto.categoryId);
    }

    const document = await this.prisma.document.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() }
          : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
      },
      select: documentSelect,
    });

    await this.auditLog.log({
      actorId: userId,
      action: AuditAction.DOCUMENT_UPDATE,
      targetType: "Document",
      targetId: id,
      metadata: { changes: dto },
      ipAddress,
    });

    return this.toResponse(document, role);
  }

  /** Moves a document to Trash (soft delete). Owner only. */
  async remove(
    userId: number,
    id: number,
    ipAddress?: string | null,
  ): Promise<{ id: number; message: string }> {
    const document = await this.prisma.document.findFirst({
      where: { id, userId, deletedAt: null },
      select: { id: true, name: true },
    });

    if (!document) {
      throw new NotFoundException("Document not found");
    }

    await this.prisma.document.update({
      where: { id: document.id },
      data: { deletedAt: new Date() },
    });

    await this.auditLog.log({
      actorId: userId,
      action: AuditAction.DOCUMENT_DELETE,
      targetType: "Document",
      targetId: document.id,
      metadata: { name: document.name, trashed: true },
      ipAddress,
    });

    return { id: document.id, message: "Document moved to Trash" };
  }

  async listTrash(userId: number) {
    const documents = await this.prisma.document.findMany({
      where: { userId, deletedAt: { not: null } },
      select: documentSelect,
      orderBy: { deletedAt: "desc" },
    });

    return documents.map((document) => this.toResponse(document, "OWNER"));
  }

  async restore(userId: number, id: number, ipAddress?: string | null) {
    const trashed = await this.findTrashed(userId, id);

    const document = await this.prisma.document.update({
      where: { id: trashed.id },
      data: { deletedAt: null },
      select: documentSelect,
    });

    await this.auditLog.log({
      actorId: userId,
      action: AuditAction.DOCUMENT_UPDATE,
      targetType: "Document",
      targetId: id,
      metadata: { name: document.name, restored: true },
      ipAddress,
    });

    return this.toResponse(document, "OWNER");
  }

  /** Permanently deletes a document that is already in Trash, including every stored file. */
  async removePermanently(
    userId: number,
    id: number,
    ipAddress?: string | null,
  ): Promise<{ id: number; message: string }> {
    const trashed = await this.findTrashed(userId, id);

    const [document, versions] = await Promise.all([
      this.prisma.document.findUnique({
        where: { id },
        select: { filePath: true },
      }),
      this.prisma.documentVersion.findMany({
        where: { documentId: id },
        select: { filePath: true },
      }),
    ]);

    await this.prisma.document.delete({ where: { id } });

    await this.auditLog.log({
      actorId: userId,
      action: AuditAction.DOCUMENT_DELETE,
      targetType: "Document",
      targetId: id,
      metadata: { name: trashed.name, permanent: true },
      ipAddress,
    });

    const files = [document?.filePath, ...versions.map((v) => v.filePath)];
    await Promise.all(
      files
        .filter((file): file is string => Boolean(file))
        // remove() is best effort: a missing file must not fail the record deletion.
        .map((file) => this.storage.remove(`documents/${file}`)),
    );

    return { id, message: "Document permanently deleted" };
  }

  // ---- Versions ---------------------------------------------------------

  async listVersions(userId: number, id: number) {
    const { document } = await this.loadWithAccess(userId, id);

    const [current, versions] = await Promise.all([
      this.prisma.document.findUnique({
        where: { id },
        select: {
          originalName: true,
          mimeType: true,
          size: true,
          filePath: true,
        },
      }),
      this.prisma.documentVersion.findMany({
        where: { documentId: id },
        orderBy: { version: "desc" },
        select: {
          id: true,
          version: true,
          originalName: true,
          mimeType: true,
          size: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      documentId: id,
      current: current?.filePath
        ? {
            version: (versions[0]?.version ?? 0) + 1,
            originalName: current.originalName,
            mimeType: current.mimeType,
            size: current.size,
            updatedAt: document.updatedAt,
          }
        : null,
      versions,
    };
  }

  /** Uploads a new file for an existing document; the previous file is kept as a version. */
  async uploadVersion(
    userId: number,
    id: number,
    file: Express.Multer.File | undefined,
    ipAddress?: string | null,
  ) {
    if (!file) {
      throw new BadRequestException("A file is required.");
    }

    try {
      await this.assertCanEdit(userId, id);
      await this.storeUpload(file);
    } catch (error) {
      await unlink(file.path).catch(() => undefined);
      throw error;
    }

    try {
      await this.archiveCurrentFile(id, userId);
    } catch (error) {
      await this.storage.remove(`documents/${file.filename}`);
      throw error;
    }

    await this.prisma.document.update({
      where: { id },
      data: {
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        filePath: file.filename,
        status: DocumentStatus.PENDING,
        processingError: null,
        extractedText: null,
        insights: Prisma.DbNull,
        insightsGeneratedAt: null,
      },
    });

    return this.reprocessAndRespond(userId, id, "version_upload", ipAddress);
  }

  async restoreVersion(
    userId: number,
    id: number,
    versionId: number,
    ipAddress?: string | null,
  ) {
    await this.assertCanEdit(userId, id);

    const version = await this.prisma.documentVersion.findFirst({
      where: { id: versionId, documentId: id },
    });

    if (!version) {
      throw new NotFoundException("Version not found");
    }

    // Copy rather than share the file, so deleting/replacing either one
    // can never break the other.
    const restoredFile = `${randomUUID()}${extname(version.filePath)}`;
    try {
      await this.storage.copy(
        `documents/${version.filePath}`,
        `documents/${restoredFile}`,
      );
    } catch {
      throw new BadRequestException(
        "The stored file for this version is no longer available.",
      );
    }

    await this.archiveCurrentFile(id, userId);

    await this.prisma.document.update({
      where: { id },
      data: {
        originalName: version.originalName,
        mimeType: version.mimeType,
        size: version.size,
        filePath: restoredFile,
        status: DocumentStatus.PENDING,
        processingError: null,
        extractedText: null,
        insights: Prisma.DbNull,
        insightsGeneratedAt: null,
      },
    });

    return this.reprocessAndRespond(userId, id, "version_restore", ipAddress, {
      restoredVersion: version.version,
    });
  }

  /** The current file of an image document, for showing it as a chat source. */
  async getImageFile(userId: number, id: number) {
    await this.loadWithAccess(userId, id);

    const document = await this.prisma.document.findUnique({
      where: { id },
      select: { filePath: true, mimeType: true },
    });

    if (!document?.filePath || !document.mimeType?.startsWith("image/")) {
      throw new NotFoundException("No image available for this document");
    }

    return {
      buffer: await this.readStored(document.filePath),
      mimeType: document.mimeType,
    };
  }

  async getVersionFile(userId: number, id: number, versionId: number) {
    await this.loadWithAccess(userId, id);

    const version = await this.prisma.documentVersion.findFirst({
      where: { id: versionId, documentId: id },
      select: { filePath: true, originalName: true },
    });

    if (!version) {
      throw new NotFoundException("Version not found");
    }

    return {
      buffer: await this.readStored(version.filePath),
      downloadName: version.originalName ?? version.filePath,
    };
  }

  // ---- Insights ---------------------------------------------------------

  async generateInsights(userId: number, id: number) {
    const { document } = await this.assertCanEdit(userId, id);

    if (document.status !== DocumentStatus.READY) {
      throw new BadRequestException(
        "Insights are available once the document is fully processed.",
      );
    }

    const insights = await this.insightsService.generate(id, document.name);

    return this.prisma.document.update({
      where: { id },
      data: { insights, insightsGeneratedAt: new Date() },
      select: { insights: true, insightsGeneratedAt: true },
    });
  }

  private async findTrashed(userId: number, id: number) {
    const trashed = await this.prisma.document.findFirst({
      where: { id, userId, deletedAt: { not: null } },
      select: { id: true, name: true },
    });

    if (!trashed) {
      throw new NotFoundException("Document not found in Trash");
    }

    return trashed;
  }

  private async assertCanEdit(userId: number, id: number) {
    const loaded = await this.loadWithAccess(userId, id);

    if (loaded.role !== "OWNER" && loaded.role !== DocumentRole.EDITOR) {
      throw new ForbiddenException(
        "You only have view access to this document",
      );
    }

    return loaded;
  }

  /** Moves a freshly uploaded file into durable storage (bucket in production). */
  private async storeUpload(file: Express.Multer.File) {
    try {
      await this.storage.put(`documents/${file.filename}`, file.path, file.mimetype);
    } catch (error) {
      await unlink(file.path).catch(() => undefined);
      this.logger.error(
        `Could not store uploaded file: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException(
        "File storage is temporarily unavailable. Please try again.",
      );
    }
  }

  private async readStored(filePath: string): Promise<Buffer> {
    try {
      return await this.storage.read(`documents/${filePath}`);
    } catch (error) {
      if (error instanceof StoredFileNotFoundError) {
        throw new NotFoundException("The stored file is no longer available.");
      }
      throw error;
    }
  }

  /** Stores the document's current file as the next version, if it has one. */
  private async archiveCurrentFile(id: number, userId: number) {
    const current = await this.prisma.document.findUnique({
      where: { id },
      select: {
        filePath: true,
        originalName: true,
        mimeType: true,
        size: true,
      },
    });

    if (!current?.filePath) {
      return;
    }

    const last = await this.prisma.documentVersion.aggregate({
      where: { documentId: id },
      _max: { version: true },
    });

    await this.prisma.documentVersion.create({
      data: {
        documentId: id,
        version: (last._max.version ?? 0) + 1,
        originalName: current.originalName,
        mimeType: current.mimeType,
        size: current.size,
        filePath: current.filePath,
        createdById: userId,
      },
    });
  }

  private async reprocessAndRespond(
    userId: number,
    id: number,
    event: string,
    ipAddress?: string | null,
    extra: Record<string, unknown> = {},
  ) {
    await this.extractionService.processDocument(id);

    await this.auditLog.log({
      actorId: userId,
      action: AuditAction.DOCUMENT_UPDATE,
      targetType: "Document",
      targetId: id,
      metadata: { event, ...extra },
      ipAddress,
    });

    const { document, role } = await this.loadWithAccess(userId, id);
    return this.toResponse(document, role);
  }

  async getChunks(userId: number, id: number) {
    await this.loadWithAccess(userId, id);

    const chunks = await this.prisma.$queryRaw<
      {
        id: number;
        chunkIndex: number;
        content: string;
        createdAt: Date;
        hasEmbedding: boolean;
      }[]
    >`
      SELECT id, "chunkIndex", content, "createdAt", (embedding IS NOT NULL) AS "hasEmbedding"
      FROM "DocumentChunk"
      WHERE "documentId" = ${id}
      ORDER BY "chunkIndex" ASC
    `;

    const embeddedCount = chunks.filter((chunk) => chunk.hasEmbedding).length;

    return {
      documentId: id,
      count: chunks.length,
      embeddedCount,
      chunks,
    };
  }

  /**
   * Loads a document a user may view either because they own it or because
   * an admin granted them a DocumentPermission row, returning the resolved
   * access role alongside it. Non-owners/non-grantees get the same 404 an
   * owner-only document would give a stranger, so the check can't be used to
   * probe for a document's existence.
   */
  async loadWithAccess(
    userId: number,
    id: number,
  ): Promise<{ document: DocumentRecord; role: AccessRole }> {
    const document = await this.prisma.document.findFirst({
      where: {
        id,
        deletedAt: null,
        ...anyAccessWhere(userId),
      },
      select: {
        ...documentSelect,
        permissions: { where: { userId }, select: { role: true } },
      },
    });

    if (!document) {
      throw new NotFoundException("Document not found");
    }

    const { permissions, ...rest } = document;
    const role: AccessRole = resolveDocumentRole(userId, rest, permissions[0]?.role);

    return { document: rest, role };
  }

  private toResponse(document: DocumentRecord, accessRole: AccessRole) {
    const { extractedText, _count, ...rest } = document;

    return {
      ...rest,
      hasExtractedText: Boolean(extractedText && extractedText.trim()),
      chunkCount: _count.chunks,
      accessRole,
    };
  }

  private async assertCategoryExists(categoryId: number): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new BadRequestException("Selected category does not exist");
    }
  }
}
