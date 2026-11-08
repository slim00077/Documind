export type SearchResult = {
  chunkId: number;
  chunkIndex: number;
  content: string;
  distance: number;
  similarity: number;
  /** Fused hybrid relevance, 0..1. */
  score: number;
  matchType: "semantic" | "keyword" | "hybrid";
  keywordCoverage: number;
  document: {
    id: number;
    name: string;
    status: string;
  };
};

export type SearchResponse = {
  query: string;
  count: number;
  results: SearchResult[];
};
