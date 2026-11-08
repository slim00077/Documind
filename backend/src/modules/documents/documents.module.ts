import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthModule } from "../auth/auth.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { LlmModule } from "../llm/llm.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { DocumentComparisonService } from "./document-comparison.service";
import { DocumentInsightsService } from "./document-insights.service";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { DocumentExtractionService } from "./document-extraction.service";
import { DocumentChunkingService } from "./document-chunking.service";
import { DocumentEmbeddingsService } from "./document-embeddings.service";
import { DocumentIntelligenceService } from "./intelligence/document-intelligence.service";
import { CollectionInsightsService } from "./intelligence/collection-insights.service";
import { IntelligenceController } from "./intelligence/intelligence.controller";
import { DocumentSearchService } from "./document-search.service";
import {
  EMBEDDING_PROVIDER_TOKEN,
  type EmbeddingProvider,
} from "./embeddings/embedding-provider";
import { LocalEmbeddingProvider } from "./embeddings/local-embedding.provider";
import { OpenAiEmbeddingProvider } from "./embeddings/openai-embedding.provider";

@Module({
  imports: [AuthModule, AuditLogModule, LlmModule, NotificationsModule],
  controllers: [DocumentsController, IntelligenceController],
  providers: [
    DocumentsService,
    DocumentInsightsService,
    DocumentExtractionService,
    DocumentChunkingService,
    DocumentEmbeddingsService,
    DocumentSearchService,
    DocumentComparisonService,
    DocumentIntelligenceService,
    CollectionInsightsService,
    LocalEmbeddingProvider,
    OpenAiEmbeddingProvider,
    {
      provide: EMBEDDING_PROVIDER_TOKEN,
      inject: [ConfigService, LocalEmbeddingProvider, OpenAiEmbeddingProvider],
      useFactory: (
        config: ConfigService,
        local: LocalEmbeddingProvider,
        openai: OpenAiEmbeddingProvider,
      ): EmbeddingProvider =>
        config.get<string>("EMBEDDING_PROVIDER", "local") === "openai"
          ? openai
          : local,
    },
  ],
  exports: [DocumentSearchService],
})
export class DocumentsModule {}
