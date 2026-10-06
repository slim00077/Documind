import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ConversationTurn, JsonSchema, LLMProvider, RetrievedChunk } from "../llm-provider";
import { parseJsonLoose } from "../structured";
import { buildRagPrompt } from "../build-rag-prompt";
import { LlmProviderError } from "../provider-error";
import { UsageMonitorService } from "../usage-monitor.service";
import { parseOpenAiCompatibleRateLimitHeaders } from "./rate-limit-headers";

// llama-3.1-8b-instant is on Groq's permanent free tier and is their
// fastest/cheapest current model - a reasonable default for a fallback
// provider that only needs to answer occasionally.
const DEFAULT_MODEL = "llama-3.1-8b-instant";
const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

const FATAL_STATUS_CODES = new Set([400, 401, 403]);
const QUOTA_STATUS_CODES = new Set([429]);

type GroqChatResponse = {
  choices: { message: { content: string } }[];
};

/**
 * Calls Groq's OpenAI-compatible chat completions API. Fully implemented
 * but inert unless GROQ_API_KEY is set and this provider is included in
 * LLM_PROVIDER_ORDER - never called by default.
 */
@Injectable()
export class GroqLlmProvider implements LLMProvider {
  readonly providerName = "groq";
  readonly modelName: string;

  private readonly apiKey: string | undefined;
  private readonly logger = new Logger(GroqLlmProvider.name);

  constructor(
    private readonly config: ConfigService,
    private readonly usageMonitor: UsageMonitorService,
  ) {
    this.modelName = this.config.get<string>("GROQ_MODEL", DEFAULT_MODEL);
    this.apiKey = this.config.get<string>("GROQ_API_KEY");
  }

  async generateAnswer(
    question: string,
    chunks: RetrievedChunk[],
    history: ConversationTurn[] = [],
  ): Promise<string> {
    return this.chat(buildRagPrompt(question, chunks, history));
  }

  /** Native JSON mode: response_format json_object. */
  async generateStructured(prompt: string, schema: JsonSchema): Promise<unknown | null> {
    const text = await this.chat(
      `${prompt}

Reply with a JSON object matching this JSON Schema:
${JSON.stringify(schema)}`,
      { type: "json_object" },
    );
    return parseJsonLoose(text);
  }

  private async chat(prompt: string, responseFormat?: Record<string, unknown>): Promise<string> {
    if (!this.apiKey) {
      throw new LlmProviderError(
        "GROQ_API_KEY is not configured for the groq LLM provider.",
        "fatal",
      );
    }

    let response: Response;
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
          ...(responseFormat ? { response_format: responseFormat } : {}),
        }),
      });
    } catch (networkError) {
      throw new LlmProviderError(
        networkError instanceof Error ? networkError.message : String(networkError),
        "transient",
      );
    }

    const rateLimitInfo = parseOpenAiCompatibleRateLimitHeaders(response.headers);
    if (rateLimitInfo) {
      this.usageMonitor.recordRateLimitInfo(this.providerName, rateLimitInfo);
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      this.logger.error(
        `Groq chat completion failed (${response.status}): ${errorBody.slice(0, 2000)}`,
      );

      if (QUOTA_STATUS_CODES.has(response.status)) {
        throw new LlmProviderError("Groq is rate-limited.", "quota", response.status, rateLimitInfo);
      }
      if (FATAL_STATUS_CODES.has(response.status)) {
        throw new LlmProviderError(
          "Groq rejected the request (auth/config error).",
          "fatal",
          response.status,
        );
      }
      throw new LlmProviderError(
        `Groq responded with ${response.status}`,
        "transient",
        response.status,
      );
    }

    const body = (await response.json()) as GroqChatResponse;
    return body.choices[0]?.message.content ?? "";
  }
}
