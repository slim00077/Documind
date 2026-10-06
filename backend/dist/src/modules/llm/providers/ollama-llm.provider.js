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
var OllamaLlmProvider_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaLlmProvider = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const build_rag_prompt_1 = require("../build-rag-prompt");
const provider_error_1 = require("../provider-error");
const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "llama3.2";
/**
 * Calls a local Ollama server's /api/generate endpoint. This is the final
 * fallback in the provider chain - no API key, no network egress, keeps
 * working (at reduced answer quality) when every cloud provider is
 * unavailable or out of quota. Requires Ollama to be installed and running
 * locally (`ollama serve`, with OLLAMA_MODEL pulled via `ollama pull`); if
 * it isn't reachable, this simply fails like any other unavailable provider
 * and the caller's overall request fails with a safe error if nothing else
 * in the chain succeeds either.
 */
let OllamaLlmProvider = OllamaLlmProvider_1 = class OllamaLlmProvider {
    config;
    providerName = "local";
    modelName;
    baseUrl;
    logger = new common_1.Logger(OllamaLlmProvider_1.name);
    constructor(config) {
        this.config = config;
        this.baseUrl = this.config.get("OLLAMA_BASE_URL", DEFAULT_BASE_URL);
        this.modelName = this.config.get("OLLAMA_MODEL", DEFAULT_MODEL);
    }
    async generateAnswer(question, chunks, history = []) {
        const prompt = (0, build_rag_prompt_1.buildRagPrompt)(question, chunks, history);
        let response;
        try {
            response = await fetch(`${this.baseUrl}/api/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: this.modelName,
                    prompt,
                    stream: false,
                }),
            });
        }
        catch (networkError) {
            throw new provider_error_1.LlmProviderError(`Local Ollama server is not reachable at ${this.baseUrl}: ${networkError instanceof Error ? networkError.message : String(networkError)}`, "transient");
        }
        if (!response.ok) {
            const errorBody = await response.text().catch(() => "");
            this.logger.error(`Ollama generate failed (${response.status}): ${errorBody.slice(0, 2000)}`);
            if (response.status === 404) {
                // Almost always means the model hasn't been pulled locally yet.
                throw new provider_error_1.LlmProviderError(`Ollama model "${this.modelName}" is not available - run "ollama pull ${this.modelName}".`, "fatal", response.status);
            }
            throw new provider_error_1.LlmProviderError(`Ollama responded with ${response.status}`, "transient", response.status);
        }
        const body = (await response.json());
        return body.response ?? "";
    }
};
exports.OllamaLlmProvider = OllamaLlmProvider;
exports.OllamaLlmProvider = OllamaLlmProvider = OllamaLlmProvider_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], OllamaLlmProvider);
