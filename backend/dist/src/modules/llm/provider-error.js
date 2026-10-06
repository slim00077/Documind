"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LlmProviderError = void 0;
class LlmProviderError extends Error {
    kind;
    status;
    rateLimitInfo;
    constructor(message, kind, status = null, rateLimitInfo = null) {
        super(message);
        this.kind = kind;
        this.status = status;
        this.rateLimitInfo = rateLimitInfo;
    }
}
exports.LlmProviderError = LlmProviderError;
