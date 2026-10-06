"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentsModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const auth_module_1 = require("../auth/auth.module");
const documents_controller_1 = require("./documents.controller");
const documents_service_1 = require("./documents.service");
const document_extraction_service_1 = require("./document-extraction.service");
const document_chunking_service_1 = require("./document-chunking.service");
const document_embeddings_service_1 = require("./document-embeddings.service");
const document_search_service_1 = require("./document-search.service");
const embedding_provider_1 = require("./embeddings/embedding-provider");
const local_embedding_provider_1 = require("./embeddings/local-embedding.provider");
const openai_embedding_provider_1 = require("./embeddings/openai-embedding.provider");
let DocumentsModule = class DocumentsModule {
};
exports.DocumentsModule = DocumentsModule;
exports.DocumentsModule = DocumentsModule = __decorate([
    (0, common_1.Module)({
        imports: [auth_module_1.AuthModule],
        controllers: [documents_controller_1.DocumentsController],
        providers: [
            documents_service_1.DocumentsService,
            document_extraction_service_1.DocumentExtractionService,
            document_chunking_service_1.DocumentChunkingService,
            document_embeddings_service_1.DocumentEmbeddingsService,
            document_search_service_1.DocumentSearchService,
            local_embedding_provider_1.LocalEmbeddingProvider,
            openai_embedding_provider_1.OpenAiEmbeddingProvider,
            {
                provide: embedding_provider_1.EMBEDDING_PROVIDER_TOKEN,
                inject: [config_1.ConfigService, local_embedding_provider_1.LocalEmbeddingProvider, openai_embedding_provider_1.OpenAiEmbeddingProvider],
                useFactory: (config, local, openai) => config.get("EMBEDDING_PROVIDER", "local") === "openai"
                    ? openai
                    : local,
            },
        ],
        exports: [document_search_service_1.DocumentSearchService],
    })
], DocumentsModule);
