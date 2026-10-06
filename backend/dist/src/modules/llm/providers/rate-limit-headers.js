"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseOpenAiCompatibleRateLimitHeaders = parseOpenAiCompatibleRateLimitHeaders;
function toNumber(value) {
    if (value === null)
        return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}
/**
 * Groq (and, when present, OpenRouter) expose OpenAI-style
 * `x-ratelimit-*` response headers with real, provider-reported quota
 * state. Returns null when a response carries none of them, so callers can
 * fall back to their own estimate instead.
 */
function parseOpenAiCompatibleRateLimitHeaders(headers) {
    const limitRequests = toNumber(headers.get("x-ratelimit-limit-requests"));
    const remainingRequests = toNumber(headers.get("x-ratelimit-remaining-requests"));
    const limitTokens = toNumber(headers.get("x-ratelimit-limit-tokens"));
    const remainingTokens = toNumber(headers.get("x-ratelimit-remaining-tokens"));
    const resetRequests = headers.get("x-ratelimit-reset-requests");
    if (limitRequests === undefined &&
        remainingRequests === undefined &&
        limitTokens === undefined &&
        remainingTokens === undefined) {
        return null;
    }
    return {
        limitRequests,
        remainingRequests,
        limitTokens,
        remainingTokens,
        resetSeconds: resetRequests ? parseGroqDuration(resetRequests) : undefined,
    };
}
// Groq formats reset durations like "2m59.56s" or "59.56s" rather than a
// plain number of seconds.
function parseGroqDuration(value) {
    const match = value.match(/^(?:(\d+)m)?(?:([\d.]+)s)?$/);
    if (!match)
        return undefined;
    const minutes = match[1] ? Number(match[1]) : 0;
    const seconds = match[2] ? Number(match[2]) : 0;
    return minutes * 60 + seconds;
}
