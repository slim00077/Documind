import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AnswerOptions, ConversationTurn, JsonSchema, LLMProvider, RetrievedChunk } from "../llm-provider";
import { parseJsonLoose } from "../structured";
import { buildRagPrompt } from "../build-rag-prompt";
import { LlmProviderError } from "../provider-error";

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "llama3.2";

type OllamaGenerateResponse = {
  response: string;
};

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
@Injectable()
export class OllamaLlmProvider implements LLMProvider {
  readonly providerName = "local";
  readonly modelName: string;

  private readonly baseUrl: string;
  private readonly logger = new Logger(OllamaLlmProvider.name);

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>("OLLAMA_BASE_URL", DEFAULT_BASE_URL);
    this.modelName = this.config.get<string>("OLLAMA_MODEL", DEFAULT_MODEL);
  }

  async generateAnswer(
    question: string,
    chunks: RetrievedChunk[],
    history: ConversationTurn[] = [],
    options: AnswerOptions = {},
  ): Promise<string> {
    return this.generate(buildRagPrompt(question, chunks, history, options));
  }

  /** Native structured output: Ollama's `format` accepts a JSON schema. */
  async generateStructured(prompt: string, schema: JsonSchema): Promise<unknown | null> {
    return parseJsonLoose(await this.generate(prompt, schema));
  }

  private async generate(prompt: string, format?: JsonSchema): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.modelName,
          prompt,
          stream: false,
          ...(format ? { format } : {}),
        }),
      });
    } catch (networkError) {
      throw new LlmProviderError(
        `Local Ollama server is not reachable at ${this.baseUrl}: ${
          networkError instanceof Error ? networkError.message : String(networkError)
        }`,
        // Not installed/running: retrying only delays failover, so skip
        // straight to the next provider. It is re-tried on the next request.
        "fatal",
      );
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      this.logger.error(
        `Ollama generate failed (${response.status}): ${errorBody.slice(0, 2000)}`,
      );

      if (response.status === 404) {
        // Almost always means the model hasn't been pulled locally yet.
        throw new LlmProviderError(
          `Ollama model "${this.modelName}" is not available - run "ollama pull ${this.modelName}".`,
          "fatal",
          response.status,
        );
      }

      throw new LlmProviderError(
        `Ollama responded with ${response.status}`,
        "transient",
        response.status,
      );
    }

    const body = (await response.json()) as OllamaGenerateResponse;
    return body.response ?? "";
  }
}
