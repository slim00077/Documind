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
var GroqLlmProvider_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroqLlmProvider = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const build_rag_prompt_1 = require("../build-rag-prompt");
const provider_error_1 = require("../provider-error");
const usage_monitor_service_1 = require("../usage-monitor.service");
const rate_limit_headers_1 = require("./rate-limit-headers");
// llama-3.1-8b-instant is on Groq's permanent free tier and is their
// fastest/cheapest current model - a reasonable default for a fallback
// provider that only needs to answer occasionally.
const DEFAULT_MODEL = "llama-3.1-8b-instant";
const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
const FATAL_STATUS_CODES = new Set([400, 401, 403]);
const QUOTA_STATUS_CODES = new Set([429]);
/**
 * Calls Groq's OpenAI-compatible chat completions API. Fully implemented
 * but inert unless GROQ_API_KEY is set and this provider is included in
 * LLM_PROVIDER_ORDER - never called by default.
 */
let GroqLlmProvider = GroqLlmProvider_1 = class GroqLlmProvider {
    config;
    usageMonitor;
    providerName = "groq";
    modelName;
    apiKey;
    logger = new common_1.Logger(GroqLlmProvider_1.name);
    constructor(config, usageMonitor) {
        this.config = config;
        this.usageMonitor = usageMonitor;
        this.modelName = this.config.get("GROQ_MODEL", DEFAULT_MODEL);
        this.apiKey = this.config.get("GROQ_API_KEY");
    }
    async generateAnswer(question, chunks, history = []) {
        if (!this.apiKey) {
            throw new provider_error_1.LlmProviderError("GROQ_API_KEY is not configured for the groq LLM provider.", "fatal");
        }
        const prompt = (0, build_rag_prompt_1.buildRagPrompt)(question, chunks, history);
        let response;
        try {
            response = await fetch(GROQ_CHAT_URL, {
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
        const rateLimitInfo = (0, rate_limit_headers_1.parseOpenAiCompatibleRateLimitHeaders)(response.headers);
        if (rateLimitInfo) {
            this.usageMonitor.recordRateLimitInfo(this.providerName, rateLimitInfo);
        }
        if (!response.ok) {
            const errorBody = await response.text().catch(() => "");
            this.logger.error(`Groq chat completion failed (${response.status}): ${errorBody.slice(0, 2000)}`);
            if (QUOTA_STATUS_CODES.has(response.status)) {
                throw new provider_error_1.LlmProviderError("Groq is rate-limited.", "quota", response.status, rateLimitInfo);
            }
            if (FATAL_STATUS_CODES.has(response.status)) {
                throw new provider_error_1.LlmProviderError("Groq rejected the request (auth/config error).", "fatal", response.status);
            }
            throw new provider_error_1.LlmProviderError(`Groq responded with ${response.status}`, "transient", response.status);
        }
        const body = (await response.json());
        return body.choices[0]?.message.content ?? "";
    }
};
exports.GroqLlmProvider = GroqLlmProvider;
exports.GroqLlmProvider = GroqLlmProvider = GroqLlmProvider_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        usage_monitor_service_1.UsageMonitorService])
], GroqLlmProvider);
