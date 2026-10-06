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

const MAX_CONTEXT_CHUNKS = 12;

export type DocumentInsights = {
  summary: string;
  topics: string[];
  dates: string[];
  entities: string[];
};

const INSIGHTS_QUESTION = [
  "Analyze the document excerpts above and respond with ONLY a JSON object (no markdown fences, no commentary) with exactly these keys:",
  '"summary": a 3-5 sentence summary of the document (string),',
  '"topics": up to 8 short key topics (array of strings),',
  '"dates": important dates mentioned, each with a few words of context, e.g. "2024-03-01 - contract start" (array of strings, empty if none),',
  '"entities": important people, organizations, places or products mentioned (array of strings, empty if none).',
  "Only include information actually present in the excerpts.",
].join("\n");

const toStringList = (value: unknown, max: number): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, max)
    : [];

@Injectable()
export class DocumentInsightsService {
  private readonly logger = new Logger(DocumentInsightsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LLM_PROVIDER_TOKEN) private readonly llmProvider: LLMProvider,
  ) {}

  /** Generates insights from the document's real chunks via the shared LLM chain. */
  async generate(
    documentId: number,
    documentName: string,
  ): Promise<DocumentInsights> {
    const chunks = await this.prisma.documentChunk.findMany({
      where: { documentId },
      orderBy: { chunkIndex: "asc" },
      select: { content: true, chunkIndex: true },
    });

    if (chunks.length === 0) {
      throw new BadRequestException(
        "This document has no processed content yet.",
      );
    }

    // Evenly sample across the document so long files are represented end to end.
    const step = Math.max(1, Math.ceil(chunks.length / MAX_CONTEXT_CHUNKS));
    const sampled = chunks
      .filter((_, index) => index % step === 0)
      .slice(0, MAX_CONTEXT_CHUNKS);

    let raw: string;
    try {
      raw = await this.llmProvider.generateAnswer(
        INSIGHTS_QUESTION,
        sampled.map((chunk) => ({
          content: chunk.content,
          documentName,
          chunkIndex: chunk.chunkIndex,
        })),
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        "LLM provider threw while generating insights",
        error instanceof Error ? error.stack : String(error),
      );
      throw new ServiceUnavailableException(
        "Insights couldn't be generated right now. Please try again shortly.",
      );
    }

    return this.parse(raw);
  }

  private parse(raw: string): DocumentInsights {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");

    if (start === -1 || end <= start) {
      throw new ServiceUnavailableException(
        "The AI provider didn't return usable insights. Check the LLM configuration and try again.",
      );
    }

    try {
      const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<
        string,
        unknown
      >;
      const summary =
        typeof parsed.summary === "string" ? parsed.summary.trim() : "";

      if (!summary) {
        throw new Error("missing summary");
      }

      return {
        summary,
        topics: toStringList(parsed.topics, 8),
        dates: toStringList(parsed.dates, 12),
        entities: toStringList(parsed.entities, 12),
      };
    } catch {
      throw new ServiceUnavailableException(
        "The AI provider returned insights in an unexpected format. Please try again.",
      );
    }
  }
}
