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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentSearchService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const embedding_provider_1 = require("./embeddings/embedding-provider");
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
let DocumentSearchService = class DocumentSearchService {
    prisma;
    provider;
    constructor(prisma, provider) {
        this.prisma = prisma;
        this.provider = provider;
    }
    async search(userId, query, limit, documentId) {
        const boundedLimit = Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
        const [queryVector] = await this.provider.embed([query]);
        const vectorLiteral = `[${queryVector.join(",")}]`;
        const documentFilter = documentId ?? null;
        // Raw SQL: Prisma has no typed support for pgvector's `vector` column or
        // its distance operators (<=>), so similarity search is expressed here
        // directly, scoped to the authenticated user's own documents only.
        // The documentFilter IS NULL branch keeps this a single parameterized
        // query rather than branching into two separate query strings.
        const rows = await this.prisma.$queryRaw `
      SELECT
        dc.id AS "chunkId",
        dc."chunkIndex" AS "chunkIndex",
        dc.content AS content,
        d.id AS "documentId",
        d.name AS "documentName",
        d.status AS "documentStatus",
        (dc.embedding <=> ${vectorLiteral}::vector) AS distance
      FROM "DocumentChunk" dc
      JOIN "Document" d ON d.id = dc."documentId"
      WHERE d."userId" = ${userId}
        AND dc.embedding IS NOT NULL
        AND (${documentFilter}::int IS NULL OR d.id = ${documentFilter}::int)
      ORDER BY dc.embedding <=> ${vectorLiteral}::vector ASC
      LIMIT ${boundedLimit}
    `;
        return {
            query,
            count: rows.length,
            results: rows.map((row) => ({
                chunkId: row.chunkId,
                chunkIndex: row.chunkIndex,
                content: row.content,
                distance: row.distance,
                similarity: 1 - row.distance,
                document: {
                    id: row.documentId,
                    name: row.documentName,
                    status: row.documentStatus,
                },
            })),
        };
    }
};
exports.DocumentSearchService = DocumentSearchService;
exports.DocumentSearchService = DocumentSearchService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)(embedding_provider_1.EMBEDDING_PROVIDER_TOKEN)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, Object])
], DocumentSearchService);
