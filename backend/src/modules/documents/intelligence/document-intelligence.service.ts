import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma } from "../../../../generated/prisma/client";
import { DocumentStatus } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { LLM_PROVIDER_TOKEN, type JsonSchema, type LLMProvider } from "../../llm/llm-provider";
import { DocumentsService } from "../documents.service";
import { DEFAULT_LANGUAGE, type AppLanguage } from "../../../common/i18n/language";
import {
  appearsIn,
  asInt,
  asObjects,
  asString,
  asStringList,
  buildAnalysisPrompt,
  hashKey,
  languageKey,
  samplePassages,
  type Passage,
} from "./analysis-support";

export type SummaryLevel = "short" | "detailed" | "sections";
export type QuestionMode = "study" | "review";

const SUMMARY_CHAR_BUDGET = 24000;
const EXTRACT_CHAR_BUDGET = 28000;
const QUESTIONS_CHAR_BUDGET = 20000;
const COMPARE_CHAR_BUDGET = 30000;
const MIN_COMPARE_CHARS_PER_DOC = 3000;
const MAX_SECTIONS = 8;
const CHUNKS_PER_SECTION = 6;

type Coverage = { passagesUsed: number; totalPassages: number };
type DocRef = { id: number; name: string };
type LoadedDocument = DocRef & { chunks: { chunkIndex: number; content: string }[]; fingerprint: string };

const str = { type: "string" };
const strList = { type: "array", items: str };

@Injectable()
export class DocumentIntelligenceService {
  private readonly logger = new Logger(DocumentIntelligenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentsService: DocumentsService,
    @Inject(LLM_PROVIDER_TOKEN) private readonly llm: LLMProvider,
  ) {}

  // ---------------------------------------------------------------- summary

  async summarize(userId: number, documentId: number, level: SummaryLevel, language: AppLanguage = DEFAULT_LANGUAGE) {
    const doc = await this.load(userId, documentId);
    return this.cached(userId, "summary", hashKey(doc.fingerprint, level, ...languageKey(language)), async () => {
      const group = (chunkIndex: number) =>
        Math.min(Math.floor(chunkIndex / this.sectionSize(doc)) + 1, MAX_SECTIONS);
      const { passages, total } = samplePassages(doc.chunks, SUMMARY_CHAR_BUDGET);
      const coverage: Coverage = { passagesUsed: passages.length, totalPassages: total };

      if (level === "sections") {
        const sectionCount = Math.min(MAX_SECTIONS, Math.ceil(total / CHUNKS_PER_SECTION)) || 1;
        const raw = await this.structured(
          buildAnalysisPrompt(
            `Summarise the document section by section. Passages are tagged section="1".."${sectionCount}" in reading order. ` +
              `Return exactly one entry per section that has passages, each with a short descriptive title and a 2-4 sentence summary of only that section.`,
            [{ name: doc.name, passages, group }],
            language,
          ),
          {
            type: "object",
            properties: {
              sections: {
                type: "array",
                items: {
                  type: "object",
                  properties: { section: { type: "integer" }, title: str, summary: str },
                  required: ["section", "title", "summary"],
                },
              },
            },
            required: ["sections"],
          },
          "section summary",
        );

        const seen = new Set<number>();
        const sections = asObjects((raw as { sections?: unknown })?.sections, MAX_SECTIONS)
          .map((item) => ({
            section: asInt(item.section),
            title: asString(item.title, 160),
            summary: asString(item.summary, 1500),
          }))
          .filter((s) => {
            if (s.section === null || s.section < 1 || s.section > sectionCount || seen.has(s.section)) return false;
            seen.add(s.section);
            return Boolean(s.title && s.summary);
          })
          .map((s) => {
            // Passage range comes from the server's own grouping, not the model.
            const members = passages.filter((p) => group(p.chunkIndex) === s.section);
            return {
              title: s.title,
              summary: s.summary,
              fromPassage: members[0]?.chunkIndex ?? null,
              toPassage: members.at(-1)?.chunkIndex ?? null,
            };
          })
          .sort((a, b) => (a.fromPassage ?? 0) - (b.fromPassage ?? 0));

        if (sections.length === 0) this.badOutput("section summary");
        return { document: this.ref(doc), level, sections, coverage };
      }

      const raw = await this.structured(
        buildAnalysisPrompt(
          level === "short"
            ? "Write a short summary of the document: 3 to 4 sentences covering its purpose and main conclusions."
            : "Write a detailed summary of the document in 3 to 6 paragraphs covering purpose, structure, key content, and conclusions. Do not add anything the passages do not support.",
          [{ name: doc.name, passages }],
          language,
        ),
        { type: "object", properties: { summary: str }, required: ["summary"] },
        "summary",
      );
      const summary = asString((raw as { summary?: unknown })?.summary, 8000);
      if (!summary) this.badOutput("summary");
      return { document: this.ref(doc), level, summary, coverage };
    });
  }

