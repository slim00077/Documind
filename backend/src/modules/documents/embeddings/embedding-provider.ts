export interface EmbeddingProvider {
  readonly providerName: string;
  readonly modelName: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

export const EMBEDDING_PROVIDER_TOKEN = Symbol("EMBEDDING_PROVIDER_TOKEN");
