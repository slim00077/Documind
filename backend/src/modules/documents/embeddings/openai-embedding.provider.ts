import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EmbeddingProvider } from "./embedding-provider";

const DEFAULT_MODEL = "text-embedding-3-small";
const DEFAULT_DIMENSIONS = 384;
const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";

type OpenAiEmbeddingsResponse = {
  data: { embedding: number[]; index: number }[];
};

/**
 * Calls OpenAI's embeddings API. text-embedding-3-* models support an
 * explicit `dimensions` parameter (Matryoshka representation learning), so
 * this is requested to match the DocumentChunk.embedding column size
 * (vector(384)) regardless of the model's native output size.
 */
@Injectable()
export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  readonly providerName = "openai";
  readonly modelName: string;
  readonly dimensions: number;

  private readonly apiKey: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.modelName = this.config.get<string>("EMBEDDING_MODEL", DEFAULT_MODEL);
    this.dimensions = Number(
      this.config.get<string>("EMBEDDING_DIMENSIONS", String(DEFAULT_DIMENSIONS)),
    );
    this.apiKey = this.config.get<string>("OPENAI_API_KEY");
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    if (!this.apiKey) {
      throw new InternalServerErrorException(
        "OPENAI_API_KEY is not configured for the openai embedding provider.",
      );
    }

    const response = await fetch(OPENAI_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelName,
        input: texts,
        dimensions: this.dimensions,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `OpenAI embeddings request failed (${response.status}): ${errorBody.slice(0, 500)}`,
      );
    }

    const body = (await response.json()) as OpenAiEmbeddingsResponse;

    return body.data
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);
  }
}
