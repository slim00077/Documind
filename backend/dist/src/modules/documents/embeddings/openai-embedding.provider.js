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
exports.OpenAiEmbeddingProvider = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const DEFAULT_MODEL = "text-embedding-3-small";
const DEFAULT_DIMENSIONS = 384;
const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
/**
 * Calls OpenAI's embeddings API. text-embedding-3-* models support an
 * explicit `dimensions` parameter (Matryoshka representation learning), so
 * this is requested to match the DocumentChunk.embedding column size
 * (vector(384)) regardless of the model's native output size.
 */
let OpenAiEmbeddingProvider = class OpenAiEmbeddingProvider {
    config;
    providerName = "openai";
    modelName;
    dimensions;
    apiKey;
    constructor(config) {
        this.config = config;
        this.modelName = this.config.get("EMBEDDING_MODEL", DEFAULT_MODEL);
        this.dimensions = Number(this.config.get("EMBEDDING_DIMENSIONS", String(DEFAULT_DIMENSIONS)));
        this.apiKey = this.config.get("OPENAI_API_KEY");
    }
    async embed(texts) {
        if (texts.length === 0) {
            return [];
        }
        if (!this.apiKey) {
            throw new common_1.InternalServerErrorException("OPENAI_API_KEY is not configured for the openai embedding provider.");
        }
        const response = await fetch(OPENAI_EMBEDDINGS_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: this.modelName,
                input: texts,
                dimensions: this.dimensions,
            }),
        });
        if (!response.ok) {
            const errorBody = await response.text().catch(() => "");
            throw new Error(`OpenAI embeddings request failed (${response.status}): ${errorBody.slice(0, 500)}`);
        }
        const body = (await response.json());
        return body.data
            .sort((a, b) => a.index - b.index)
            .map((item) => item.embedding);
    }
};
exports.OpenAiEmbeddingProvider = OpenAiEmbeddingProvider;
exports.OpenAiEmbeddingProvider = OpenAiEmbeddingProvider = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], OpenAiEmbeddingProvider);
