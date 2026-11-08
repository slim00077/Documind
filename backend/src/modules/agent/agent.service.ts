import { HttpException, Inject, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AssistantService, type AssistantSource } from "../assistant/assistant.service";
import { DocumentSearchService, type SearchResult } from "../documents/document-search.service";
import { LLM_PROVIDER_TOKEN, type JsonSchema, type LLMProvider, type RetrievedChunk } from "../llm/llm-provider";
import { MessageRole } from "../../../generated/prisma/client";
import { anyAccessWhere, workspaceAccessWhere } from "../access/document-access";

const MAX_SEARCHES = 6;
const MAX_READS = 3;
const SEARCH_LIMIT = 6;
const READ_CHUNK_LIMIT = 8;
const EVIDENCE_CHUNK_LIMIT = 14;
const MAX_LISTED_DOCUMENTS = 50;
const TITLE_MAX_LENGTH = 60;

const UNAVAILABLE_MESSAGE =
  "The analysis agent couldn't complete right now. Please try again shortly.";

export type AgentResult = {
  report: string;
  sources: AssistantSource[];
  conversationId: number | null;
  /** Logical LLM calls used (planning + synthesis; retrieval needs none). */
  llmCalls: number;
};

export type AgentEvent =
  | { type: "step"; text: string }
  | { type: "delta"; text: string }
  | { type: "done"; result: AgentResult };

type Plan = {
  searches: { query: string; documentId?: number }[];
  readDocumentIds: number[];
};

type DocumentRef = { id: number; name: string; mimeType: string | null };

const PLAN_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    searches: {
      type: "array",
      items: {
        type: "object",
        properties: { query: { type: "string" }, documentId: { type: "integer" } },
        required: ["query"],
      },
    },
    readDocumentIds: { type: "array", items: { type: "integer" } },
  },
  required: ["searches"],
};

const PLAN_INSTRUCTIONS = [
  "You are the planning step of a document-analysis agent. Produce the COMPLETE",
  "retrieval plan for the task in one go; all of it runs in parallel.",
  `- searches: up to ${MAX_SEARCHES} semantic searches over the documents (text, and text`,
  "  extracted from images/scans). Set documentId to focus a search on one document;",
  "  when comparing documents, include separate searches per document.",
  `- readDocumentIds: up to ${MAX_READS} ids of documents worth reading from the start`,
  "  (e.g. for summaries). May be empty.",
].join("\n");

