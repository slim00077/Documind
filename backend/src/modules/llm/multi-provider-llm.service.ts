import { HttpException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ConversationTurn, JsonSchema, LLMProvider, RetrievedChunk } from "./llm-provider";
import { parseJsonLoose, withSchemaInstructions } from "./structured";
import { buildRagPrompt } from "./build-rag-prompt";
import { LlmProviderError } from "./provider-error";
import { estimateTokens } from "./token-estimate";
import { UsageMonitorService } from "./usage-monitor.service";
import { GeminiLlmProvider } from "./providers/gemini-llm.provider";
import { OpenRouterLlmProvider } from "./providers/openrouter-llm.provider";
import { GroqLlmProvider } from "./providers/groq-llm.provider";
import { OllamaLlmProvider } from "./providers/ollama-llm.provider";
import { NullLlmProvider } from "./providers/null-llm.provider";
import { OpenAiLlmProvider } from "./providers/openai-llm.provider";

const DEFAULT_ORDER = ["gemini"];
const MAX_RETRIES_PER_PROVIDER = "LLM_MAX_RETRIES";
const DEFAULT_MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS_KEY = "LLM_RETRY_BASE_DELAY_MS";
const DEFAULT_BASE_RETRY_DELAY_MS = 300;

const RATE_LIMIT_MESSAGE =
  "The AI provider is rate-limited right now. Please try again in a moment.";
const PROVIDER_UNAVAILABLE_MESSAGE =
  "The AI provider could not generate an answer right now. Please try again shortly.";

