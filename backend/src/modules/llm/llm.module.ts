import { Module } from "@nestjs/common";
import { LLM_PROVIDER_TOKEN } from "./llm-provider";
import { NullLlmProvider } from "./providers/null-llm.provider";
import { OpenAiLlmProvider } from "./providers/openai-llm.provider";
import { GeminiLlmProvider } from "./providers/gemini-llm.provider";
import { OpenRouterLlmProvider } from "./providers/openrouter-llm.provider";
import { GroqLlmProvider } from "./providers/groq-llm.provider";
import { OllamaLlmProvider } from "./providers/ollama-llm.provider";
import { UsageMonitorService } from "./usage-monitor.service";
import { MultiProviderLlmService } from "./multi-provider-llm.service";
import { MediaAnalysisService } from "./media-analysis.service";

@Module({
  providers: [
    NullLlmProvider,
    OpenAiLlmProvider,
    GeminiLlmProvider,
    OpenRouterLlmProvider,
    GroqLlmProvider,
    OllamaLlmProvider,
    UsageMonitorService,
    MultiProviderLlmService,
    MediaAnalysisService,
    {
      provide: LLM_PROVIDER_TOKEN,
      useExisting: MultiProviderLlmService,
    },
  ],
  exports: [
    LLM_PROVIDER_TOKEN,
    UsageMonitorService,
    MultiProviderLlmService,
    MediaAnalysisService,
  ],
})
export class LlmModule {}
