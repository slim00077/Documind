"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NullLlmProvider = void 0;
const common_1 = require("@nestjs/common");
/**
 * Default provider: makes no network calls and requires no installed model.
 * Keeps the LLMProvider abstraction fully wired and testable end-to-end
 * before a real backend (local, OpenAI, Gemini, ...) is configured via
 * LLM_PROVIDER.
 */
let NullLlmProvider = class NullLlmProvider {
    providerName = "none";
    modelName = "none";
    async generateAnswer(_question, _chunks, _history = []) {
        return ("No answer-generation provider is configured yet. Set LLM_PROVIDER " +
            '(e.g. "openai" or "gemini") and the matching API key to enable answers.');
    }
};
exports.NullLlmProvider = NullLlmProvider;
exports.NullLlmProvider = NullLlmProvider = __decorate([
    (0, common_1.Injectable)()
], NullLlmProvider);
