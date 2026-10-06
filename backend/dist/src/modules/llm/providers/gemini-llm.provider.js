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
var GeminiLlmProvider_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiLlmProvider = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const build_rag_prompt_1 = require("../build-rag-prompt");
const provider_error_1 = require("../provider-error");
const DEFAULT_MODEL = "gemini-3.6-flash";
// "gemini-flash-latest" is an alias Google keeps pointed at its current
// stable flash model, so it stays valid without us tracking version numbers;
// gemini-2.5-flash is kept behind it as a pinned, long-lived stable model.
const DEFAULT_FALLBACK_MODELS = ["gemini-flash-latest", "gemini-2.5-flash"];
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// Total attempts against a single model before moving on to the next
// candidate: 1 initial try + this many retries.
const MAX_RETRIES_PER_MODEL = 2;
const BASE_RETRY_DELAY_MS = 300;
// Bad request / auth problems fail identically no matter which model or how
// many times we retry, so they're treated as fatal rather than transient.
const FATAL_STATUS_CODES = new Set([400, 401, 403]);
// The requested model id doesn't exist for this API/key - retrying it is
// pointless, but a different candidate model may still work.
const MODEL_UNAVAILABLE_STATUS_CODES = new Set([404]);
const QUOTA_STATUS_CODES = new Set([429]);
class GeminiRequestError extends Error {
    status;
    kind;
    constructor(message, status, kind) {
        super(message);
        this.status = status;
        this.kind = kind;
    }
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Calls Google's Gemini generateContent API. Fully implemented but inert
 * unless LLM_PROVIDER=gemini and GEMINI_API_KEY are both set - never called
 * by default.
 *
 * Transient failures (429/5xx/network errors) are retried with exponential
 * backoff, then the next candidate model is tried; a model id that no longer
 * exists (404) is skipped immediately without wasting retries on it. Bad
 * request/auth errors (400/401/403) fail the same way regardless of model or
 * retry count, so they abort immediately instead of burning through the
 * whole candidate list.
 */
let GeminiLlmProvider = GeminiLlmProvider_1 = class GeminiLlmProvider {
    config;
    providerName = "gemini";
    modelName;
    candidateModels;
    apiKey;
    logger = new common_1.Logger(GeminiLlmProvider_1.name);
    constructor(config) {
        this.config = config;
        this.modelName = this.config.get("LLM_MODEL", DEFAULT_MODEL);
        this.apiKey = this.config.get("GEMINI_API_KEY");
        const fallbackConfig = this.config.get("LLM_FALLBACK_MODELS", "");
        const configuredFallbacks = fallbackConfig
            .split(",")
            .map((model) => model.trim())
            .filter(Boolean);
        const fallbackModels = configuredFallbacks.length
            ? configuredFallbacks
            : DEFAULT_FALLBACK_MODELS;
        // Always try the primary model first, then de-duplicate so a fallback
        // list that happens to repeat it (or itself) doesn't waste an attempt.
        this.candidateModels = [this.modelName, ...fallbackModels].filter((model, index, all) => all.indexOf(model) === index);
    }
    async generateAnswer(question, chunks, history = []) {
        if (!this.apiKey) {
            throw new provider_error_1.LlmProviderError("GEMINI_API_KEY is not configured for the gemini LLM provider.", "fatal");
        }
        const prompt = (0, build_rag_prompt_1.buildRagPrompt)(question, chunks, history);
        let lastError;
        for (const model of this.candidateModels) {
            for (let attempt = 1; attempt <= MAX_RETRIES_PER_MODEL + 1; attempt++) {
                try {
                    return await this.callModel(model, prompt);
                }
                catch (error) {
                    if (!(error instanceof GeminiRequestError)) {
                        throw error;
                    }
                    lastError = error;
                    if (error.kind === "fatal") {
                        // Same request, same key - every other Gemini model would fail
                        // the same way, so there's nothing a retry can fix here.
                        this.logger.error(`Gemini request failed non-transiently (${error.status}): ${error.message.slice(0, 2000)}`);
                        throw new provider_error_1.LlmProviderError("Gemini rejected the request (auth/config error).", "fatal", error.status);
                    }
                    if (error.kind === "quota") {
                        // A 429 is almost always account/key-wide, not per-model, so
                        // cycling through the other Gemini models won't help - surface
                        // it immediately and let the caller move to another provider.
                        this.logger.warn(`Gemini model "${model}" is rate-limited; not worth trying other Gemini models right now.`);
                        throw new provider_error_1.LlmProviderError("Gemini is rate-limited.", "quota", error.status);
                    }
                    if (error.kind === "model-unavailable") {
                        this.logger.warn(`Gemini model "${model}" is not available for this API key; trying the next candidate model.`);
                        break; // no point retrying a model id that doesn't exist
                    }
                    const attemptsRemainingForModel = attempt <= MAX_RETRIES_PER_MODEL;
                    if (attemptsRemainingForModel) {
                        const delay = BASE_RETRY_DELAY_MS * 2 ** (attempt - 1);
                        this.logger.warn(`Gemini model "${model}" attempt ${attempt} failed (${error.status ?? "network error"}); retrying in ${delay}ms`);
                        await sleep(delay);
                        continue;
                    }
                    this.logger.warn(`Gemini model "${model}" exhausted its retries; trying the next candidate model.`);
                }
            }
        }
        // Every candidate model failed transiently.
        throw new provider_error_1.LlmProviderError(lastError?.message ?? "All Gemini candidate models failed.", "transient", lastError?.status ?? null);
    }
    async callModel(model, prompt) {
        // Per Google's current guidance, the key goes in a header, never in the
        // URL - keeps it out of server access logs, proxies, and error messages
        // that might otherwise echo the request URL back.
        const url = `${GEMINI_API_BASE}/${model}:generateContent`;
        let response;
        try {
            response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": this.apiKey,
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                }),
            });
        }
        catch (networkError) {
            throw new GeminiRequestError(networkError instanceof Error ? networkError.message : String(networkError), null, "transient");
        }
        if (!response.ok) {
            const errorBody = await response.text().catch(() => "");
            // Log full upstream details server-side only; never return Google's
            // raw error body (which could include request/account specifics) to
            // the client.
            this.logger.error(`Gemini generateContent failed for model "${model}" (${response.status}): ${errorBody.slice(0, 2000)}`);
            const kind = FATAL_STATUS_CODES.has(response.status)
                ? "fatal"
                : QUOTA_STATUS_CODES.has(response.status)
                    ? "quota"
                    : MODEL_UNAVAILABLE_STATUS_CODES.has(response.status)
                        ? "model-unavailable"
                        : "transient";
            throw new GeminiRequestError(`Gemini responded with ${response.status}`, response.status, kind);
        }
        const body = (await response.json());
        return (body.candidates[0]?.content.parts.map((part) => part.text).join("") ?? "");
    }
};
exports.GeminiLlmProvider = GeminiLlmProvider;
exports.GeminiLlmProvider = GeminiLlmProvider = GeminiLlmProvider_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], GeminiLlmProvider);
