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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var DocumentEmbeddingsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentEmbeddingsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const embedding_provider_1 = require("./embeddings/embedding-provider");
const CHUNK_COLUMN_DIMENSIONS = 384;
let DocumentEmbeddingsService = DocumentEmbeddingsService_1 = class DocumentEmbeddingsService {
    prisma;
    provider;
    logger = new common_1.Logger(DocumentEmbeddingsService_1.name);
    constructor(prisma, provider) {
        this.prisma = prisma;
        this.provider = provider;
    }
    /**
     * Generates and stores embeddings for every chunk of `documentId` that
     * does not already have one. Chunks that already have an embedding are
     * skipped, so calling this again on retry/reprocessing never redoes work
     * that already succeeded.
     */
    async embedDocumentChunks(documentId) {
        if (this.provider.dimensions !== CHUNK_COLUMN_DIMENSIONS) {
            throw new Error(`Embedding provider "${this.provider.providerName}" produces ${this.provider.dimensions}-dimensional ` +
                `vectors, but the DocumentChunk.embedding column is fixed at vector(${CHUNK_COLUMN_DIMENSIONS}). ` +
                "Configure the provider to output matching dimensions, or add a new migration to change the column size.");
        }
        const pendingChunks = await this.prisma.$queryRaw `
      SELECT id, content
      FROM "DocumentChunk"
      WHERE "documentId" = ${documentId} AND embedding IS NULL
      ORDER BY "chunkIndex" ASC
    `;
        if (pendingChunks.length === 0) {
            return 0;
        }
        const vectors = await this.provider.embed(pendingChunks.map((chunk) => chunk.content));
        if (vectors.length !== pendingChunks.length) {
            throw new Error(`Embedding provider returned ${vectors.length} vectors for ${pendingChunks.length} chunks.`);
        }
        for (let i = 0; i < pendingChunks.length; i++) {
            const chunk = pendingChunks[i];
            const vector = vectors[i];
            if (vector.length !== CHUNK_COLUMN_DIMENSIONS) {
                throw new Error(`Embedding provider returned a ${vector.length}-dimensional vector, expected ${CHUNK_COLUMN_DIMENSIONS}.`);
            }
            await this.prisma.$executeRaw `
        UPDATE "DocumentChunk"
        SET embedding = ${this.toVectorLiteral(vector)}::vector
        WHERE id = ${chunk.id}
      `;
        }
        this.logger.log(`Embedded ${pendingChunks.length} chunk(s) for document ${documentId} using ${this.provider.providerName}/${this.provider.modelName}`);
        return pendingChunks.length;
    }
    toVectorLiteral(vector) {
        return `[${vector.join(",")}]`;
    }
};
exports.DocumentEmbeddingsService = DocumentEmbeddingsService;
exports.DocumentEmbeddingsService = DocumentEmbeddingsService = DocumentEmbeddingsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)(embedding_provider_1.EMBEDDING_PROVIDER_TOKEN)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, Object])
], DocumentEmbeddingsService);
