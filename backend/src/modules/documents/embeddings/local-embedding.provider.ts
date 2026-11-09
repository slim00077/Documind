import { Injectable } from "@nestjs/common";
import type { EmbeddingProvider } from "./embedding-provider";
import { createLimiter } from "../../../common/limiter";

type FeatureExtractionPipeline = (
  texts: string[],
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ data: Float32Array | number[]; dims: number[] }>;

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";
const DIMENSIONS = 384;
// ONNX memory grows with the batch (128 chunks in one call peaked at ~2 GB RSS).
// Low-memory mode (default in production, or EMBEDDING_LOW_MEMORY=true) targets a 512 MB container:
// no CPU memory arena, one thread, small batches. Measured on 1,000-character chunks: model peak
// ~205-222 MB against 441 MB with default settings (batches of 16), at roughly 3x the time per chunk.
const LOW_MEMORY = (process.env.EMBEDDING_LOW_MEMORY ?? String(process.env.NODE_ENV === "production")) === "true";
const BATCH_SIZE = LOW_MEMORY ? 4 : 16;
const LOW_MEMORY_SESSION_OPTIONS = {
  enableCpuMemArena: false,
  enableMemPattern: false,
  graphOptimizationLevel: "basic" as const,
  intraOpNumThreads: 1,
  interOpNumThreads: 1,
};
// Embedding jobs never overlap, so concurrent uploads cannot add their peaks together.
const embedOneAtATime = createLimiter(1);

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

  embed(texts: string[]): Promise<number[][]> {
    return embedOneAtATime(() => this.embedBatches(texts));
  }

  private async embedBatches(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const extractor = await this.getPipeline();
    const vectors: number[][] = [];

    for (let start = 0; start < texts.length; start += BATCH_SIZE) {
      const output = await extractor(texts.slice(start, start + BATCH_SIZE), {
        pooling: "mean",
        normalize: true,
      });

      const flat = Array.from(output.data as ArrayLike<number>);
      const [batchSize, dims] = output.dims;

      for (let i = 0; i < batchSize; i++) {
        vectors.push(flat.slice(i * dims, (i + 1) * dims));
      }
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
            LOW_MEMORY ? { session_options: LOW_MEMORY_SESSION_OPTIONS } : {},
          ) as unknown as Promise<FeatureExtractionPipeline>,
      );
    }

    return this.pipelinePromise;
  }
}
