import { BadRequestException, Injectable } from "@nestjs/common";
import { DocumentStatus, Prisma } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { asInt, asObjects, asString, buildAnalysisPrompt, hashKey, normalize } from "./analysis-support";
import { DocumentIntelligenceService } from "./document-intelligence.service";
import { anyAccessWhere, workspaceAccessWhere } from "../../access/document-access";

const MAX_DOCUMENTS = 50;
const MAX_CHUNKS_FOR_OVERLAP = 3000;
const OVERLAP_THRESHOLD = 0.85;
const MAX_OVERLAPS = 10;
const RELATIONSHIP_MIN_SIMILARITY = 0.5;
const MAX_RECURRING_TERMS = 25;
const MIN_TERM_LENGTH = 4;
const EXCERPT = 280;

// Frequent function words that are not informative as recurring "topics".
const STOP = new Set(
  (
    "that this with from have were been which their there about would could should these those into than then them they what when where " +
    "will your also such only other more most some each over under between after before because while being both does done very " +
    "dans pour avec sans sont etre être cette ces des les une est que qui aux par sur plus comme mais ainsi aussi donc entre leur leurs " +
    "elle elles nous vous ils fait faire peut tout tous toutes tres très sous chez dont puis alors avoir été sera ont"
  ).split(" "),
);

type DocMeta = {
  id: number;
  name: string;
  mimeType: string | null;
  createdAt: Date;
  updatedAt: Date;
  category: { name: string } | null;
  insights: unknown;
  chunks: number;
  characters: number;
};

type CollectionInput = { documentIds?: number[]; categoryId?: number; interpret?: boolean };