function sleep(ms: number): Promise<void> {
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
@Injectable()
export class MultiProviderLlmService implements LLMProvider {
  readonly providerName = "multi-provider";
  readonly modelName = "auto";

  private readonly logger = new Logger("LLM Failover");
  private readonly chain: { id: string; provider: LLMProvider }[];
  private readonly maxRetries: number;
  private readonly baseRetryDelayMs: number;

  constructor(
    config: ConfigService,
    private readonly usageMonitor: UsageMonitorService,
    gemini: GeminiLlmProvider,
    openrouter: OpenRouterLlmProvider,
    groq: GroqLlmProvider,
    ollama: OllamaLlmProvider,
    nullProvider: NullLlmProvider,
    openai: OpenAiLlmProvider,
  ) {
    const registry: Record<string, LLMProvider> = {
      gemini,
      openrouter,
      groq,
      local: ollama,
      ollama,
      none: nullProvider,
      openai,
    };

    const orderConfig =
      config.get<string>("LLM_PROVIDER_ORDER") ?? config.get<string>("LLM_PROVIDER");
    const requestedIds = (orderConfig ?? DEFAULT_ORDER.join(","))
      .split(",")
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean);

    const resolved = requestedIds
      .map((id) => ({ id: id === "ollama" ? "local" : id, provider: registry[id] }))
      .filter((entry): entry is { id: string; provider: LLMProvider } => {
        if (!entry.provider) {
          this.logger.warn(
            `LLM_PROVIDER_ORDER lists unknown provider "${entry.id}" - ignoring it. ` +
              `Valid ids: gemini, openrouter, groq, local, none.`,
          );
          return false;
        }
        return true;
      });

    this.chain = resolved.length ? resolved : [{ id: "none", provider: nullProvider }];
    this.maxRetries = config.get<number>(MAX_RETRIES_PER_PROVIDER, DEFAULT_MAX_RETRIES);
    this.baseRetryDelayMs = config.get<number>(
      BASE_RETRY_DELAY_MS_KEY,
      DEFAULT_BASE_RETRY_DELAY_MS,
    );

    this.logger.log(
      `Configured provider order: ${this.chain.map((entry) => entry.id).join(" -> ")}`,
    );
  }

  /** The configured fallback chain, in order, for the admin monitoring page. */
  getChain(): { id: string; model: string }[] {
    return this.chain.map((entry) => ({
      id: entry.id,
      model: entry.provider.modelName,
    }));
  }

  async generateAnswer(
    question: string,
    chunks: RetrievedChunk[],
    history: ConversationTurn[] = [],
  ): Promise<string> {
    // Built once, purely to size an ESTIMATED input-token count for the
    // usage monitor - every concrete provider builds its own prompt
    // identically via the same buildRagPrompt call.
    const estimatedInputTokens = estimateTokens(buildRagPrompt(question, chunks, history));

    let lastError: LlmProviderError | undefined;

    for (let i = 0; i < this.chain.length; i++) {
      const { id, provider } = this.chain[i];
      const nextId = this.chain[i + 1]?.id ?? null;

      if (this.usageMonitor.shouldSkip(id)) {
        this.usageMonitor.recordSkip(id);
        this.logger.warn(
          `Skipping provider "${id}" - at/near its configured usage limit or recently rate-limited.`,
        );
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
    this.logger.error(
      `All configured providers failed (${this.chain.map((entry) => entry.id).join(", ")}). Returning a safe error to the caller.`,
    );

    if (lastError?.kind === "quota") {
      throw new HttpException(RATE_LIMIT_MESSAGE, 429);
    }
    throw new ServiceUnavailableException(PROVIDER_UNAVAILABLE_MESSAGE);
  }

  /**
   * One structured (JSON) call with the same chain/skip/retry rules. Uses a
   * provider's native schema mode when it has one, otherwise falls back to
   * generateAnswer with schema instructions and tolerant JSON extraction.
   * Resolves null when the winning provider's output isn't valid JSON.
   */
  async generateStructured(prompt: string, schema: JsonSchema): Promise<unknown | null> {
    const estimatedInputTokens = estimateTokens(prompt);
    let lastError: LlmProviderError | undefined;

    for (let i = 0; i < this.chain.length; i++) {
      const { id, provider } = this.chain[i];
      const nextId = this.chain[i + 1]?.id ?? null;

      if (this.usageMonitor.shouldSkip(id)) {
        this.usageMonitor.recordSkip(id);
        continue;
      }

      const call = async (): Promise<unknown | null> =>
        provider.generateStructured
          ? provider.generateStructured(prompt, schema)
          : parseJsonLoose(
              await provider.generateAnswer(withSchemaInstructions(prompt, schema), [], []),
            );

      for (let attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
        this.usageMonitor.recordAttempt(id, provider.modelName);
        const startedAt = Date.now();
        try {
          const value = await call();
          this.usageMonitor.recordSuccess(
            id,
            provider.modelName,
            estimatedInputTokens,
            estimateTokens(JSON.stringify(value ?? "")),
            Date.now() - startedAt,
          );
          return value;
        } catch (error) {
          if (!(error instanceof LlmProviderError)) throw error;
          lastError = error;
          if (error.kind === "fatal") {
            this.usageMonitor.recordFailure(id, "fatal", error.message);
            break;
          }
          if (error.kind === "quota") {
            this.usageMonitor.recordQuotaHit(id);
            break;
          }
          if (attempt <= this.maxRetries) {
            await sleep(this.baseRetryDelayMs * 2 ** (attempt - 1));
            continue;
          }
          this.usageMonitor.recordFailure(id, "transient (retries exhausted)", error.message);
        }
      }
      this.usageMonitor.recordFailover(id, nextId, `${lastError?.kind} (${lastError?.message})`);
    }

    if (lastError?.kind === "quota") {
      throw new HttpException(RATE_LIMIT_MESSAGE, 429);
    }
    throw new ServiceUnavailableException(PROVIDER_UNAVAILABLE_MESSAGE);
  }

  /**
   * Streaming counterpart of generateAnswer with the same chain, skip and
   * retry rules. Failover/retry is only possible until a provider has
   * yielded its first chunk; after that, a failure ends the stream.
   */
  async *streamAnswer(
    question: string,
    chunks: RetrievedChunk[],
    history: ConversationTurn[] = [],
    signal?: AbortSignal,
  ): AsyncGenerator<string> {
    const estimatedInputTokens = estimateTokens(buildRagPrompt(question, chunks, history));
    let lastError: LlmProviderError | undefined;

    for (let i = 0; i < this.chain.length; i++) {
      const { id, provider } = this.chain[i];
      const nextId = this.chain[i + 1]?.id ?? null;

      if (this.usageMonitor.shouldSkip(id)) {
        this.usageMonitor.recordSkip(id);
        this.logger.warn(
          `Skipping provider "${id}" - at/near its configured usage limit or recently rate-limited.`,
        );
        continue;
      }

      let providerFailed = false;

      for (let attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
        signal?.throwIfAborted();
        this.usageMonitor.recordAttempt(id, provider.modelName);
        const startedAt = Date.now();
        let yielded = false;
        let output = "";

        try {
          const source = provider.streamAnswer
            ? provider.streamAnswer(question, chunks, history, signal)
            : (async function* () {
                yield await provider.generateAnswer(question, chunks, history);
              })();

          for await (const text of source) {
            yielded = true;
            output += text;
            yield text;
          }

          this.usageMonitor.recordSuccess(
            id,
            provider.modelName,
            estimatedInputTokens,
            estimateTokens(output),
            Date.now() - startedAt,
          );
          return;
        } catch (error) {
          if (signal?.aborted || !(error instanceof LlmProviderError)) throw error;

          if (yielded) {
            // Text already reached the client, so we can't switch provider.
            this.usageMonitor.recordFailure(id, "interrupted mid-stream", error.message);
            throw error;
          }

          lastError = error;

          if (error.kind === "fatal") {
            this.usageMonitor.recordFailure(id, "fatal", error.message);
            providerFailed = true;
            break;
          }
          if (error.kind === "quota") {
            this.usageMonitor.recordQuotaHit(id);
            providerFailed = true;
            break;
          }
          if (attempt <= this.maxRetries) {
            const delay = this.baseRetryDelayMs * 2 ** (attempt - 1);
            this.logger.warn(
              `Provider "${id}" attempt ${attempt} failed transiently (${error.message}); retrying in ${delay}ms`,
            );
            await sleep(delay);
            continue;
          }
          this.usageMonitor.recordFailure(id, "transient (retries exhausted)", error.message);
          providerFailed = true;
        }
      }

      if (providerFailed && lastError) {
        this.usageMonitor.recordFailover(id, nextId, `${lastError.kind} (${lastError.message})`);
      }
    }

    this.logger.error(
      `All configured providers failed (${this.chain.map((entry) => entry.id).join(", ")}). Returning a safe error to the caller.`,
    );

    if (lastError?.kind === "quota") {
      throw new HttpException(RATE_LIMIT_MESSAGE, 429);
    }
    throw new ServiceUnavailableException(PROVIDER_UNAVAILABLE_MESSAGE);
  }

  private async tryProvider(
    id: string,
    provider: LLMProvider,
    question: string,
    chunks: RetrievedChunk[],
    history: ConversationTurn[],
    estimatedInputTokens: number,
  ): Promise<{ kind: "success"; answer: string } | { kind: "failed"; error: LlmProviderError }> {
    let lastError: LlmProviderError | undefined;

    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
      this.usageMonitor.recordAttempt(id, provider.modelName);
      const startedAt = Date.now();

      try {
        const answer = await provider.generateAnswer(question, chunks, history);
        this.usageMonitor.recordSuccess(
          id,
          provider.modelName,
          estimatedInputTokens,
          estimateTokens(answer),
          Date.now() - startedAt,
        );
        return { kind: "success", answer };
      } catch (error) {
        if (!(error instanceof LlmProviderError)) {
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
          this.logger.warn(
            `Provider "${id}" attempt ${attempt} failed transiently (${error.message}); retrying in ${delay}ms`,
          );
          await sleep(delay);
          continue;
        }

        this.usageMonitor.recordFailure(id, "transient (retries exhausted)", error.message);
      }
    }

    return { kind: "failed", error: lastError! };
  }
}
