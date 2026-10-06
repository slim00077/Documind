export type SearchResult = {
  chunkId: number;
  chunkIndex: number;
  content: string;
  distance: number;
  similarity: number;
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
