import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ConversationTurn, JsonSchema, LLMProvider, RetrievedChunk } from "../llm-provider";
import { parseJsonLoose } from "../structured";
import { buildRagPrompt } from "../build-rag-prompt";
import { LlmProviderError } from "../provider-error";

const DEFAULT_MODEL = "gpt-4o-mini";
const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

const FATAL_STATUS_CODES = new Set([400, 401, 403]);
const QUOTA_STATUS_CODES = new Set([429]);

type OpenAiChatResponse = {
  choices: { message: { content: string } }[];
};

/**
 * Calls OpenAI's chat completions API. Fully implemented but inert unless
 * OPENAI_API_KEY is set and this provider is included in LLM_PROVIDER_ORDER
 * - never called by default (not a free-tier provider).
 */
@Injectable()
export class OpenAiLlmProvider implements LLMProvider {
  readonly providerName = "openai";
  readonly modelName: string;

  private readonly apiKey: string | undefined;
  private readonly logger = new Logger(OpenAiLlmProvider.name);

  constructor(private readonly config: ConfigService) {
    this.modelName = this.config.get<string>("LLM_MODEL", DEFAULT_MODEL);
    this.apiKey = this.config.get<string>("OPENAI_API_KEY");
  }

  async generateAnswer(
    question: string,
    chunks: RetrievedChunk[],
    history: ConversationTurn[] = [],
  ): Promise<string> {
    return this.chat(buildRagPrompt(question, chunks, history));
  }

  /** Native JSON mode: response_format json_schema (OpenAI) / json_object. */
  async generateStructured(prompt: string, schema: JsonSchema): Promise<unknown | null> {
    const isOpenAi = this.providerName === "openai";
    const text = await this.chat(
      isOpenAi
        ? prompt
        : `${prompt}

Reply with a JSON object matching this JSON Schema:
${JSON.stringify(schema)}`,
      isOpenAi
        ? { type: "json_schema", json_schema: { name: "result", schema, strict: false } }
        : { type: "json_object" },
    );
    return parseJsonLoose(text);
  }

  private async chat(prompt: string, responseFormat?: Record<string, unknown>): Promise<string> {
    if (!this.apiKey) {
      throw new LlmProviderError(
        "OPENAI_API_KEY is not configured for the openai LLM provider.",
        "fatal",
      );
    }

    let response: Response;
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
          ...(responseFormat ? { response_format: responseFormat } : {}),
        }),
      });
    } catch (networkError) {
      throw new LlmProviderError(
        networkError instanceof Error ? networkError.message : String(networkError),
        "transient",
      );
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      this.logger.error(
        `OpenAI chat completion failed (${response.status}): ${errorBody.slice(0, 2000)}`,
      );

      if (QUOTA_STATUS_CODES.has(response.status)) {
        throw new LlmProviderError("OpenAI is rate-limited.", "quota", response.status);
      }
      if (FATAL_STATUS_CODES.has(response.status)) {
        throw new LlmProviderError(
          "OpenAI rejected the request (auth/config error).",
          "fatal",
          response.status,
        );
      }
      throw new LlmProviderError(
        `OpenAI responded with ${response.status}`,
        "transient",
        response.status,
      );
    }

    const body = (await response.json()) as OpenAiChatResponse;
    return body.choices[0]?.message.content ?? "";
  }
}
