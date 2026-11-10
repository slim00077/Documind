import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AnswerOptions, ConversationTurn, JsonSchema, LLMProvider, RetrievedChunk } from "../llm-provider";
import { parseJsonLoose } from "../structured";
import { buildRagPrompt } from "../build-rag-prompt";
import { LlmProviderError } from "../provider-error";

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

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

type GeminiGenerateContentResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
};

type GeminiErrorKind = "transient" | "model-unavailable" | "fatal" | "quota";

class GeminiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly kind: GeminiErrorKind,
  ) {
    super(message);
  }
}

/** Pulls Google's own error message out of an error body, never echoing the API key. */
function describeGeminiError(status: number, body: string, apiKey?: string): string {
  let detail = body.trim();
  try {
    const parsed = JSON.parse(body) as { error?: { status?: string; message?: string } };
    if (parsed.error?.message) {
      detail = `${parsed.error.status ? `${parsed.error.status}: ` : ""}${parsed.error.message}`;
    }
  } catch {
    // Not JSON - fall back to the raw (truncated) body.
  }
  if (apiKey) detail = detail.split(apiKey).join("[redacted]");
  return `Gemini HTTP ${status}${detail ? ` - ${detail.slice(0, 500)}` : ""}`;
}

function sleep(ms: number): Promise<void> {
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
@Injectable()
export class GeminiLlmProvider implements LLMProvider {
  readonly providerName = "gemini";
  readonly modelName: string;

  private readonly candidateModels: string[];
  private readonly apiKey: string | undefined;
  private readonly logger = new Logger(GeminiLlmProvider.name);

  constructor(private readonly config: ConfigService) {
    this.modelName = this.config.get<string>("LLM_MODEL", DEFAULT_MODEL);
    this.apiKey = this.config.get<string>("GEMINI_API_KEY");

    const fallbackConfig = this.config.get<string>("LLM_FALLBACK_MODELS", "");
    const configuredFallbacks = fallbackConfig
      .split(",")
      .map((model) => model.trim())
      .filter(Boolean);
    const fallbackModels = configuredFallbacks.length
      ? configuredFallbacks
      : DEFAULT_FALLBACK_MODELS;

    // Always try the primary model first, then de-duplicate so a fallback
    // list that happens to repeat it (or itself) doesn't waste an attempt.
    this.candidateModels = [this.modelName, ...fallbackModels].filter(
      (model, index, all) => all.indexOf(model) === index,
    );
  }

  async generateAnswer(
    question: string,
    chunks: RetrievedChunk[],
    history: ConversationTurn[] = [],
    options: AnswerOptions = {},
  ): Promise<string> {
    return this.generateWithFallback([
      { text: buildRagPrompt(question, chunks, history, options) },
    ]);
  }

  /** Native structured output: responseMimeType + responseSchema. */
  async generateStructured(prompt: string, schema: JsonSchema): Promise<unknown | null> {
    const text = await this.generateWithFallback([{ text: prompt }], {
      responseMimeType: "application/json",
      responseSchema: schema,
    });
    return parseJsonLoose(text);
  }

  /**
   * Streams the answer via streamGenerateContent (SSE). Candidate models are
   * only cycled through while nothing has been yielded yet - once text has
   * reached the caller, a failure is surfaced as-is rather than restarting.
   */
  async *streamAnswer(
    question: string,
    chunks: RetrievedChunk[],
    history: ConversationTurn[] = [],
    signal?: AbortSignal,
    options: AnswerOptions = {},
  ): AsyncGenerator<string> {
    if (!this.apiKey) {
      throw new LlmProviderError(
        "GEMINI_API_KEY is not configured for the gemini LLM provider.",
        "fatal",
      );
    }

    const parts: GeminiPart[] = [{ text: buildRagPrompt(question, chunks, history, options) }];
    let lastError: LlmProviderError | undefined;

    for (const model of this.candidateModels) {
      let yielded = false;
      try {
        for await (const text of this.streamModel(model, parts, signal)) {
          yielded = true;
          yield text;
        }
        return;
      } catch (error) {
        if (!(error instanceof LlmProviderError) || yielded) throw error;
        lastError = error;
        if (error.kind === "fatal" || error.kind === "quota") throw error;
        this.logger.warn(
          `Gemini model "${model}" failed to start streaming (${error.message}); trying the next candidate model.`,
        );
      }
    }

    throw (
      lastError ??
      new LlmProviderError("All Gemini candidate models failed.", "transient")
    );
  }

  private async *streamModel(
    model: string,
    parts: GeminiPart[],
    signal?: AbortSignal,
  ): AsyncGenerator<string> {
    let response: Response;
    try {
      response = await fetch(`${GEMINI_API_BASE}/${model}:streamGenerateContent?alt=sse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey!,
        },
        body: JSON.stringify({ contents: [{ parts }] }),
        signal,
      });
    } catch (networkError) {
      if (signal?.aborted) throw networkError;
      throw new LlmProviderError(
        networkError instanceof Error ? networkError.message : String(networkError),
        "transient",
      );
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      this.logger.error(
        `Gemini streamGenerateContent failed for model "${model}" (${response.status}): ${errorBody.slice(0, 2000)}`,
      );
      const described = describeGeminiError(response.status, errorBody, this.apiKey);
      if (QUOTA_STATUS_CODES.has(response.status)) {
        throw new LlmProviderError(described, "quota", response.status);
      }
      if (FATAL_STATUS_CODES.has(response.status)) {
        throw new LlmProviderError(described, "fatal", response.status);
      }
      throw new LlmProviderError(
        described,
        MODEL_UNAVAILABLE_STATUS_CODES.has(response.status) ? "model-unavailable" : "transient",
        response.status,
      );
    }

    if (!response.body) {
      throw new LlmProviderError("Gemini returned an empty stream.", "transient");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      for await (const bytes of response.body as unknown as AsyncIterable<Uint8Array>) {
        buffer += decoder.decode(bytes, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          let event: GeminiGenerateContentResponse;
          try {
            event = JSON.parse(payload) as GeminiGenerateContentResponse;
          } catch {
            continue;
          }
          const text =
            event.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
          if (text) yield text;
        }
      }
    } catch (streamError) {
      if (signal?.aborted) throw streamError;
      throw new LlmProviderError(
        streamError instanceof Error ? streamError.message : String(streamError),
        "transient",
      );
    }
  }

  /**
   * Multimodal call: sends an image (or PDF) plus an instruction to Gemini and
   * returns its text reply. Shares the retry / model-fallback behavior of
   * generateAnswer.
   */
  async analyzeMedia(
    data: Buffer,
    mimeType: string,
    instruction: string,
  ): Promise<string> {
    return this.generateWithFallback([
      { inlineData: { mimeType, data: data.toString("base64") } },
      { text: instruction },
    ]);
  }

  private async generateWithFallback(
    parts: GeminiPart[],
    generationConfig?: Record<string, unknown>,
  ): Promise<string> {
    if (!this.apiKey) {
      throw new LlmProviderError(
        "GEMINI_API_KEY is not configured for the gemini LLM provider.",
        "fatal",
      );
    }

    let lastError: GeminiRequestError | undefined;

    for (const model of this.candidateModels) {
      for (let attempt = 1; attempt <= MAX_RETRIES_PER_MODEL + 1; attempt++) {
        try {
          return await this.callModel(model, parts, generationConfig);
        } catch (error) {
          if (!(error instanceof GeminiRequestError)) {
            throw error;
          }

          lastError = error;

          if (error.kind === "fatal") {
            // Same request, same key - every other Gemini model would fail
            // the same way, so there's nothing a retry can fix here.
            this.logger.error(
              `Gemini request failed non-transiently (${error.status}): ${error.message.slice(0, 2000)}`,
            );
            throw new LlmProviderError(error.message, "fatal", error.status);
          }

          if (error.kind === "quota") {
            // A 429 is almost always account/key-wide, not per-model, so
            // cycling through the other Gemini models won't help - surface
            // it immediately and let the caller move to another provider.
            this.logger.warn(
              `Gemini model "${model}" is rate-limited; not worth trying other Gemini models right now.`,
            );
            throw new LlmProviderError(error.message, "quota", error.status);
          }

          if (error.kind === "model-unavailable") {
            this.logger.warn(
              `Gemini model "${model}" is not available for this API key; trying the next candidate model.`,
            );
            break; // no point retrying a model id that doesn't exist
          }

          const attemptsRemainingForModel =
            attempt <= MAX_RETRIES_PER_MODEL;
          if (attemptsRemainingForModel) {
            const delay = BASE_RETRY_DELAY_MS * 2 ** (attempt - 1);
            this.logger.warn(
              `Gemini model "${model}" attempt ${attempt} failed (${error.status ?? "network error"}); retrying in ${delay}ms`,
            );
            await sleep(delay);
            continue;
          }

          this.logger.warn(
            `Gemini model "${model}" exhausted its retries; trying the next candidate model.`,
          );
        }
      }
    }

    // Every candidate model failed transiently.
    throw new LlmProviderError(
      lastError?.message ?? "All Gemini candidate models failed.",
      "transient",
      lastError?.status ?? null,
    );
  }

  private async callModel(
    model: string,
    parts: GeminiPart[],
    generationConfig?: Record<string, unknown>,
  ): Promise<string> {
    // Per Google's current guidance, the key goes in a header, never in the
    // URL - keeps it out of server access logs, proxies, and error messages
    // that might otherwise echo the request URL back.
    const url = `${GEMINI_API_BASE}/${model}:generateContent`;

    let response: Response;

    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey!,
        },
        body: JSON.stringify({
          contents: [{ parts }],
          ...(generationConfig ? { generationConfig } : {}),
        }),
      });
    } catch (networkError) {
      throw new GeminiRequestError(
        networkError instanceof Error ? networkError.message : String(networkError),
        null,
        "transient",
      );
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      // Log full upstream details server-side only; never return Google's
      // raw error body (which could include request/account specifics) to
      // the client.
      this.logger.error(
        `Gemini generateContent failed for model "${model}" (${response.status}): ${errorBody.slice(0, 2000)}`,
      );

      const kind: GeminiErrorKind = FATAL_STATUS_CODES.has(response.status)
        ? "fatal"
        : QUOTA_STATUS_CODES.has(response.status)
          ? "quota"
          : MODEL_UNAVAILABLE_STATUS_CODES.has(response.status)
            ? "model-unavailable"
            : "transient";

      throw new GeminiRequestError(
        describeGeminiError(response.status, errorBody, this.apiKey),
        response.status,
        kind,
      );
    }

    const body = (await response.json()) as GeminiGenerateContentResponse;
    return (
      body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? ""
    );
  }
}
