import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AnswerOptions, ConversationTurn, JsonSchema, LLMProvider, RetrievedChunk } from "../llm-provider";
import { parseJsonLoose } from "../structured";
import { buildRagPrompt } from "../build-rag-prompt";
import { LlmProviderError } from "../provider-error";
import { UsageMonitorService } from "../usage-monitor.service";
import { parseOpenAiCompatibleRateLimitHeaders } from "./rate-limit-headers";

// "openrouter/free" is OpenRouter's own self-updating router: it randomly
// picks from whichever models are currently free, so this default never
// goes stale the way pinning one specific ":free" model id eventually would.
const DEFAULT_MODEL = "openrouter/free";
const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

const FATAL_STATUS_CODES = new Set([400, 401, 403]);
const QUOTA_STATUS_CODES = new Set([429]);

type OpenRouterChatResponse = {
  choices: { message: { content: string } }[];
};

/**
 * Calls OpenRouter's OpenAI-compatible chat completions API. Fully
 * implemented but inert unless OPENROUTER_API_KEY is set and this provider
 * is included in LLM_PROVIDER_ORDER - never called by default.
 */
@Injectable()
export class OpenRouterLlmProvider implements LLMProvider {
  readonly providerName = "openrouter";
  readonly modelName: string;

  private readonly apiKey: string | undefined;
  private readonly logger = new Logger(OpenRouterLlmProvider.name);

  constructor(
    private readonly config: ConfigService,
    private readonly usageMonitor: UsageMonitorService,
  ) {
    this.modelName = this.config.get<string>("OPENROUTER_MODEL", DEFAULT_MODEL);
    this.apiKey = this.config.get<string>("OPENROUTER_API_KEY");
  }

  async generateAnswer(
    question: string,
    chunks: RetrievedChunk[],
    history: ConversationTurn[] = [],
    options: AnswerOptions = {},
  ): Promise<string> {
    return this.chat(buildRagPrompt(question, chunks, history, options));
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
        "OPENROUTER_API_KEY is not configured for the openrouter LLM provider.",
        "fatal",
      );
    }

    let response: Response;
    try {
      response = await fetch(OPENROUTER_CHAT_URL, {
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
        `OpenRouter chat completion failed (${response.status}): ${errorBody.slice(0, 2000)}`,
      );

      if (QUOTA_STATUS_CODES.has(response.status)) {
        throw new LlmProviderError("OpenRouter is rate-limited.", "quota", response.status, rateLimitInfo);
      }
      if (FATAL_STATUS_CODES.has(response.status)) {
        throw new LlmProviderError(
          "OpenRouter rejected the request (auth/config error).",
          "fatal",
          response.status,
        );
      }
      throw new LlmProviderError(
        `OpenRouter responded with ${response.status}`,
        "transient",
        response.status,
      );
    }

    const body = (await response.json()) as OpenRouterChatResponse;
    return body.choices[0]?.message.content ?? "";
  }
}