  // ------------------------------------------------------------- extraction

  async extract(userId: number, documentId: number, language: AppLanguage = DEFAULT_LANGUAGE) {
    const doc = await this.load(userId, documentId);
    return this.cached(userId, "extraction", hashKey(doc.fingerprint, ...languageKey(language)), async () => {
      const { passages, total } = samplePassages(doc.chunks, EXTRACT_CHAR_BUDGET);
      const corpus = passages.map((p) => p.text).join("\n");
      const indexes = new Set(passages.map((p) => p.chunkIndex));

      const raw = (await this.structured(
        buildAnalysisPrompt(
          "Extract key information. Copy names, dates, deadlines and numbers EXACTLY as written in the passages (same spelling and format). " +
            "For each key point give the passage index it comes from. Omit anything not present.",
          [{ name: doc.name, passages }],
          language,
        ),
        {
          type: "object",
          properties: {
            keyPoints: {
              type: "array",
              items: { type: "object", properties: { text: str, passage: { type: "integer" } }, required: ["text"] },
            },
            entities: {
              type: "array",
              items: {
                type: "object",
                properties: { name: str, type: { type: "string", enum: ["person", "organization", "place", "product", "other"] } },
                required: ["name", "type"],
              },
            },
            dates: {
              type: "array",
              items: { type: "object", properties: { date: str, context: str, isDeadline: { type: "boolean" } }, required: ["date", "context"] },
            },
            numbers: {
              type: "array",
              items: { type: "object", properties: { value: str, label: str }, required: ["value", "label"] },
            },
            topics: strList,
            keywords: strList,
          },
          required: ["keyPoints"],
        },
        "extraction",
      )) as Record<string, unknown> | null;

      let dropped = 0;
      // Names, dates and numbers must literally occur in the source text;
      // anything the model "normalised" or invented is discarded, not shown.
      const grounded = <T>(items: T[], value: (item: T) => string) =>
        items.filter((item) => {
          const ok = appearsIn(value(item), corpus);
          if (!ok) dropped++;
          return ok;
        });

      const keyPoints = asObjects(raw?.keyPoints, 15)
        .map((item) => {
          const passage = asInt(item.passage);
          return { text: asString(item.text, 600), passage: passage !== null && indexes.has(passage) ? passage : null };
        })
        .filter((k) => k.text);
      if (keyPoints.length === 0) this.badOutput("extraction");

      const entityTypes = new Set(["person", "organization", "place", "product", "other"]);
      const entities = grounded(
        asObjects(raw?.entities, 40)
          .map((item) => ({ name: asString(item.name, 120), type: entityTypes.has(item.type as string) ? (item.type as string) : "other" }))
          .filter((e) => e.name),
        (e) => e.name,
      );
      const dates = grounded(
        asObjects(raw?.dates, 30)
          .map((item) => ({ date: asString(item.date, 80), context: asString(item.context, 250), isDeadline: item.isDeadline === true }))
          .filter((d) => d.date),
        (d) => d.date,
      );
      const numbers = grounded(
        asObjects(raw?.numbers, 30)
          .map((item) => ({ value: asString(item.value, 80), label: asString(item.label, 200) }))
          .filter((n) => n.value),
        (n) => n.value,
      );
      const keywords = grounded(asStringList(raw?.keywords, 20, 60).map((k) => ({ k })), (x) => x.k).map((x) => x.k);
      // Topics are abstractions (may be paraphrased), so they are labelled AI-derived in the UI.
      const topics = asStringList(raw?.topics, 12, 100);

      return {
        document: this.ref(doc),
        keyPoints,
        entities,
        dates,
        numbers,
        topics,
        keywords,
        verification: { discardedUnverifiedItems: dropped },
        coverage: { passagesUsed: passages.length, totalPassages: total } satisfies Coverage,
      };
    });
  }

  // -------------------------------------------------------------- questions

