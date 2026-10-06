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
exports.MultiProviderLlmService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const build_rag_prompt_1 = require("./build-rag-prompt");
const provider_error_1 = require("./provider-error");
const token_estimate_1 = require("./token-estimate");
const usage_monitor_service_1 = require("./usage-monitor.service");
const gemini_llm_provider_1 = require("./providers/gemini-llm.provider");
const openrouter_llm_provider_1 = require("./providers/openrouter-llm.provider");
const groq_llm_provider_1 = require("./providers/groq-llm.provider");
const ollama_llm_provider_1 = require("./providers/ollama-llm.provider");
const null_llm_provider_1 = require("./providers/null-llm.provider");
const openai_llm_provider_1 = require("./providers/openai-llm.provider");
const DEFAULT_ORDER = ["gemini"];
const MAX_RETRIES_PER_PROVIDER = "LLM_MAX_RETRIES";
const DEFAULT_MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS_KEY = "LLM_RETRY_BASE_DELAY_MS";
const DEFAULT_BASE_RETRY_DELAY_MS = 300;
const RATE_LIMIT_MESSAGE = "The AI provider is rate-limited right now. Please try again in a moment.";
const PROVIDER_UNAVAILABLE_MESSAGE = "The AI provider could not generate an answer right now. Please try again shortly.";
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Implements LLMProvider itself, so AssistantService's dependency on
 * LLM_PROVIDER_TOKEN doesn't change - but underneath it fans out across an
 * ordered chain of concrete providers (Gemini, OpenRouter, Groq, a local
 * Ollama server), retrying the current one with backoff on transient
 * errors, skipping straight past auth/config errors and known quota hits,
 * and moving on to the next provider in the chain until one succeeds or the
 * whole chain is exhausted.
 */
let MultiProviderLlmService = class MultiProviderLlmService {
    usageMonitor;
    providerName = "multi-provider";
    modelName = "auto";
    logger = new common_1.Logger("LLM Failover");
    chain;
    maxRetries;
    baseRetryDelayMs;
    constructor(config, usageMonitor, gemini, openrouter, groq, ollama, nullProvider, openai) {
        this.usageMonitor = usageMonitor;
        const registry = {
            gemini,
            openrouter,
            groq,
            local: ollama,
            ollama,
            none: nullProvider,
            openai,
        };
        const orderConfig = config.get("LLM_PROVIDER_ORDER") ?? config.get("LLM_PROVIDER");
        const requestedIds = (orderConfig ?? DEFAULT_ORDER.join(","))
            .split(",")
            .map((id) => id.trim().toLowerCase())
            .filter(Boolean);
        const resolved = requestedIds
            .map((id) => ({ id: id === "ollama" ? "local" : id, provider: registry[id] }))
            .filter((entry) => {
            if (!entry.provider) {
                this.logger.warn(`LLM_PROVIDER_ORDER lists unknown provider "${entry.id}" - ignoring it. ` +
                    `Valid ids: gemini, openrouter, groq, local, none.`);
                return false;
            }
            return true;
        });
        this.chain = resolved.length ? resolved : [{ id: "none", provider: nullProvider }];
        this.maxRetries = config.get(MAX_RETRIES_PER_PROVIDER, DEFAULT_MAX_RETRIES);
        this.baseRetryDelayMs = config.get(BASE_RETRY_DELAY_MS_KEY, DEFAULT_BASE_RETRY_DELAY_MS);
        this.logger.log(`Configured provider order: ${this.chain.map((entry) => entry.id).join(" -> ")}`);
    }
    async generateAnswer(question, chunks, history = []) {
        // Built once, purely to size an ESTIMATED input-token count for the
        // usage monitor - every concrete provider builds its own prompt
        // identically via the same buildRagPrompt call.
        const estimatedInputTokens = (0, token_estimate_1.estimateTokens)((0, build_rag_prompt_1.buildRagPrompt)(question, chunks, history));
        let lastError;
        for (let i = 0; i < this.chain.length; i++) {
            const { id, provider } = this.chain[i];
            const nextId = this.chain[i + 1]?.id ?? null;
            if (this.usageMonitor.shouldSkip(id)) {
                this.logger.warn(`Skipping provider "${id}" - at/near its configured usage limit or recently rate-limited.`);
                continue;
            }
            const outcome = await this.tryProvider(id, provider, question, chunks, history, estimatedInputTokens);
            if (outcome.kind === "success") {
                return outcome.answer;
            }
            lastError = outcome.error;
            this.usageMonitor.recordFailover(id, nextId, `${outcome.error.kind} (${outcome.error.message})`);
        }
        // Every provider in the chain failed.
        this.logger.error(`All configured providers failed (${this.chain.map((entry) => entry.id).join(", ")}). Returning a safe error to the caller.`);
        if (lastError?.kind === "quota") {
            throw new common_1.HttpException(RATE_LIMIT_MESSAGE, 429);
        }
        throw new common_1.ServiceUnavailableException(PROVIDER_UNAVAILABLE_MESSAGE);
    }
    async tryProvider(id, provider, question, chunks, history, estimatedInputTokens) {
        let lastError;
        for (let attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
            this.usageMonitor.recordAttempt(id, provider.modelName);
            try {
                const answer = await provider.generateAnswer(question, chunks, history);
                this.usageMonitor.recordSuccess(id, provider.modelName, estimatedInputTokens, (0, token_estimate_1.estimateTokens)(answer));
                return { kind: "success", answer };
            }
            catch (error) {
                if (!(error instanceof provider_error_1.LlmProviderError)) {
                    // Not one of our providers' own errors - an unexpected bug rather
                    // than a provider failure, so let it propagate rather than
                    // silently swallowing it into a generic failover.
                    throw error;
                }
                lastError = error;
                if (error.kind === "fatal") {
                    this.usageMonitor.recordFailure(id, "fatal", error.message);
                    return { kind: "failed", error };
                }
                if (error.kind === "quota") {
                    this.usageMonitor.recordQuotaHit(id);
                    return { kind: "failed", error };
                }
                // transient (or model-unavailable, which behaves like transient at
                // this level - the concrete provider already tried its own
                // alternatives, if any, before surfacing this).
                const attemptsRemain = attempt <= this.maxRetries;
                if (attemptsRemain) {
                    const delay = this.baseRetryDelayMs * 2 ** (attempt - 1);
                    this.logger.warn(`Provider "${id}" attempt ${attempt} failed transiently (${error.message}); retrying in ${delay}ms`);
                    await sleep(delay);
                    continue;
                }
                this.usageMonitor.recordFailure(id, "transient (retries exhausted)", error.message);
            }
        }
        return { kind: "failed", error: lastError };
    }
};
exports.MultiProviderLlmService = MultiProviderLlmService;
exports.MultiProviderLlmService = MultiProviderLlmService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        usage_monitor_service_1.UsageMonitorService,
        gemini_llm_provider_1.GeminiLlmProvider,
        openrouter_llm_provider_1.OpenRouterLlmProvider,
        groq_llm_provider_1.GroqLlmProvider,
        ollama_llm_provider_1.OllamaLlmProvider,
        null_llm_provider_1.NullLlmProvider,
        openai_llm_provider_1.OpenAiLlmProvider])
], MultiProviderLlmService);
