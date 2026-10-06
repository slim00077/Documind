import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { NotificationsService } from "../notifications/notifications.service";
import { AdminUsersService } from "./admin-users.service";
import { AuditAction, DocumentStatus } from "../../../generated/prisma/client";
import { QueryAdminDocumentsDto } from "./dto/query-admin-documents.dto";
import { AdminUpdateDocumentDto } from "./dto/admin-update-document.dto";
import { AdminGrantAccessDto } from "./dto/admin-grant-access.dto";
import { UpdatePermissionDto } from "./dto/update-permission.dto";

const detailSelect = {
  id: true,
  name: true,
  description: true,
  originalName: true,
  mimeType: true,
  size: true,
  status: true,
  processingError: true,
  deletedAt: true,
  userId: true,
  categoryId: true,
  category: { select: { id: true, name: true } },
  user: { select: { id: true, name: true, email: true } },
  createdAt: true,
  updatedAt: true,
  _count: { select: { chunks: true, versions: true, permissions: true } },
} as const;

@Injectable()
export class AdminDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly notifications: NotificationsService,
    private readonly adminUsers: AdminUsersService,
  ) {}

  async findAll(query: QueryAdminDocumentsDto = {}) {
    const term = query.search?.trim();
    const state = query.state ?? "active";

    const documents = await this.prisma.document.findMany({
      where: {
        ...(state === "active" ? { deletedAt: null } : {}),
        ...(state === "trashed" ? { deletedAt: { not: null } } : {}),
        ...(query.status ? { status: query.status as DocumentStatus } : {}),
        ...(term
          ? {
              OR: [
                { name: { contains: term, mode: "insensitive" as const } },
                { originalName: { contains: term, mode: "insensitive" as const } },
                { user: { name: { contains: term, mode: "insensitive" as const } } },
                { user: { email: { contains: term, mode: "insensitive" as const } } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        status: true,
        size: true,
        userId: true,
        deletedAt: true,
        category: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
        createdAt: true,
        updatedAt: true,
        _count: { select: { permissions: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return documents.map((document) => {
      const { _count, ...rest } = document;
      return { ...rest, sharedWithCount: _count.permissions };
    });
  }

  async findOne(id: number) {
    const document = await this.loadDetail(id);
    const permissions = await this.prisma.documentPermission.findMany({
      where: { documentId: id },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    const { _count, ...rest } = document;
    return {
      ...rest,
      chunkCount: _count.chunks,
      versionCount: _count.versions,
      permissions,
    };
  }

  async update(adminId: number, id: number, dto: AdminUpdateDocumentDto) {
    await this.loadDetail(id);

    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new BadRequestException("Selected category does not exist");
      }
    }

    await this.prisma.document.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() }
          : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
      },
    });

    await this.auditLog.log({
      actorId: adminId,
      action: AuditAction.DOCUMENT_UPDATE,
      targetType: "Document",
      targetId: id,
      metadata: { changes: dto, byAdmin: true },
    });

    return this.findOne(id);
  }

  /** Moves any user's document to Trash (soft delete); restorable. */
  async trash(adminId: number, id: number) {
    const document = await this.loadDetail(id);

    if (document.deletedAt) {
      throw new BadRequestException("This document is already in Trash");
    }

    await this.prisma.document.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.auditLog.log({
      actorId: adminId,
      action: AuditAction.DOCUMENT_DELETE,
      targetType: "Document",
      targetId: id,
      metadata: { name: document.name, trashed: true, byAdmin: true },
    });

    if (document.userId !== adminId) {
      await this.notifications.notify({
        userId: document.userId,
        type: "DOCUMENT_TRASHED",
        title: "Document moved to Trash",
        message: `An administrator moved "${document.name}" to Trash. You can restore it from Trash.`,
        documentId: null,
      });
    }

    return this.findOne(id);
  }

  async restore(adminId: number, id: number) {
    const document = await this.loadDetail(id);

    if (!document.deletedAt) {
      throw new BadRequestException("This document is not in Trash");
    }

    await this.prisma.document.update({
      where: { id },
      data: { deletedAt: null },
    });

    await this.auditLog.log({
      actorId: adminId,
      action: AuditAction.DOCUMENT_UPDATE,
      targetType: "Document",
      targetId: id,
      metadata: { name: document.name, restored: true, byAdmin: true },
    });

    if (document.userId !== adminId) {
      await this.notifications.notify({
        userId: document.userId,
        type: "DOCUMENT_RESTORED",
        title: "Document restored",
        message: `An administrator restored "${document.name}" from Trash.`,
        documentId: id,
      });
    }

    return this.findOne(id);
  }

  // Access management reuses the per-user permission logic (validation,
  // audit logging, notifications) so both admin pages behave identically.

  async grantAccess(adminId: number, id: number, dto: AdminGrantAccessDto) {
    await this.loadDetail(id);
    await this.adminUsers.grantPermission(adminId, dto.userId, {
      documentId: id,
      role: dto.role,
    });
    return this.findOne(id);
  }

  async updateAccess(
    adminId: number,
    id: number,
    permissionId: number,
    dto: UpdatePermissionDto,
  ) {
    const permission = await this.findPermission(id, permissionId);
    await this.adminUsers.updatePermission(adminId, permission.userId, permissionId, dto);
    return this.findOne(id);
  }

  async revokeAccess(adminId: number, id: number, permissionId: number) {
    const permission = await this.findPermission(id, permissionId);
    await this.adminUsers.revokePermission(adminId, permission.userId, permissionId);
    return this.findOne(id);
  }

  private async findPermission(documentId: number, permissionId: number) {
    const permission = await this.prisma.documentPermission.findFirst({
      where: { id: permissionId, documentId },
      select: { id: true, userId: true },
    });

    if (!permission) {
      throw new NotFoundException("Permission not found");
    }

    return permission;
  }

  private async loadDetail(id: number) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      select: detailSelect,
    });

    if (!document) {
      throw new NotFoundException("Document not found");
    }

    return document;
  }
}
