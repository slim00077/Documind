import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import {
  EMBEDDING_PROVIDER_TOKEN,
  type EmbeddingProvider,
} from "./embeddings/embedding-provider";

const CHUNK_COLUMN_DIMENSIONS = 384;

type ChunkNeedingEmbedding = {
  id: number;
  content: string;
};

@Injectable()
export class DocumentEmbeddingsService {
  private readonly logger = new Logger(DocumentEmbeddingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMBEDDING_PROVIDER_TOKEN)
    private readonly provider: EmbeddingProvider,
  ) {}

  /**
   * Generates and stores embeddings for every chunk of `documentId` that
   * does not already have one. Chunks that already have an embedding are
   * skipped, so calling this again on retry/reprocessing never redoes work
   * that already succeeded.
   */
  async embedDocumentChunks(documentId: number): Promise<number> {
    if (this.provider.dimensions !== CHUNK_COLUMN_DIMENSIONS) {
      throw new Error(
        `Embedding provider "${this.provider.providerName}" produces ${this.provider.dimensions}-dimensional ` +
          `vectors, but the DocumentChunk.embedding column is fixed at vector(${CHUNK_COLUMN_DIMENSIONS}). ` +
          "Configure the provider to output matching dimensions, or add a new migration to change the column size.",
      );
    }

    const pendingChunks = await this.prisma.$queryRaw<ChunkNeedingEmbedding[]>`
      SELECT id, content
      FROM "DocumentChunk"
      WHERE "documentId" = ${documentId} AND embedding IS NULL
      ORDER BY "chunkIndex" ASC
    `;

    if (pendingChunks.length === 0) {
      return 0;
    }

    const vectors = await this.provider.embed(
      pendingChunks.map((chunk) => chunk.content),
    );

    if (vectors.length !== pendingChunks.length) {
      throw new Error(
        `Embedding provider returned ${vectors.length} vectors for ${pendingChunks.length} chunks.`,
      );
    }

    for (let i = 0; i < pendingChunks.length; i++) {
      const chunk = pendingChunks[i];
      const vector = vectors[i];

      if (vector.length !== CHUNK_COLUMN_DIMENSIONS) {
        throw new Error(
          `Embedding provider returned a ${vector.length}-dimensional vector, expected ${CHUNK_COLUMN_DIMENSIONS}.`,
        );
      }

      await this.prisma.$executeRaw`
        UPDATE "DocumentChunk"
        SET embedding = ${this.toVectorLiteral(vector)}::vector
        WHERE id = ${chunk.id}
      `;
    }

    this.logger.log(
      `Embedded ${pendingChunks.length} chunk(s) for document ${documentId} using ${this.provider.providerName}/${this.provider.modelName}`,
    );

    return pendingChunks.length;
  }

  private toVectorLiteral(vector: number[]): string {
    return `[${vector.join(",")}]`;
  }
}
