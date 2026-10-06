import {
  HttpException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { SearchResult } from "../documents/document-search.service";
import { DocumentSearchService } from "../documents/document-search.service";
import {
  LLM_PROVIDER_TOKEN,
  type ConversationTurn,
  type LLMProvider,
  type RetrievedChunk,
} from "../llm/llm-provider";

const LLM_UNAVAILABLE_MESSAGE =
  "The assistant couldn't generate an answer right now. Please try again shortly.";

const CONTEXT_CHUNK_LIMIT = 5;
const MIN_RELEVANT_SIMILARITY = 0.2;
// Used only when the search was already scoped to one specific document
// (named explicitly, or the one the conversation was already discussing) -
// a vague follow-up can still be confidently grounded there at a lower bar
// than an open, unscoped search across every document would allow.
const SCOPED_MIN_RELEVANT_SIMILARITY = 0.12;
const SCOPED_FALLBACK_CHUNK_LIMIT = 3;

const NO_RELEVANT_CONTEXT_MESSAGE =
  "I couldn't find anything relevant in your documents to answer that question.";

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
  // References back to something said earlier in the conversation.
  /\b(first|second|third|fourth|fifth|last|previous|next|other|same|former|latter)\b/i,
  /\b(it|that|those|these|them|one|ones)\b/i,
  /^\s*(and|what about|how about|why|how so)\b/i,
];

// Caps on conversation text fed into retrieval, so a long chat can't bloat
// the embedding query.
const SEARCH_HISTORY_USER_TURNS = 2;
const SEARCH_TURN_MAX_CHARS = 300;

export type AssistantSource = {
  chunkId: number;
  documentId: number;
  documentName: string;
  chunkIndex: number;
  similarity: number;
  /** Set when the passage came from an image, chart, diagram or scanned page. */
  visual?: { label: string; documentIsImage: boolean } | null;
};

type VisualItem = { source: string; ocrText: string; description: string };

const normalizeSpace = (value: string) => value.replace(/\s+/g, " ").trim();

export type AssistantAnswer = {
  question: string;
  answer: string;
  sources: AssistantSource[];
  matchedDocumentId: number | null;
};

export type AssistantStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; result: AssistantAnswer };

type Retrieval =
  | { direct: AssistantAnswer }
  | {
      contextChunks: RetrievedChunk[];
      relevant: SearchResult[];
      matchedDocumentId: number | null;
    };

