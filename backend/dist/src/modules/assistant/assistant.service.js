"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var AssistantService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssistantService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const document_search_service_1 = require("../documents/document-search.service");
const llm_provider_1 = require("../llm/llm-provider");
const LLM_UNAVAILABLE_MESSAGE = "The assistant couldn't generate an answer right now. Please try again shortly.";
const CONTEXT_CHUNK_LIMIT = 5;
const MIN_RELEVANT_SIMILARITY = 0.2;
// Used only when the search was already scoped to one specific document
// (named explicitly, or the one the conversation was already discussing) -
// a vague follow-up can still be confidently grounded there at a lower bar
// than an open, unscoped search across every document would allow.
const SCOPED_MIN_RELEVANT_SIMILARITY = 0.12;
const NO_RELEVANT_CONTEXT_MESSAGE = "I couldn't find anything relevant in your documents to answer that question.";
// Generic follow-up phrasing ("summarize this", "explain section 4", "what
// does it say about...") carries no document name of its own, so when one
// matches we fall back to whichever document the conversation was last
// scoped to instead of searching across every document again.
const FOLLOW_UP_PATTERNS = [
    /\bthis (document|doc|file|report|handbook|paper)\b/i,
    /\bthe (document|doc|file|report|handbook|paper)\b/i,
    /\bsummarize\b/i,
    /\bsummary\b/i,
    /\bsection\s+\d+/i,
    /\bmain points?\b/i,
    /\bkey points?\b/i,
];
let AssistantService = AssistantService_1 = class AssistantService {
    prisma;
    searchService;
    llmProvider;
    logger = new common_1.Logger(AssistantService_1.name);
    constructor(prisma, searchService, llmProvider) {
        this.prisma = prisma;
        this.searchService = searchService;
        this.llmProvider = llmProvider;
    }
    async ask(userId, question, history = [], lastDocumentId = null) {
        const documents = await this.prisma.document.findMany({
            where: { userId },
            select: { id: true, name: true, originalName: true },
        });
        const referencedDocumentId = this.resolveDocumentReference(question, documents);
        const isFollowUp = this.looksLikeFollowUp(question);
        const scopeDocumentId = referencedDocumentId ?? (isFollowUp ? lastDocumentId ?? undefined : undefined);
        // A short, vague follow-up ("what about section 5?") often embeds too
        // weakly on its own to clear the similarity threshold, even though it's
        // perfectly clear in context. Folding in the most recent user turn gives
        // the embedder more to work with, without touching the embedding model,
        // the documents, or how they were chunked.
        const recentUserTurns = history
            .filter((turn) => turn.role === "user")
            .map((turn) => turn.content);
        const searchQuery = isFollowUp && recentUserTurns.length > 0
            ? `${recentUserTurns.join(" ")} ${question}`
            : question;
        let searchResult = await this.searchService.search(userId, searchQuery, CONTEXT_CHUNK_LIMIT, scopeDocumentId ?? undefined);
        let usedScope = Boolean(scopeDocumentId);
        // A document we're already confident about - named explicitly, or the
        // one this conversation was already discussing - carries less risk of
        // pulling in unrelated content, so a vague follow-up gets a lower bar to
        // clear than a completely open, unscoped search would.
        let relevant = searchResult.results.filter((result) => result.similarity >=
            (usedScope ? SCOPED_MIN_RELEVANT_SIMILARITY : MIN_RELEVANT_SIMILARITY));
        // A named/scoped document that doesn't actually contain relevant chunks
        // shouldn't silently fall through to an unrelated document's content -
        // but a stale "last document" follow-up guess is safe to relax and retry
        // as a normal, unscoped search (back at the stricter threshold).
        if (relevant.length === 0 && scopeDocumentId && !referencedDocumentId) {
            searchResult = await this.searchService.search(userId, searchQuery, CONTEXT_CHUNK_LIMIT);
            usedScope = false;
            relevant = searchResult.results.filter((result) => result.similarity >= MIN_RELEVANT_SIMILARITY);
        }
        if (relevant.length === 0) {
            return {
                question,
                answer: NO_RELEVANT_CONTEXT_MESSAGE,
                sources: [],
                matchedDocumentId: referencedDocumentId ?? null,
            };
        }
        const contextChunks = relevant.map((result) => ({
            content: result.content,
            documentName: result.document.name,
            chunkIndex: result.chunkIndex,
            similarity: result.similarity,
        }));
        let answer;
        try {
            answer = await this.llmProvider.generateAnswer(question, contextChunks, history);
        }
        catch (error) {
            if (error instanceof common_1.HttpException) {
                throw error;
            }
            this.logger.error("LLM provider threw an unexpected error", error instanceof Error ? error.stack : String(error));
            throw new common_1.ServiceUnavailableException(LLM_UNAVAILABLE_MESSAGE);
        }
        const matchedDocumentId = referencedDocumentId ?? relevant[0]?.document.id ?? null;
        return {
            question,
            answer,
            sources: relevant.map((result) => ({
                chunkId: result.chunkId,
                documentId: result.document.id,
                documentName: result.document.name,
                chunkIndex: result.chunkIndex,
                similarity: result.similarity,
            })),
            matchedDocumentId,
        };
    }
    /**
     * Looks for an explicit mention of a document's name (with or without its
     * file extension) inside the question, e.g. "In Angular_Exam_Handbook.docx,
     * what are the sections?". Matches the longest candidate name first so a
     * more specific title wins over a shorter substring of another document.
     */
    resolveDocumentReference(question, documents) {
        const normalizedQuestion = question.toLowerCase();
        const candidates = documents
            .flatMap((doc) => {
            const names = [doc.name, doc.originalName].filter((value) => Boolean(value && value.trim()));
            return names.map((name) => ({
                id: doc.id,
                name: name.toLowerCase(),
                nameWithoutExtension: name.replace(/\.[a-z0-9]+$/i, "").toLowerCase(),
            }));
        })
            .sort((a, b) => b.name.length - a.name.length);
        for (const candidate of candidates) {
            if (normalizedQuestion.includes(candidate.name) ||
                (candidate.nameWithoutExtension.length > 3 &&
                    normalizedQuestion.includes(candidate.nameWithoutExtension))) {
                return candidate.id;
            }
        }
        return null;
    }
    looksLikeFollowUp(question) {
        return FOLLOW_UP_PATTERNS.some((pattern) => pattern.test(question));
    }
};
exports.AssistantService = AssistantService;
exports.AssistantService = AssistantService = AssistantService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Inject)(llm_provider_1.LLM_PROVIDER_TOKEN)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        document_search_service_1.DocumentSearchService, Object])
], AssistantService);