@Injectable()
export class CollectionInsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly intelligence: DocumentIntelligenceService,
  ) {}

  async analyze(userId: number, input: CollectionInput) {
    const docs = await this.accessibleDocuments(userId, input);
    if (docs.length === 0) {
      throw new BadRequestException("No processed documents are available to analyse.");
    }
    const interpret = input.interpret !== false;
    const fingerprint = docs.map((d) => `${d.id}:${d.updatedAt.getTime()}:${d.chunks}`);

    return this.intelligence.cached(userId, "collection", hashKey(fingerprint, interpret), async () => {
      const ids = docs.map((d) => d.id);
      const idList = Prisma.join(ids);
      const totalChunks = docs.reduce((n, d) => n + d.chunks, 0);

      const [terms, relationships, overlapResult] = await Promise.all([
        this.termStats(idList, docs),
        docs.length > 1 ? this.relationships(idList, docs) : Promise.resolve([]),
        docs.length > 1 ? this.overlaps(idList, docs, totalChunks) : Promise.resolve({ items: [], skippedReason: null }),
      ]);

      const computed = {
        documents: docs.map((d) => ({
          id: d.id,
          name: d.name,
          mimeType: d.mimeType,
          category: d.category?.name ?? null,
          createdAt: d.createdAt,
          passages: d.chunks,
          characters: d.characters,
        })),
        byType: this.countBy(docs, (d) => d.mimeType ?? "unknown"),
        byCategory: this.countBy(docs, (d) => d.category?.name ?? "Uncategorized"),
        timeline: this.timeline(docs),
        recurringTerms: terms.recurring,
        distinctiveTerms: terms.distinctive,
        entities: this.entities(docs),
        relationships,
        overlaps: overlapResult.items,
        overlapSkippedReason: overlapResult.skippedReason,
      };

      return {
        scope: {
          documentCount: docs.length,
          requested: input.documentIds?.length ?? null,
          passageCount: totalChunks,
          characterCount: docs.reduce((n, d) => n + d.characters, 0),
        },
        computed,
        interpretation: interpret ? await this.interpretation(computed) : null,
      };
    });
  }

  // ---------------------------------------------------------------- queries

  private async accessibleDocuments(userId: number, input: CollectionInput): Promise<DocMeta[]> {
    const rows = await this.prisma.document.findMany({
      where: {
        deletedAt: null,
        status: DocumentStatus.READY,
        ...(input.documentIds?.length ? anyAccessWhere(userId) : workspaceAccessWhere(userId)),
        ...(input.documentIds?.length ? { id: { in: input.documentIds } } : {}),
        ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: MAX_DOCUMENTS,
      select: {
        id: true,
        name: true,
        mimeType: true,
        createdAt: true,
        updatedAt: true,
        insights: true,
        category: { select: { name: true } },
      },
    });
    if (rows.length === 0) return [];

    const sizes = await this.prisma.$queryRaw<{ id: number; chunks: number; characters: number }[]>`
      SELECT "documentId" AS id, count(*)::int AS chunks, COALESCE(sum(length(content)), 0)::int AS characters
      FROM "DocumentChunk" WHERE "documentId" IN (${Prisma.join(rows.map((r) => r.id))})
      GROUP BY "documentId"`;
    const bySize = new Map(sizes.map((s) => [s.id, s]));
    return rows
      .map((r) => ({ ...r, chunks: bySize.get(r.id)?.chunks ?? 0, characters: bySize.get(r.id)?.characters ?? 0 }))
      .filter((r) => r.chunks > 0);
  }

  /** Term counts per document straight from the stored text (exact, not AI-estimated). */
  private async termStats(idList: Prisma.Sql, docs: DocMeta[]) {
    const rows = await this.prisma.$queryRaw<{ documentId: number; word: string; n: number }[]>`
      SELECT dc."documentId" AS "documentId", w.word AS word, count(*)::int AS n
      FROM "DocumentChunk" dc,
        LATERAL regexp_split_to_table(lower(dc.content), '[^[:alnum:]_]+') AS w(word)
      WHERE dc."documentId" IN (${idList}) AND length(w.word) >= ${MIN_TERM_LENGTH} AND w.word !~ '^[0-9_]+$'
      GROUP BY dc."documentId", w.word`;

    const names = new Map(docs.map((d) => [d.id, d.name]));
    const perTerm = new Map<string, Map<number, number>>();
    for (const row of rows) {
      if (STOP.has(row.word)) continue;
      const entry = perTerm.get(row.word) ?? new Map<number, number>();
      entry.set(row.documentId, row.n);
      perTerm.set(row.word, entry);
    }

    const recurring = [...perTerm.entries()]
      .filter(([, byDoc]) => byDoc.size >= 2)
      .map(([term, byDoc]) => ({
        term,
        documents: byDoc.size,
        occurrences: [...byDoc.values()].reduce((a, b) => a + b, 0),
        documentIds: [...byDoc.keys()],
      }))
      .sort((a, b) => b.documents - a.documents || b.occurrences - a.occurrences)
      .slice(0, MAX_RECURRING_TERMS);

    // TF-IDF style: terms frequent in one document but rare across the collection.
    const total = docs.length;
    const distinctive = docs.map((doc) => {
      const scored = [...perTerm.entries()]
        .filter(([, byDoc]) => byDoc.has(doc.id) && byDoc.get(doc.id)! >= 3)
        .map(([term, byDoc]) => ({
          term,
          count: byDoc.get(doc.id)!,
          score: byDoc.get(doc.id)! * Math.log((total + 1) / byDoc.size),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(({ term, count }) => ({ term, count }));
      return { document: { id: doc.id, name: names.get(doc.id)! }, terms: scored };
    });

    return { recurring, distinctive };
  }

  /** Cosine similarity between document centroids (mean passage embedding). */
  private async relationships(idList: Prisma.Sql, docs: DocMeta[]) {
    const rows = await this.prisma.$queryRaw<{ a: number; b: number; similarity: number }[]>`
      WITH centroids AS (
        SELECT "documentId" AS id, avg(embedding) AS c
        FROM "DocumentChunk" WHERE "documentId" IN (${idList}) AND embedding IS NOT NULL
        GROUP BY "documentId"
      )
      SELECT a.id AS a, b.id AS b, (1 - (a.c <=> b.c))::float8 AS similarity
      FROM centroids a JOIN centroids b ON a.id < b.id
      ORDER BY similarity DESC`;
    const names = new Map(docs.map((d) => [d.id, d.name]));
    return rows
      .filter((r) => r.similarity >= RELATIONSHIP_MIN_SIMILARITY)
      .slice(0, 30)
      .map((r) => ({
        a: { id: r.a, name: names.get(r.a)! },
        b: { id: r.b, name: names.get(r.b)! },
        similarity: Number(r.similarity.toFixed(3)),
      }));
  }

  /** Near-duplicate passages across different documents (vector nearest neighbours). */
  private async overlaps(idList: Prisma.Sql, docs: DocMeta[], totalChunks: number) {
    if (totalChunks > MAX_CHUNKS_FOR_OVERLAP) {
      return {
        items: [],
        skippedReason: `Passage-level overlap detection is skipped for collections above ${MAX_CHUNKS_FOR_OVERLAP} passages; narrow the selection.`,
      };
    }
    const rows = await this.prisma.$queryRaw<
      { aDoc: number; aIdx: number; aText: string; bDoc: number; bIdx: number; bText: string; similarity: number }[]
    >`
      SELECT a."documentId" AS "aDoc", a."chunkIndex" AS "aIdx", a.content AS "aText",
             n."documentId" AS "bDoc", n."chunkIndex" AS "bIdx", n.content AS "bText", n.similarity
      FROM "DocumentChunk" a
      CROSS JOIN LATERAL (
        SELECT b."documentId", b."chunkIndex", b.content, (1 - (b.embedding <=> a.embedding))::float8 AS similarity
        FROM "DocumentChunk" b
        WHERE b."documentId" IN (${idList}) AND b."documentId" <> a."documentId" AND b.embedding IS NOT NULL
        ORDER BY b.embedding <=> a.embedding
        LIMIT 1
      ) n
      WHERE a."documentId" IN (${idList}) AND a.embedding IS NOT NULL AND n.similarity >= ${OVERLAP_THRESHOLD}
      ORDER BY n.similarity DESC
      LIMIT ${MAX_OVERLAPS * 4}`;

    const names = new Map(docs.map((d) => [d.id, d.name]));
    const seen = new Set<string>();
    const items = [];
    for (const r of rows) {
      const key = [`${r.aDoc}:${r.aIdx}`, `${r.bDoc}:${r.bIdx}`].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        similarity: Number(r.similarity.toFixed(3)),
        a: { document: { id: r.aDoc, name: names.get(r.aDoc)! }, chunkIndex: r.aIdx, excerpt: normalizeSpace(r.aText).slice(0, EXCERPT) },
        b: { document: { id: r.bDoc, name: names.get(r.bDoc)! }, chunkIndex: r.bIdx, excerpt: normalizeSpace(r.bText).slice(0, EXCERPT) },
      });
      if (items.length >= MAX_OVERLAPS) break;
    }
    return { items, skippedReason: null };
  }

  // ------------------------------------------------------- pure statistics

  private entities(docs: DocMeta[]) {
    const byName = new Map<string, { name: string; docs: Map<number, string> }>();
    let withInsights = 0;
    for (const doc of docs) {
      const list = (doc.insights as { entities?: unknown } | null)?.entities;
      if (!Array.isArray(list)) continue;
      withInsights++;
      for (const raw of list) {
        if (typeof raw !== "string" || !raw.trim()) continue;
        const key = normalize(raw);
        const entry = byName.get(key) ?? { name: raw.trim(), docs: new Map() };
        entry.docs.set(doc.id, doc.name);
        byName.set(key, entry);
      }
    }
    const items = [...byName.values()]
      .map((e) => ({ name: e.name, documents: [...e.docs].map(([id, name]) => ({ id, name })) }))
      .sort((a, b) => b.documents.length - a.documents.length || a.name.localeCompare(b.name))
      .slice(0, 40);
    return { documentsWithInsights: withInsights, totalDocuments: docs.length, items };
  }

  private countBy(docs: DocMeta[], key: (d: DocMeta) => string) {
    const counts = new Map<string, number>();
    docs.forEach((d) => counts.set(key(d), (counts.get(key(d)) ?? 0) + 1));
    return [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  }

  private timeline(docs: DocMeta[]) {
    const months = new Map<string, number>();
    docs.forEach((d) => {
      const m = d.createdAt.toISOString().slice(0, 7);
      months.set(m, (months.get(m) ?? 0) + 1);
    });
    return [...months].map(([month, count]) => ({ month, count })).sort((a, b) => a.month.localeCompare(b.month));
  }

  // --------------------------------------------------------- AI reasoning

  /**
   * One structured LLM call that only sees computed evidence: the recurring
   * terms and the retrieved overlapping passage pairs. Output is validated
   * against those inputs so it can't cite terms or pairs that don't exist.
   */
  private async interpretation(computed: {
    recurringTerms: { term: string; documents: number }[];
    overlaps: { similarity: number; a: Overlap; b: Overlap }[];
    documents: { name: string }[];
  }) {
    const terms = computed.recurringTerms.map((t) => t.term);
    if (terms.length === 0 && computed.overlaps.length === 0) {
      return {
        label: "AI interpretation",
        summary: "There was not enough shared content across these documents to interpret.",
        themes: [],
        assessments: [],
      };
    }

    // Passage text is untrusted: it goes inside <document> data tags, never into the task.
    const prompt = buildAnalysisPrompt(
      `You are given COMPUTED facts about a document collection. Using only them:
` +
        `1) summary: a short evidence-based report (max 150 words) of what the recurring terms and overlaps suggest; say clearly when evidence is thin.
` +
        `2) themes: up to 5 themes; each lists "terms" chosen ONLY from this recurring-terms list (they appear in 2+ documents): ${terms.join(", ") || "(none)"}.
` +
        `3) assessments: the <document> blocks named "Pair N" each hold two passages (A and B) from different documents. For every pair give "pair" = N, ` +
        `a verdict of "consistent", "contradictory" or "unrelated", and a one-sentence explanation quoting the differing detail. ` +
        `Only call a pair contradictory if the passages state incompatible facts.`,
      computed.overlaps.map((o, i) => ({
        name: `Pair ${i}`,
        passages: [
          { chunkIndex: 0, text: `A (${o.a.document.name}): ${o.a.excerpt}` },
          { chunkIndex: 1, text: `B (${o.b.document.name}): ${o.b.excerpt}` },
        ],
      })),
    );

    const raw = (await this.intelligence.structured(
      prompt,
      {
        type: "object",
        properties: {
          summary: { type: "string" },
          themes: {
            type: "array",
            items: {
              type: "object",
              properties: { name: { type: "string" }, description: { type: "string" }, terms: { type: "array", items: { type: "string" } } },
              required: ["name", "terms"],
            },
          },
          assessments: {
            type: "array",
            items: {
              type: "object",
              properties: {
                pair: { type: "integer" },
                verdict: { type: "string", enum: ["consistent", "contradictory", "unrelated"] },
                explanation: { type: "string" },
              },
              required: ["pair", "verdict", "explanation"],
            },
          },
        },
        required: ["summary"],
      },
      "collection interpretation",
    )) as Record<string, unknown>;

    const allowed = new Set(terms);
    const used = new Set<number>();
    return {
      label: "AI interpretation",
      summary: asString(raw.summary, 1500),
      themes: asObjects(raw.themes, 5)
        .map((t) => ({
          name: asString(t.name, 120),
          description: asString(t.description, 400),
          terms: (Array.isArray(t.terms) ? t.terms : []).filter((x): x is string => typeof x === "string" && allowed.has(x.toLowerCase())).map((x) => x.toLowerCase()),
        }))
        .filter((t) => t.name && t.terms.length > 0),
      assessments: asObjects(raw.assessments, MAX_OVERLAPS)
        .map((a) => ({
          pair: asInt(a.pair),
          verdict: ["consistent", "contradictory", "unrelated"].includes(a.verdict as string) ? (a.verdict as string) : null,
          explanation: asString(a.explanation, 500),
        }))
        .filter((a) => {
          if (a.pair === null || a.pair < 0 || a.pair >= computed.overlaps.length || !a.verdict || used.has(a.pair)) return false;
          used.add(a.pair);
          return Boolean(a.explanation);
        }),
    };
  }
}

type Overlap = { document: { id: number; name: string }; chunkIndex: number; excerpt: string };
const normalizeSpace = (value: string) => value.replace(/\s+/g, " ").trim();