type DocumentRef = { id: number; name: string; originalName: string | null };

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly searchService: DocumentSearchService,
    @Inject(LLM_PROVIDER_TOKEN) private readonly llmProvider: LLMProvider,
  ) {}

  async ask(
    userId: number,
    question: string,
    history: ConversationTurn[] = [],
    lastDocumentId: number | null = null,
    scopedDocumentId: number | null = null,
  ): Promise<AssistantAnswer> {
    const retrieval = await this.retrieve(userId, question, history, lastDocumentId, scopedDocumentId);
    if ("direct" in retrieval) return retrieval.direct;

    let answer: string;
    try {
      answer = await this.llmProvider.generateAnswer(question, retrieval.contextChunks, history);
    } catch (error) {
      throw this.toClientError(error);
    }

    return {
      question,
      answer,
      sources: await this.buildSources(retrieval.relevant),
      matchedDocumentId: retrieval.matchedDocumentId,
    };
  }

  /**
   * Same retrieval and prompt as ask(), but yields the answer text as the
   * provider produces it. Sources are computed up front and returned with the
   * final "done" event. Cancelling via the signal stops the provider call.
   */
  async *askStream(
    userId: number,
    question: string,
    history: ConversationTurn[] = [],
    lastDocumentId: number | null = null,
    scopedDocumentId: number | null = null,
    signal?: AbortSignal,
  ): AsyncGenerator<AssistantStreamEvent> {
    const retrieval = await this.retrieve(userId, question, history, lastDocumentId, scopedDocumentId);

    if ("direct" in retrieval) {
      yield { type: "delta", text: retrieval.direct.answer };
      yield { type: "done", result: retrieval.direct };
      return;
    }

    const sources = await this.buildSources(retrieval.relevant);
    let answer = "";

    try {
      for await (const text of this.streamFromProvider(question, retrieval.contextChunks, history, signal)) {
        answer += text;
        yield { type: "delta", text };
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      throw this.toClientError(error);
    }

    yield {
      type: "done",
      result: { question, answer, sources, matchedDocumentId: retrieval.matchedDocumentId },
    };
  }

  private streamFromProvider(
    question: string,
    chunks: RetrievedChunk[],
    history: ConversationTurn[],
    signal?: AbortSignal,
  ): AsyncGenerator<string> {
    const provider = this.llmProvider;
    if (provider.streamAnswer) {
      return provider.streamAnswer(question, chunks, history, signal);
    }
    return (async function* () {
      yield await provider.generateAnswer(question, chunks, history);
    })();
  }

  private toClientError(error: unknown): Error {
    if (error instanceof HttpException) return error;
    this.logger.error(
      "LLM provider threw an unexpected error",
      error instanceof Error ? error.stack : String(error),
    );
    return new ServiceUnavailableException(LLM_UNAVAILABLE_MESSAGE);
  }

  private async retrieve(
    userId: number,
    question: string,
    history: ConversationTurn[],
    lastDocumentId: number | null,
    scopedDocumentId: number | null,
  ): Promise<Retrieval> {
    if (scopedDocumentId !== null) {
      return this.retrieveScoped(userId, question, history, scopedDocumentId);
    }

    const documents = await this.prisma.document.findMany({
      where: {
        deletedAt: null,
        OR: [{ userId }, { permissions: { some: { userId } } }],
      },
      select: { id: true, name: true, originalName: true },
    });

    const referencedDocumentId = this.resolveDocumentReference(
      question,
      documents,
    );

    const isFollowUp = history.length > 0 && this.looksLikeFollowUp(question);
    const scopeDocumentId =
      referencedDocumentId ?? (isFollowUp ? lastDocumentId ?? undefined : undefined);

    // A short, vague follow-up ("what about section 5?") often embeds too
    // weakly on its own to clear the similarity threshold, even though it's
    // perfectly clear in context, so recent turns are folded into the query.
    const searchQuery = isFollowUp ? this.buildSearchQuery(question, history) : question;

    let searchResult = await this.searchService.search(
      userId,
      searchQuery,
      CONTEXT_CHUNK_LIMIT,
      scopeDocumentId ?? undefined,
    );
    let usedScope = Boolean(scopeDocumentId);

    // A document we're already confident about - named explicitly, or the
    // one this conversation was already discussing - carries less risk of
    // pulling in unrelated content, so a vague follow-up gets a lower bar to
    // clear than a completely open, unscoped search would.
    let relevant = searchResult.results.filter(
      (result) =>
        result.similarity >=
        (usedScope ? SCOPED_MIN_RELEVANT_SIMILARITY : MIN_RELEVANT_SIMILARITY),
    );

    // A named/scoped document that doesn't actually contain relevant chunks
    // shouldn't silently fall through to an unrelated document's content -
    // but a stale "last document" follow-up guess is safe to relax and retry
    // as a normal, unscoped search (back at the stricter threshold).
    if (relevant.length === 0 && scopeDocumentId && !referencedDocumentId) {
      searchResult = await this.searchService.search(
        userId,
        searchQuery,
        CONTEXT_CHUNK_LIMIT,
      );
      usedScope = false;
      relevant = searchResult.results.filter(
        (result) => result.similarity >= MIN_RELEVANT_SIMILARITY,
      );
    }

    if (relevant.length === 0) {
      return {
        direct: {
          question,
          answer: NO_RELEVANT_CONTEXT_MESSAGE,
          sources: [],
          matchedDocumentId: referencedDocumentId ?? null,
        },
      };
    }

    const contextChunks: RetrievedChunk[] = relevant.map((result) => ({
      content: result.content,
      documentName: result.document.name,
      chunkIndex: result.chunkIndex,
      similarity: result.similarity,
    }));

    return {
      contextChunks,
      relevant,
      matchedDocumentId: referencedDocumentId ?? relevant[0]?.document.id ?? null,
    };
  }

  /**
   * "Ask AI about this document": retrieval is restricted to one document,
   * with no fallback to an open search and no name-based re-scoping.
   */
  private async retrieveScoped(
    userId: number,
    question: string,
    history: ConversationTurn[],
    documentId: number,
  ): Promise<Retrieval> {
    const searchQuery = this.buildSearchQuery(question, history);

    const searchResult = await this.searchService.search(
      userId,
      searchQuery,
      CONTEXT_CHUNK_LIMIT,
      documentId,
    );
    // Vague questions about an image or the document as a whole ("explain the
    // image", "describe it", "what does it contain") embed too weakly to clear
    // the similarity bar even though the answer is right there. Since the
    // search is already limited to this one document, fall back to its
    // best-ranked passages and let the model say if they don't answer it.
    const aboveThreshold = searchResult.results.filter(
      (result) => result.similarity >= SCOPED_MIN_RELEVANT_SIMILARITY,
    );
    const relevant =
      aboveThreshold.length > 0
        ? aboveThreshold
        : searchResult.results.slice(0, SCOPED_FALLBACK_CHUNK_LIMIT);

    if (relevant.length === 0) {
      return {
        direct: {
          question,
          answer: "I couldn't find anything relevant in this document to answer that question.",
          sources: [],
          matchedDocumentId: documentId,
        },
      };
    }

    return {
      contextChunks: relevant.map((result) => ({
        content: result.content,
        documentName: result.document.name,
        chunkIndex: result.chunkIndex,
        similarity: result.similarity,
      })),
      relevant,
      matchedDocumentId: documentId,
    };
  }

  /**
   * Turns retrieved chunks into citations, marking the ones that came from
   * images / scanned pages (stored in Document.visualAnalysis, whose text is
   * what was chunked and embedded). Only documents the search already
   * returned - i.e. ones the user may access - are looked up.
   */
  async buildSources(results: SearchResult[]): Promise<AssistantSource[]> {
    const ids = [...new Set(results.map((result) => result.document.id))];
    const documents = await this.prisma.document.findMany({
      where: { id: { in: ids } },
      select: { id: true, mimeType: true, visualAnalysis: true },
    });
    const byId = new Map(documents.map((document) => [document.id, document]));

    return results.map((result) => {
      const document = byId.get(result.document.id);
      const items = Array.isArray(document?.visualAnalysis)
        ? (document.visualAnalysis as unknown as VisualItem[])
        : [];

      return {
        chunkId: result.chunkId,
        documentId: result.document.id,
        documentName: result.document.name,
        chunkIndex: result.chunkIndex,
        similarity: result.similarity,
        visual: this.findVisualOrigin(
          result.content,
          items,
          Boolean(document?.mimeType?.startsWith("image/")),
        ),
      };
    });
  }

  private findVisualOrigin(
    chunkContent: string,
    items: VisualItem[],
    documentIsImage: boolean,
  ): AssistantSource["visual"] {
    const chunk = normalizeSpace(chunkContent);
    const head = chunk.slice(0, 80);
    if (!head) return null;

    for (const [index, item] of items.entries()) {
      const ocr = normalizeSpace(item.ocrText);
      const block = normalizeSpace(
        `[Visual content ${index + 1} - ${item.source}] ${ocr} ${item.description}`,
      );
      const marked = chunk.includes(`[Visual content ${index + 1} - `);

      if (!marked && !block.includes(head)) continue;

      let label = item.source;
      if (item.source === "scanned pages") {
        const position = ocr.indexOf(head);
        const pages = [...ocr.slice(0, position === -1 ? 0 : position + 1).matchAll(/Page (\d+)/g)];
        const lastPage = pages.at(-1)?.[1];
        if (lastPage) label = `scanned page ${lastPage}`;
      }

      return { label, documentIsImage };
    }

    return null;
  }

  /**
   * Looks for an explicit mention of a document's name (with or without its
   * file extension) inside the question, e.g. "In Angular_Exam_Handbook.docx,
   * what are the sections?". Matches the longest candidate name first so a
   * more specific title wins over a shorter substring of another document.
   */
  private resolveDocumentReference(
    question: string,
    documents: DocumentRef[],
  ): number | null {
    const normalizedQuestion = question.toLowerCase();

    const candidates = documents
      .flatMap((doc) => {
        const names = [doc.name, doc.originalName].filter(
          (value): value is string => Boolean(value && value.trim()),
        );
        return names.map((name) => ({
          id: doc.id,
          name: name.toLowerCase(),
          nameWithoutExtension: name.replace(/\.[a-z0-9]+$/i, "").toLowerCase(),
        }));
      })
      .sort((a, b) => b.name.length - a.name.length);

    for (const candidate of candidates) {
      if (
        normalizedQuestion.includes(candidate.name) ||
        (candidate.nameWithoutExtension.length > 3 &&
          normalizedQuestion.includes(candidate.nameWithoutExtension))
      ) {
        return candidate.id;
      }
    }

    return null;
  }

  /**
   * Folds the latest turns into the search text so a bare follow-up ("what
   * about the second one?") embeds with the topic it refers to. The last
   * assistant answer is included because that's usually where "the second
   * one" was listed. Everything is truncated to stay bounded.
   */
  private buildSearchQuery(question: string, history: ConversationTurn[]): string {
    const clip = (text: string) => text.slice(0, SEARCH_TURN_MAX_CHARS);
    const userTurns = history
      .filter((turn) => turn.role === "user")
      .slice(-SEARCH_HISTORY_USER_TURNS)
      .map((turn) => clip(turn.content));
    const lastAssistant = [...history].reverse().find((turn) => turn.role === "assistant");
    return [...userTurns, ...(lastAssistant ? [clip(lastAssistant.content)] : []), question].join(" ");
  }

  private looksLikeFollowUp(question: string): boolean {
    return FOLLOW_UP_PATTERNS.some((pattern) => pattern.test(question));
  }
}
