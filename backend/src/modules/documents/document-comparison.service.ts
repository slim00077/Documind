import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { LLM_PROVIDER_TOKEN, type LLMProvider } from "../llm/llm-provider";
import { DocumentsService } from "./documents.service";
import { DocumentStatus } from "../../../generated/prisma/client";
import { DEFAULT_LANGUAGE, type AppLanguage } from "../../common/i18n/language";

const MAX_CHUNKS_PER_DOCUMENT = 8;

export type DocumentComparison = {
  overview: string;
  similarities: string[];
  differences: { aspect: string; documentA: string; documentB: string }[];
  onlyInA: string[];
  onlyInB: string[];
};

const COMPARE_QUESTION = [
  "Compare Document A and Document B using ONLY the excerpts above (each excerpt is labelled with the document it came from).",
  "Respond with ONLY a JSON object (no markdown fences, no commentary) with exactly these keys:",
  '"overview": 2-4 sentences on what the two documents are and how they relate (string),',
  '"similarities": the most important things they have in common (array of short strings, empty if none),',
  '"differences": the most important differences, each as {"aspect": what is being compared, "documentA": what Document A says, "documentB": what Document B says} (array of objects, empty if none),',
  '"onlyInA": notable topics or facts present in Document A but absent from Document B (array of strings),',
  '"onlyInB": notable topics or facts present in Document B but absent from Document A (array of strings).',
  "Be specific (names, numbers, dates, terms) and never invent anything that is not in the excerpts.",
  "If the excerpts do not allow a point of comparison, leave it out rather than guessing.",
].join("\n");

const toStringList = (value: unknown, max: number): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, max)
    : [];

const toText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

@Injectable()
export class DocumentComparisonService {
  private readonly logger = new Logger(DocumentComparisonService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentsService: DocumentsService,
    @Inject(LLM_PROVIDER_TOKEN) private readonly llmProvider: LLMProvider,
  ) {}

  async compare(userId: number, idA: number, idB: number, language: AppLanguage = DEFAULT_LANGUAGE) {
    if (idA === idB) {
      throw new BadRequestException("Choose two different documents to compare.");
    }

    // Enforces ownership / explicit-share access for each document (404 otherwise).
    const [{ document: docA }, { document: docB }] = await Promise.all([
      this.documentsService.loadWithAccess(userId, idA),
      this.documentsService.loadWithAccess(userId, idB),
    ]);

    for (const document of [docA, docB]) {
      if (document.status !== DocumentStatus.READY) {
        throw new BadRequestException(
          `"${document.name}" isn't fully processed yet, so it can't be compared.`,
        );
      }
    }

    const [chunksA, chunksB] = await Promise.all([
      this.sampleChunks(docA.id),
      this.sampleChunks(docB.id),
    ]);

    if (chunksA.sampled.length === 0 || chunksB.sampled.length === 0) {
      throw new BadRequestException(
        "One of the documents has no processed content to compare.",
      );
    }

    const label = (tag: "A" | "B", name: string) => `Document ${tag}: ${name}`;
    let raw: string;
    try {
      raw = await this.llmProvider.generateAnswer(COMPARE_QUESTION, [
        ...chunksA.sampled.map((chunk) => ({
          content: chunk.content,
          documentName: label("A", docA.name),
          chunkIndex: chunk.chunkIndex,
        })),
        ...chunksB.sampled.map((chunk) => ({
          content: chunk.content,
          documentName: label("B", docB.name),
          chunkIndex: chunk.chunkIndex,
        })),
      ], [], { language });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        "LLM provider threw while comparing documents",
        error instanceof Error ? error.stack : String(error),
      );
      throw new ServiceUnavailableException(
        "The comparison couldn't be generated right now. Please try again shortly.",
      );
    }

    const describe = (
      document: typeof docA,
      coverage: { used: number; total: number },
    ) => ({
      id: document.id,
      name: document.name,
      size: document.size,
      category: document.category?.name ?? null,
      updatedAt: document.updatedAt,
      chunkCount: coverage.total,
      excerptsCompared: coverage.used,
    });

    return {
      documentA: describe(docA, { used: chunksA.sampled.length, total: chunksA.total }),
      documentB: describe(docB, { used: chunksB.sampled.length, total: chunksB.total }),
      comparison: this.parse(raw),
      generatedAt: new Date(),
    };
  }

  /** Evenly samples across the document so long files are represented end to end. */
  private async sampleChunks(documentId: number) {
    const chunks = await this.prisma.documentChunk.findMany({
      where: { documentId },
      orderBy: { chunkIndex: "asc" },
      select: { content: true, chunkIndex: true },
    });

    const step = Math.max(1, Math.ceil(chunks.length / MAX_CHUNKS_PER_DOCUMENT));
    const sampled = chunks
      .filter((_, index) => index % step === 0)
      .slice(0, MAX_CHUNKS_PER_DOCUMENT);

    return { sampled, total: chunks.length };
  }

  private parse(raw: string): DocumentComparison {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");

    if (start === -1 || end <= start) {
      throw new ServiceUnavailableException(
        "The AI provider didn't return a usable comparison. Check the LLM configuration and try again.",
      );
    }

    try {
      const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
      const overview = toText(parsed.overview);

      if (!overview) {
        throw new Error("missing overview");
      }

      const differences = Array.isArray(parsed.differences)
        ? parsed.differences
            .filter(
              (item): item is Record<string, unknown> =>
                typeof item === "object" && item !== null,
            )
            .map((item) => ({
              aspect: toText(item.aspect),
              documentA: toText(item.documentA),
              documentB: toText(item.documentB),
            }))
            .filter((item) => item.aspect && (item.documentA || item.documentB))
            .slice(0, 12)
        : [];

      return {
        overview,
        similarities: toStringList(parsed.similarities, 10),
        differences,
        onlyInA: toStringList(parsed.onlyInA, 10),
        onlyInB: toStringList(parsed.onlyInB, 10),
      };
    } catch {
      throw new ServiceUnavailableException(
        "The AI provider returned the comparison in an unexpected format. Please try again.",
      );
    }
  }
}