const REPORT_INSTRUCTIONS = [
  "Write the final analysis report for the task below using ONLY the document",
  "context provided. Ignore the default advice to keep answers short: produce a",
  "structured Markdown report with these sections:",
  "## Summary",
  "## Findings (group by document; name the document for each point)",
  "## Comparison (only when more than one document is involved: agreements,",
  "differences and contradictions, citing which document says what)",
  "## Gaps (what the documents do not cover)",
  "Never invent facts; if the evidence is insufficient say so plainly.",
].join("\n");

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly searchService: DocumentSearchService,
    private readonly assistantService: AssistantService,
    @Inject(LLM_PROVIDER_TOKEN) private readonly llm: LLMProvider,
  ) {}

  async *analyze(
    userId: number,
    task: string,
    documentIds?: number[],
    signal?: AbortSignal,
    conversationId?: number,
  ): AsyncGenerator<AgentEvent> {
    // Ownership boundary: every tool only ever sees this list.
    const documents = await this.prisma.document.findMany({
      where: {
        deletedAt: null,
        ...(documentIds?.length ? anyAccessWhere(userId) : workspaceAccessWhere(userId)),
        ...(documentIds?.length ? { id: { in: documentIds } } : {}),
      },
      select: { id: true, name: true, mimeType: true },
      orderBy: { updatedAt: "desc" },
      take: MAX_LISTED_DOCUMENTS,
    });
    const allowed = new Map(documents.map((doc) => [doc.id, doc]));

    let llmCalls = 0;
    const finish = async (report: string, sources: AssistantSource[]): Promise<AgentEvent> => {
      const savedId = await this.persist(userId, conversationId, task, report, sources);
      this.logger.log(`Analysis finished: ${llmCalls} LLM call(s), ${sources.length} source(s)`);
      return { type: "done", result: { report, sources, conversationId: savedId, llmCalls } };
    };

    if (allowed.size === 0) {
      const report = "There are no documents available to analyze.";
      yield { type: "delta", text: report };
      yield await finish(report, []);
      return;
    }

    // LLM call 1: structured plan.
    signal?.throwIfAborted();
    yield { type: "step", text: "Planning the analysis" };
    llmCalls++;
    const plan = await this.plan(task, documents, allowed);

    // Retrieval: no LLM involved, all lookups run in parallel.
    const evidence = new Map<number, SearchResult>();
    yield { type: "step", text: this.describe(plan, allowed) };
    signal?.throwIfAborted();
    await Promise.all([
      ...plan.searches.map((search) => this.search(userId, search, allowed, evidence)),
      ...plan.readDocumentIds.map((id) => this.read(id, allowed, evidence)),
    ]);

    if (evidence.size === 0) {
      const report = "I couldn't find evidence in your documents relevant to this task.";
      yield { type: "delta", text: report };
      yield await finish(report, []);
      return;
    }

    const used = this.selectEvidence([...evidence.values()]);
    const chunks: RetrievedChunk[] = used.map((result) => ({
      content: result.content,
      documentName: result.document.name,
      chunkIndex: result.chunkIndex,
      similarity: result.similarity,
    }));

    // LLM call 2: streamed synthesis.
    yield { type: "step", text: "Writing the report" };
    llmCalls++;
    let report = "";
    try {
      for await (const text of this.streamReport(`${REPORT_INSTRUCTIONS}\n\nTask: ${task}`, chunks, signal)) {
        report += text;
        yield { type: "delta", text };
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      throw this.toClientError(error);
    }

    yield await finish(report, await this.assistantService.buildSources(used));
  }

  private async *streamReport(
    question: string,
    chunks: RetrievedChunk[],
    signal?: AbortSignal,
  ): AsyncGenerator<string> {
    if (this.llm.streamAnswer) {
      yield* this.llm.streamAnswer(question, chunks, [], signal);
    } else {
      yield await this.llm.generateAnswer(question, chunks, []);
    }
  }

  /**
   * One structured LLM call. If the provider is unavailable or returns
   * unusable output, falls back to a deterministic plan (search the task,
   * per document when few) so the run still proceeds without extra calls.
   */
  private async plan(
    task: string,
    documents: DocumentRef[],
    allowed: Map<number, DocumentRef>,
  ): Promise<Plan> {
    const prompt = [
      PLAN_INSTRUCTIONS,
      "",
      `Task: ${task}`,
      "Accessible documents:",
      ...documents.map((doc) => `id ${doc.id}: ${doc.name}${doc.mimeType ? ` (${doc.mimeType})` : ""}`),
    ].join("\n");

    try {
      const raw = this.llm.generateStructured
        ? await this.llm.generateStructured(prompt, PLAN_SCHEMA)
        : null;
      const plan = this.validatePlan(raw, allowed);
      if (plan) return plan;
      this.logger.warn("Planner returned no usable structured plan; using the default plan.");
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 429) throw error;
      this.logger.warn(
        `Planning call failed (${error instanceof Error ? error.message : String(error)}); using the default plan.`,
      );
    }
    return this.defaultPlan(task, documents);
  }

  private defaultPlan(task: string, documents: DocumentRef[]): Plan {
    const query = task.slice(0, 500);
    return documents.length > 1 && documents.length <= MAX_SEARCHES
      ? { searches: documents.map((doc) => ({ query, documentId: doc.id })), readDocumentIds: [] }
      : { searches: [{ query }], readDocumentIds: [] };
  }

  private validatePlan(raw: unknown, allowed: Map<number, DocumentRef>): Plan | null {
    if (!raw || typeof raw !== "object") return null;
    const value = raw as { searches?: unknown; readDocumentIds?: unknown };
    const searches = (Array.isArray(value.searches) ? value.searches : [])
      .flatMap((item): Plan["searches"] => {
        const entry = item as { query?: unknown; documentId?: unknown };
        if (typeof entry?.query !== "string" || !entry.query.trim()) return [];
        const documentId =
          typeof entry.documentId === "number" && allowed.has(entry.documentId)
            ? entry.documentId
            : undefined;
        return [{ query: entry.query.slice(0, 500), documentId }];
      })
      .slice(0, MAX_SEARCHES);
    const readDocumentIds = (Array.isArray(value.readDocumentIds) ? value.readDocumentIds : [])
      .filter((id): id is number => typeof id === "number" && allowed.has(id))
      .slice(0, MAX_READS);
    return searches.length || readDocumentIds.length ? { searches, readDocumentIds } : null;
  }

  private describe(plan: Plan, allowed: Map<number, DocumentRef>): string {
    const parts = [
      ...plan.searches.map((search) => {
        const where = search.documentId !== undefined ? allowed.get(search.documentId)?.name : "all documents";
        return `searching ${where} for "${search.query.slice(0, 60)}"`;
      }),
      ...plan.readDocumentIds.map((id) => `reading ${allowed.get(id)?.name}`),
    ];
    return `Retrieving evidence: ${parts.join("; ")}`;
  }

  /** Balanced selection so every document keeps representation in the report. */
  private selectEvidence(results: SearchResult[]): SearchResult[] {
    const byDocument = new Map<number, SearchResult[]>();
    for (const result of [...results].sort((a, b) => b.similarity - a.similarity)) {
      const list = byDocument.get(result.document.id) ?? [];
      list.push(result);
      byDocument.set(result.document.id, list);
    }
    const lists = [...byDocument.values()];
    const picked: SearchResult[] = [];
    for (let i = 0; picked.length < EVIDENCE_CHUNK_LIMIT; i++) {
      const round = lists.map((list) => list[i]).filter(Boolean);
      if (round.length === 0) break;
      picked.push(...round.slice(0, EVIDENCE_CHUNK_LIMIT - picked.length));
    }
    return picked.sort((a, b) => b.similarity - a.similarity);
  }

  private async search(
    userId: number,
    search: { query: string; documentId?: number },
    allowed: Map<number, DocumentRef>,
    evidence: Map<number, SearchResult>,
  ): Promise<void> {
    const { results } = await this.searchService.search(userId, search.query, SEARCH_LIMIT, search.documentId);
    // Without a document filter the search spans everything the user can
    // access; keep only documents in this run's allowed set.
    results
      .filter((result) => allowed.has(result.document.id))
      .forEach((result) => evidence.set(result.chunkId, result));
  }

  private async read(
    documentId: number,
    allowed: Map<number, DocumentRef>,
    evidence: Map<number, SearchResult>,
  ): Promise<void> {
    const doc = allowed.get(documentId);
    if (!doc) return;
    const rows = await this.prisma.documentChunk.findMany({
      where: { documentId: doc.id },
      orderBy: { chunkIndex: "asc" },
      take: READ_CHUNK_LIMIT,
      select: { id: true, chunkIndex: true, content: true },
    });
    rows.forEach((row) => {
      // Keep the real similarity score when search already found this chunk.
      if (evidence.has(row.id)) return;
      evidence.set(row.id, {
        chunkId: row.id,
        chunkIndex: row.chunkIndex,
        content: row.content,
        distance: 0,
        similarity: 0.5,
        score: 0.5,
        matchType: "semantic",
        keywordCoverage: 0,
        document: { id: doc.id, name: doc.name, status: "" },
      });
    });
  }

  /** Saves the run into chat history (task + report with sources). */
  private async persist(
    userId: number,
    conversationId: number | undefined,
    task: string,
    report: string,
    sources: AssistantSource[],
  ): Promise<number | null> {
    try {
      let id = conversationId;
      if (id !== undefined) {
        const owned = await this.prisma.conversation.findFirst({ where: { id, userId }, select: { id: true } });
        if (!owned) id = undefined;
      }
      if (id === undefined) {
        const title = `Analysis: ${task.replace(/\s+/g, " ").trim()}`;
        const created = await this.prisma.conversation.create({
          data: {
            userId,
            title: title.length <= TITLE_MAX_LENGTH ? title : `${title.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`,
          },
        });
        id = created.id;
      }
      await this.prisma.message.create({
        data: { conversationId: id, role: MessageRole.USER, content: `Deep analysis: ${task}` },
      });
      await this.prisma.message.create({
        data: {
          conversationId: id,
          role: MessageRole.ASSISTANT,
          content: report,
          sources: sources as unknown as object,
        },
      });
      await this.prisma.conversation.update({ where: { id }, data: { updatedAt: new Date() } });
      return id;
    } catch (error) {
      this.logger.error("Failed to save analysis to history", error instanceof Error ? error.stack : String(error));
      return null;
    }
  }

  private toClientError(error: unknown): Error {
    if (error instanceof HttpException) return error;
    this.logger.error("Agent LLM call failed", error instanceof Error ? error.stack : String(error));
    return new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
  }
}
