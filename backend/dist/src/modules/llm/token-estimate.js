"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateTokens = estimateTokens;
// Rough, provider-agnostic token estimate (~4 characters per token for
// English text). This is NOT an official count from any provider - it exists
// purely so the usage monitor has a number to log and compare against
// configured thresholds when a provider doesn't report real usage.
function estimateTokens(text) {
    if (!text)
        return 0;
    return Math.max(1, Math.ceil(text.length / 4));
}
