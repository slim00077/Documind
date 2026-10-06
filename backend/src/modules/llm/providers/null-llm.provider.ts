import { Injectable } from "@nestjs/common";
import type { ConversationTurn, LLMProvider, RetrievedChunk } from "../llm-provider";

/**
 * Default provider: makes no network calls and requires no installed model.
 * Keeps the LLMProvider abstraction fully wired and testable end-to-end
 * before a real backend (local, OpenAI, Gemini, ...) is configured via
 * LLM_PROVIDER.
 */
@Injectable()
export class NullLlmProvider implements LLMProvider {
  readonly providerName = "none";
  readonly modelName = "none";

  async generateAnswer(
    _question: string,
    _chunks: RetrievedChunk[],
    _history: ConversationTurn[] = [],
  ): Promise<string> {
    return (
      "No answer-generation provider is configured yet. Set LLM_PROVIDER " +
      '(e.g. "openai" or "gemini") and the matching API key to enable answers.'
    );
  }
}
