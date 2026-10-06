// Rough, provider-agnostic token estimate (~4 characters per token for
// English text). This is NOT an official count from any provider - it exists
// purely so the usage monitor has a number to log and compare against
// configured thresholds when a provider doesn't report real usage.
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}
