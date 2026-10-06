import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import {
  EMBEDDING_PROVIDER_TOKEN,
  type EmbeddingProvider,
} from "./embeddings/embedding-provider";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export type SearchResult = {
  chunkId: number;
  chunkIndex: number;
  content: string;
  distance: number;
  similarity: number;
  document: { id: number; name: string; status: string };
};

type SearchRow = {
  chunkId: number;
  chunkIndex: number;
  content: string;
  documentId: number;
  documentName: string;
  documentStatus: string;
  distance: number;
};

@Injectable()
export class DocumentSearchService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMBEDDING_PROVIDER_TOKEN)
    private readonly provider: EmbeddingProvider,
  ) {}

  async search(
    userId: number,
    query: string,
    limit?: number,
    documentId?: number,
  ) {
    const boundedLimit = Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

    const [queryVector] = await this.provider.embed([query]);
    const vectorLiteral = `[${queryVector.join(",")}]`;
    const documentFilter = documentId ?? null;

    // Raw SQL: Prisma has no typed support for pgvector's `vector` column or
    // its distance operators (<=>), so similarity search is expressed here
    // directly, scoped to the authenticated user's own documents only.
    // The documentFilter IS NULL branch keeps this a single parameterized
    // query rather than branching into two separate query strings.
    const rows = await this.prisma.$queryRaw<SearchRow[]>`
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
      WHERE (
        d."userId" = ${userId}
        OR EXISTS (
          SELECT 1 FROM "DocumentPermission" dp
          WHERE dp."documentId" = d.id AND dp."userId" = ${userId}
        )
      )
        AND d."deletedAt" IS NULL
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
}
