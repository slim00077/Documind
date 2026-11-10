import { Injectable } from "@nestjs/common";
import type { AnswerOptions, ConversationTurn, LLMProvider, RetrievedChunk } from "../llm-provider";

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
    options: AnswerOptions = {},
  ): Promise<string> {
    if (options.language === "fr") {
      return (
        "Aucun fournisseur de génération de réponses n’est encore configuré. Définissez LLM_PROVIDER " +
        '(par exemple "openai" ou "gemini") et la clé d’API correspondante pour activer les réponses.'
      );
    }
    return (
      "No answer-generation provider is configured yet. Set LLM_PROVIDER " +
      '(e.g. "openai" or "gemini") and the matching API key to enable answers.'
    );
  }
}
