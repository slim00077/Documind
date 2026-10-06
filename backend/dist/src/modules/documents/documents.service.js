"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentsService = void 0;
const common_1 = require("@nestjs/common");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const prisma_service_1 = require("../../prisma/prisma.service");
const documents_upload_config_1 = require("./documents-upload.config");
const document_extraction_service_1 = require("./document-extraction.service");
const client_1 = require("../../../generated/prisma/client");
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
};
let DocumentsService = class DocumentsService {
    prisma;
    extractionService;
    constructor(prisma, extractionService) {
        this.prisma = prisma;
        this.extractionService = extractionService;
    }
    async create(userId, dto, file) {
        if (dto.categoryId !== undefined) {
            await this.assertCategoryExists(dto.categoryId);
        }
        const document = await this.prisma.document.create({
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
        });
        if (file) {
            await this.extractionService.processDocument(document.id);
            const processed = await this.prisma.document.findUnique({
                where: { id: document.id },
                select: documentSelect,
            });
            return this.toResponse(processed);
        }
        return this.toResponse(document);
    }
    async findAll(userId) {
        const documents = await this.prisma.document.findMany({
            where: { userId },
            select: documentSelect,
            orderBy: { createdAt: "desc" },
        });
        return documents.map((document) => this.toResponse(document));
    }
    async findOne(userId, id) {
        const document = await this.prisma.document.findFirst({
            where: { id, userId },
            select: documentSelect,
        });
        if (!document) {
            throw new common_1.NotFoundException("Document not found");
        }
        return this.toResponse(document);
    }
    async getExtractedText(userId, id) {
        const document = await this.prisma.document.findFirst({
            where: { id, userId },
            select: {
                id: true,
                status: true,
                extractedText: true,
                processingError: true,
            },
        });
        if (!document) {
            throw new common_1.NotFoundException("Document not found");
        }
        if (document.status !== client_1.DocumentStatus.READY || !document.extractedText) {
            throw new common_1.BadRequestException(document.processingError ??
                "Extracted text is not available for this document yet.");
        }
        return { id: document.id, extractedText: document.extractedText };
    }
    async update(userId, id, dto) {
        await this.findOne(userId, id);
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
        return this.toResponse(document);
    }
    async remove(userId, id) {
        const document = await this.prisma.document.findFirst({
            where: { id, userId },
            select: { id: true, filePath: true },
        });
        if (!document) {
            throw new common_1.NotFoundException("Document not found");
        }
        await this.prisma.document.delete({ where: { id: document.id } });
        if (document.filePath) {
            const absolutePath = (0, node_path_1.join)(documents_upload_config_1.DOCUMENTS_UPLOAD_DIR, document.filePath);
            await (0, promises_1.unlink)(absolutePath).catch(() => {
                // The file may already be gone; the record deletion should not fail because of this.
            });
        }
        return { id: document.id, message: "Document deleted successfully" };
    }
    async getChunks(userId, id) {
        const document = await this.prisma.document.findFirst({
            where: { id, userId },
            select: { id: true },
        });
        if (!document) {
            throw new common_1.NotFoundException("Document not found");
        }
        const chunks = await this.prisma.$queryRaw `
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
    toResponse(document) {
        const { extractedText, _count, ...rest } = document;
        return {
            ...rest,
            hasExtractedText: Boolean(extractedText && extractedText.trim()),
            chunkCount: _count.chunks,
        };
    }
    async assertCategoryExists(categoryId) {
        const category = await this.prisma.category.findUnique({
            where: { id: categoryId },
        });
        if (!category) {
            throw new common_1.BadRequestException("Selected category does not exist");
        }
    }
};
exports.DocumentsService = DocumentsService;
exports.DocumentsService = DocumentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        document_extraction_service_1.DocumentExtractionService])
], DocumentsService);
