"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LlmModule = void 0;
const common_1 = require("@nestjs/common");
const llm_provider_1 = require("./llm-provider");
const null_llm_provider_1 = require("./providers/null-llm.provider");
const openai_llm_provider_1 = require("./providers/openai-llm.provider");
const gemini_llm_provider_1 = require("./providers/gemini-llm.provider");
const openrouter_llm_provider_1 = require("./providers/openrouter-llm.provider");
const groq_llm_provider_1 = require("./providers/groq-llm.provider");
const ollama_llm_provider_1 = require("./providers/ollama-llm.provider");
const usage_monitor_service_1 = require("./usage-monitor.service");
const multi_provider_llm_service_1 = require("./multi-provider-llm.service");
let LlmModule = class LlmModule {
};
exports.LlmModule = LlmModule;
exports.LlmModule = LlmModule = __decorate([
    (0, common_1.Module)({
        providers: [
            null_llm_provider_1.NullLlmProvider,
            openai_llm_provider_1.OpenAiLlmProvider,
            gemini_llm_provider_1.GeminiLlmProvider,
            openrouter_llm_provider_1.OpenRouterLlmProvider,
            groq_llm_provider_1.GroqLlmProvider,
            ollama_llm_provider_1.OllamaLlmProvider,
            usage_monitor_service_1.UsageMonitorService,
            multi_provider_llm_service_1.MultiProviderLlmService,
            {
                provide: llm_provider_1.LLM_PROVIDER_TOKEN,
                useExisting: multi_provider_llm_service_1.MultiProviderLlmService,
            },
        ],
        exports: [llm_provider_1.LLM_PROVIDER_TOKEN],
    })
], LlmModule);
