import { Injectable } from "@nestjs/common";
import type { EmbeddingProvider } from "./embedding-provider";

type FeatureExtractionPipeline = (
  texts: string[],
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ data: Float32Array | number[]; dims: number[] }>;

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";
const DIMENSIONS = 384;

/**
 * Runs a small sentence-embedding model fully locally via ONNX (no API key,
 * no network calls after the model is first downloaded and cached). This is
 * the default provider so the pipeline works out of the box in development.
 */
@Injectable()
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly providerName = "local";
  readonly modelName = MODEL_NAME;
  readonly dimensions = DIMENSIONS;

  private pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const extractor = await this.getPipeline();
    const output = await extractor(texts, { pooling: "mean", normalize: true });

    const flat = Array.from(output.data as ArrayLike<number>);
    const [batchSize, dims] = output.dims;

    const vectors: number[][] = [];
    for (let i = 0; i < batchSize; i++) {
      vectors.push(flat.slice(i * dims, (i + 1) * dims));
    }

    return vectors;
  }

  private getPipeline(): Promise<FeatureExtractionPipeline> {
    if (!this.pipelinePromise) {
      this.pipelinePromise = import("@huggingface/transformers").then(
        ({ pipeline }) =>
          pipeline(
            "feature-extraction",
            MODEL_NAME,
          ) as unknown as Promise<FeatureExtractionPipeline>,
      );
    }

    return this.pipelinePromise;
  }
}
