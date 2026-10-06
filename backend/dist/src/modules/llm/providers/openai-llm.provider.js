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
var OpenAiLlmProvider_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAiLlmProvider = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const build_rag_prompt_1 = require("../build-rag-prompt");
const provider_error_1 = require("../provider-error");
const DEFAULT_MODEL = "gpt-4o-mini";
const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const FATAL_STATUS_CODES = new Set([400, 401, 403]);
const QUOTA_STATUS_CODES = new Set([429]);
/**
 * Calls OpenAI's chat completions API. Fully implemented but inert unless
 * OPENAI_API_KEY is set and this provider is included in LLM_PROVIDER_ORDER
 * - never called by default (not a free-tier provider).
 */
let OpenAiLlmProvider = OpenAiLlmProvider_1 = class OpenAiLlmProvider {
    config;
    providerName = "openai";
    modelName;
    apiKey;
    logger = new common_1.Logger(OpenAiLlmProvider_1.name);
    constructor(config) {
        this.config = config;
        this.modelName = this.config.get("LLM_MODEL", DEFAULT_MODEL);
        this.apiKey = this.config.get("OPENAI_API_KEY");
    }
    async generateAnswer(question, chunks, history = []) {
        if (!this.apiKey) {
            throw new provider_error_1.LlmProviderError("OPENAI_API_KEY is not configured for the openai LLM provider.", "fatal");
        }
        const prompt = (0, build_rag_prompt_1.buildRagPrompt)(question, chunks, history);
        let response;
        try {
            response = await fetch(OPENAI_CHAT_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    model: this.modelName,
                    messages: [{ role: "user", content: prompt }],
                }),
            });
        }
        catch (networkError) {
            throw new provider_error_1.LlmProviderError(networkError instanceof Error ? networkError.message : String(networkError), "transient");
        }
        if (!response.ok) {
            const errorBody = await response.text().catch(() => "");
            this.logger.error(`OpenAI chat completion failed (${response.status}): ${errorBody.slice(0, 2000)}`);
            if (QUOTA_STATUS_CODES.has(response.status)) {
                throw new provider_error_1.LlmProviderError("OpenAI is rate-limited.", "quota", response.status);
            }
            if (FATAL_STATUS_CODES.has(response.status)) {
                throw new provider_error_1.LlmProviderError("OpenAI rejected the request (auth/config error).", "fatal", response.status);
            }
            throw new provider_error_1.LlmProviderError(`OpenAI responded with ${response.status}`, "transient", response.status);
        }
        const body = (await response.json());
        return body.choices[0]?.message.content ?? "";
    }
};
exports.OpenAiLlmProvider = OpenAiLlmProvider;
exports.OpenAiLlmProvider = OpenAiLlmProvider = OpenAiLlmProvider_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], OpenAiLlmProvider);
