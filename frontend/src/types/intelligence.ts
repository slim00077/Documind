export type DocRef = { id: number; name: string };
type Meta = { cached: boolean; generatedAt: string };
export type Coverage = { passagesUsed: number; totalPassages: number };

export type SummaryLevel = "short" | "detailed" | "sections";

export type SummaryResult = Meta & {
  document: DocRef;
  level: SummaryLevel;
  summary?: string;
  sections?: { title: string; summary: string; fromPassage: number | null; toPassage: number | null }[];
  coverage: Coverage;
};

export type ExtractionResult = Meta & {
  document: DocRef;
  keyPoints: { text: string; passage: number | null }[];
  entities: { name: string; type: string }[];
  dates: { date: string; context: string; isDeadline: boolean }[];
  numbers: { value: string; label: string }[];
  topics: string[];
  keywords: string[];
  verification: { discardedUnverifiedItems: number };
  coverage: Coverage;
};

export type QuestionsResult = Meta & {
  document: DocRef;
  mode: "study" | "review";
  questions: { question: string; answer: string; type: string; passage: number; evidence: string }[];
  verification: { rejectedWithoutEvidence: number };
  coverage: Coverage;
};

export type MultiCompareResult = Meta & {
  documents: (DocRef & { passagesCompared: number; totalPassages: number })[];
  overview: string;
  table: { aspect: string; cells: (string | null)[] }[];
  similarities: string[];
  contradictions: { topic: string; statements: { document: DocRef; statement: string }[] }[];
  missingInformation: { document: DocRef; missing: string }[];
};

type OverlapSide = { document: DocRef; chunkIndex: number; excerpt: string };

export type CollectionInsights = Meta & {
  scope: { documentCount: number; requested: number | null; passageCount: number; characterCount: number };
  computed: {
    documents: { id: number; name: string; mimeType: string | null; category: string | null; createdAt: string; passages: number; characters: number }[];
    byType: { label: string; count: number }[];
    byCategory: { label: string; count: number }[];
    timeline: { month: string; count: number }[];
    recurringTerms: { term: string; documents: number; occurrences: number; documentIds: number[] }[];
    distinctiveTerms: { document: DocRef; terms: { term: string; count: number }[] }[];
    entities: { documentsWithInsights: number; totalDocuments: number; items: { name: string; documents: DocRef[] }[] };
    relationships: { a: DocRef; b: DocRef; similarity: number }[];
    overlaps: { similarity: number; a: OverlapSide; b: OverlapSide }[];
    overlapSkippedReason: string | null;
  };
  interpretation: {
    label: string;
    summary: string;
    themes: { name: string; description: string; terms: string[] }[];
    assessments: { pair: number; verdict: "consistent" | "contradictory" | "unrelated"; explanation: string }[];
  } | null;
};
