import type { AppLanguage } from "../../common/i18n/language";

export type RetrievedChunk = {
  content: string;
  documentName?: string;
  chunkIndex?: number;
  similarity?: number;
};

export type ConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

/** Per-request answer settings. `language` is the user's interface language for the answer text. */
export type AnswerOptions = {
  language?: AppLanguage;
};

/** JSON Schema subset (object/array/string/integer) shared by structured calls. */
export type JsonSchema = Record<string, unknown>;

export interface LLMProvider {
  readonly providerName: string;
  readonly modelName: string;
  generateAnswer(
    question: string,
    chunks: RetrievedChunk[],
    history?: ConversationTurn[],
    options?: AnswerOptions,
  ): Promise<string>;
  /**
   * Optional: returns a JSON value conforming to `schema`, using the
   * provider's native JSON/schema mode. Providers without it are still usable
   * through MultiProviderLlmService.generateStructured, which falls back to
   * generateAnswer plus tolerant JSON extraction. Resolves null when the
   * output can't be parsed.
   */
  generateStructured?(prompt: string, schema: JsonSchema): Promise<unknown | null>;
  /**
   * Optional: yields the answer as text chunks as they are generated.
   * Providers without it are still streamable - the orchestrator falls back
   * to generateAnswer and emits the whole answer as one chunk.
   */
  streamAnswer?(
    question: string,
    chunks: RetrievedChunk[],
    history?: ConversationTurn[],
    signal?: AbortSignal,
    options?: AnswerOptions,
  ): AsyncGenerator<string>;
}

export const LLM_PROVIDER_TOKEN = Symbol("LLM_PROVIDER_TOKEN");