  async generateQuestions(userId: number, documentId: number, count: number, mode: QuestionMode, language: AppLanguage = DEFAULT_LANGUAGE) {
    const doc = await this.load(userId, documentId);
    return this.cached(userId, "questions", hashKey(doc.fingerprint, count, mode, ...languageKey(language)), async () => {
      const { passages, total } = samplePassages(doc.chunks, QUESTIONS_CHAR_BUDGET);
      const byIndex = new Map(passages.map((p) => [p.chunkIndex, p.text]));

      const raw = (await this.structured(
        buildAnalysisPrompt(
          `Write ${count} ${mode === "study" ? "study questions that test understanding of the key ideas" : "review questions that check recall of the important facts"} ` +
            `with answers. Every answer must be supported by the passages: give the passage index and a SHORT verbatim quote (max 200 characters) from that passage as evidence. ` +
            `Mix question types (factual, conceptual, application).`,
          [{ name: doc.name, passages }],
          language,
        ),
        {
          type: "object",
          properties: {
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  question: str,
                  answer: str,
                  type: { type: "string", enum: ["factual", "conceptual", "application"] },
                  passage: { type: "integer" },
                  evidence: str,
                },
                required: ["question", "answer", "passage", "evidence"],
              },
            },
          },
          required: ["questions"],
        },
        "questions",
      )) as { questions?: unknown } | null;

      let rejected = 0;
      const questions = asObjects(raw?.questions, count)
        .map((item) => ({
          question: asString(item.question, 500),
          answer: asString(item.answer, 1200),
          type: ["factual", "conceptual", "application"].includes(item.type as string) ? (item.type as string) : "factual",
          passage: asInt(item.passage),
          evidence: asString(item.evidence, 300),
        }))
        .filter((q) => {
          // Keep only Q&A whose quoted evidence really exists in the cited passage.
          const text = q.passage !== null ? byIndex.get(q.passage) : undefined;
          const ok = Boolean(q.question && q.answer && text && appearsIn(q.evidence, text));
          if (!ok) rejected++;
          return ok;
        });

