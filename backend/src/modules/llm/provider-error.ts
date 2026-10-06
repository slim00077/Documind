// Shared error contract every concrete LLMProvider implementation throws on
// failure, so the orchestrator (MultiProviderLlmService) can decide whether
// to retry the same provider, skip straight to the next one, or record a
// quota hit - without needing to know each provider's own HTTP conventions.
export type LlmErrorKind = "transient" | "fatal" | "quota" | "model-unavailable";

export type RateLimitInfo = {
  limitRequests?: number;
  remainingRequests?: number;
  limitTokens?: number;
  remainingTokens?: number;
  resetSeconds?: number;
};

export class LlmProviderError extends Error {
  constructor(
    message: string,
    readonly kind: LlmErrorKind,
    readonly status: number | null = null,
    readonly rateLimitInfo: RateLimitInfo | null = null,
  ) {
    super(message);
  }
}