      if (questions.length === 0) this.badOutput("questions");
      return {
        document: this.ref(doc),
        mode,
        questions,
        verification: { rejectedWithoutEvidence: rejected },
        coverage: { passagesUsed: passages.length, totalPassages: total } satisfies Coverage,
      };
    });
  }

  // ------------------------------------------------------------- comparison

  async compare(userId: number, documentIds: number[], language: AppLanguage = DEFAULT_LANGUAGE) {
    const ids = [...new Set(documentIds)];
    if (ids.length < 2) throw new BadRequestException("Choose at least two different documents to compare.");

    const docs = await Promise.all(ids.map((id) => this.load(userId, id)));
    return this.cached(userId, "compare", hashKey(docs.map((d) => d.fingerprint), ...languageKey(language)), async () => {
      const budget = Math.max(MIN_COMPARE_CHARS_PER_DOC, Math.floor(COMPARE_CHAR_BUDGET / docs.length));
      const sampled = docs.map((d) => samplePassages(d.chunks, budget));
      const n = docs.length;
      const docIndex = { type: "integer" };

      const raw = (await this.structured(
        buildAnalysisPrompt(
          `Compare the ${n} documents (ids 1..${n}) using only their passages. Produce: an overview; a comparison table of the most important aspects ` +
            `(one row per aspect, with what each document says - omit documents that do not address the aspect); similarities; contradictions ` +
            `(only genuine conflicts between documents, listing each side); and information that is present in some documents but missing from others. ` +
            `Be specific (names, numbers, dates). Do not guess.`,
          docs.map((d, i) => ({ name: d.name, passages: sampled[i].passages })),
          language,
        ),
        {
          type: "object",
          properties: {
            overview: str,
            aspects: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  aspect: str,
                  values: {
                    type: "array",
                    items: { type: "object", properties: { document: docIndex, statement: str }, required: ["document", "statement"] },
                  },
                },
                required: ["aspect", "values"],
              },
            },
            similarities: strList,
            contradictions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  topic: str,
                  statements: {
                    type: "array",
                    items: { type: "object", properties: { document: docIndex, statement: str }, required: ["document", "statement"] },
                  },
                },
                required: ["topic", "statements"],
              },
            },
            missingInformation: {
              type: "array",
              items: { type: "object", properties: { document: docIndex, missing: str }, required: ["document", "missing"] },
            },
          },
          required: ["overview", "aspects"],
        },
        "comparison",
      )) as Record<string, unknown> | null;

      const overview = asString(raw?.overview, 2000);
      const toDoc = (value: unknown) => {
        const i = asInt(value);
        return i !== null && i >= 1 && i <= n ? i - 1 : null;
      };
      const statements = (value: unknown) => {
        const byDoc = new Map<number, string>();
        for (const item of asObjects(value, n * 2)) {
          const d = toDoc(item.document);
          const statement = asString(item.statement, 600);
          if (d !== null && statement && !byDoc.has(d)) byDoc.set(d, statement);
        }
        return byDoc;
      };

      const aspects = asObjects(raw?.aspects, 20)
        .map((item) => ({ aspect: asString(item.aspect, 200), values: statements(item.values) }))
        .filter((row) => row.aspect && row.values.size > 0)
        .map((row) => ({
          aspect: row.aspect,
          // One cell per document, null where the document doesn't address the aspect.
          cells: docs.map((_, i) => row.values.get(i) ?? null),
        }));
      if (!overview || aspects.length === 0) this.badOutput("comparison");

      const contradictions = asObjects(raw?.contradictions, 10)
        .map((item) => ({ topic: asString(item.topic, 200), sides: statements(item.statements) }))
        .filter((c) => c.topic && c.sides.size >= 2)
        .map((c) => ({
          topic: c.topic,
          statements: [...c.sides.entries()].map(([i, statement]) => ({ document: this.ref(docs[i]), statement })),
        }));

      const missingInformation = asObjects(raw?.missingInformation, 15)
        .map((item) => ({ d: toDoc(item.document), missing: asString(item.missing, 400) }))
        .filter((m) => m.d !== null && m.missing)
        .map((m) => ({ document: this.ref(docs[m.d as number]), missing: m.missing }));

      return {
        documents: docs.map((d, i) => ({
          ...this.ref(d),
          passagesCompared: sampled[i].passages.length,
          totalPassages: sampled[i].total,
        })),
        overview,
        table: aspects,
        similarities: asStringList(raw?.similarities, 12, 400),
        contradictions,
        missingInformation,
      };
    });
  }

  // ---------------------------------------------------------------- helpers

  /** Loads a READY document the user may access, with its chunks (403/404 handled by loadWithAccess). */
  async load(userId: number, documentId: number): Promise<LoadedDocument> {
    const { document } = await this.documentsService.loadWithAccess(userId, documentId);
    if (document.status !== DocumentStatus.READY) {
      throw new BadRequestException(`"${document.name}" isn't fully processed yet.`);
    }
    const chunks = await this.prisma.documentChunk.findMany({
      where: { documentId },
      orderBy: { chunkIndex: "asc" },
      select: { chunkIndex: true, content: true },
    });
    if (chunks.length === 0) {
      throw new BadRequestException(`"${document.name}" has no processed content yet.`);
    }
    return {
      id: document.id,
      name: document.name,
      chunks,
      fingerprint: `${document.id}:${document.updatedAt.getTime()}:${chunks.length}`,
    };
  }

  private sectionSize(doc: LoadedDocument) {
    const sectionCount = Math.min(MAX_SECTIONS, Math.ceil(doc.chunks.length / CHUNKS_PER_SECTION)) || 1;
    const lastIndex = doc.chunks.at(-1)?.chunkIndex ?? 0;
    return Math.max(1, Math.ceil((lastIndex + 1) / sectionCount));
  }

  private ref(doc: DocRef): DocRef {
    return { id: doc.id, name: doc.name };
  }

  /** Repeated identical requests on unchanged documents reuse the stored result. */
  async cached<T>(userId: number, kind: string, cacheKey: string, produce: () => Promise<T>) {
    const hit = await this.prisma.documentAnalysis.findUnique({
      where: { userId_kind_cacheKey: { userId, kind, cacheKey } },
    });
    if (hit) return { ...(hit.result as object), cached: true, generatedAt: hit.createdAt } as T & { cached: boolean; generatedAt: Date };

    const result = await produce();
    const stored = await this.prisma.documentAnalysis.upsert({
      where: { userId_kind_cacheKey: { userId, kind, cacheKey } },
      create: { userId, kind, cacheKey, result: result as unknown as Prisma.InputJsonValue },
      update: { result: result as unknown as Prisma.InputJsonValue, createdAt: new Date() },
    });
    return { ...result, cached: false, generatedAt: stored.createdAt };
  }

  async structured(prompt: string, schema: JsonSchema, what: string): Promise<unknown> {
    if (!this.llm.generateStructured) {
      throw new ServiceUnavailableException("The configured AI provider does not support structured output.");
    }
    try {
      const value = await this.llm.generateStructured(prompt, schema);
      if (value === null || typeof value !== "object") this.badOutput(what);
      return value;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`LLM call failed while generating ${what}`, error instanceof Error ? error.stack : String(error));
      throw new ServiceUnavailableException(`The ${what} couldn't be generated right now. Please try again shortly.`);
    }
  }

  private badOutput(what: string): never {
    this.logger.warn(`AI output for ${what} failed validation`);
    throw new ServiceUnavailableException(
      `The AI provider returned the ${what} in an unexpected format. Please try again.`,
    );
  }
}

export type { Passage };
