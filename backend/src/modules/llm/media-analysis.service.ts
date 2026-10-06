import { Injectable } from "@nestjs/common";
import { GeminiLlmProvider } from "./providers/gemini-llm.provider";
import { LlmProviderError } from "./provider-error";
import { UsageMonitorService } from "./usage-monitor.service";
import { estimateTokens } from "./token-estimate";

export type MediaKind = "image" | "scanned-pdf";

export type MediaAnalysis = {
  /** Text read from the media (OCR); empty when nothing is readable. */
  ocrText: string;
  /** What the media shows (diagram, chart, photo, ...). */
  description: string;
};

const IMAGE_INSTRUCTION = [
  "You are processing an image taken from a user's document so it can be searched later.",
  "Respond in exactly this format:",
  "TEXT:",
  "<transcribe all readable text exactly as written, in reading order; write tables as rows with cells separated by ' | '; write 'none' if there is no readable text>",
  "DESCRIPTION:",
  "<describe the visual content: what kind of image it is (photo, chart, diagram, screenshot, scan, logo...), what it shows, and for charts and diagrams the axes, series, key values, relationships and conclusions>",
  "Be factual. Do not guess at anything that is not visible.",
].join("\n");

const SCANNED_PDF_INSTRUCTION = [
  "You are processing a scanned or image-only PDF so it can be searched later.",
  "Go through every page in order and respond in exactly this format:",
  "TEXT:",
  "<for each page, a line 'Page N' followed by all readable text on that page transcribed exactly as written; tables as rows with cells separated by ' | '>",
  "DESCRIPTION:",
  "<describe any images, charts, diagrams or other non-text visual content, naming the page each is on, with key values and relationships; write 'none' if there is none>",
  "Be factual. Do not guess at anything that is not visible.",
].join("\n");

const isNone = (value: string) => /^none\.?$/i.test(value.trim());

/**
 * Sends images / scanned PDFs to the existing Gemini provider (same API key,
 * models and retry / fallback behavior as the chat) and returns OCR text plus
 * a description. Calls are reported to the shared usage monitor so they show
 * up on the admin AI monitoring page.
 */
@Injectable()
export class MediaAnalysisService {
  constructor(
    private readonly gemini: GeminiLlmProvider,
    private readonly usageMonitor: UsageMonitorService,
  ) {}

  async analyze(
    data: Buffer,
    mimeType: string,
    kind: MediaKind,
  ): Promise<MediaAnalysis> {
    const instruction =
      kind === "scanned-pdf" ? SCANNED_PDF_INSTRUCTION : IMAGE_INSTRUCTION;
    const model = this.gemini.modelName;
    const startedAt = Date.now();

    this.usageMonitor.recordAttempt("gemini", model);

    try {
      const raw = await this.gemini.analyzeMedia(data, mimeType, instruction);
      this.usageMonitor.recordSuccess(
        "gemini",
        model,
        // Images are billed in tokens too, but the exact figure is not known
        // here; this is the same rough estimate used everywhere else.
        estimateTokens(instruction) + Math.ceil(data.length / 750),
        estimateTokens(raw),
        Date.now() - startedAt,
      );
      return this.parse(raw);
    } catch (error) {
      if (error instanceof LlmProviderError) {
        if (error.kind === "quota") {
          this.usageMonitor.recordQuotaHit("gemini");
        } else {
          this.usageMonitor.recordFailure("gemini", error.kind, error.message);
        }
      }
      throw error;
    }
  }

  private parse(raw: string): MediaAnalysis {
    const text = raw.trim();
    const descriptionMarker = text.search(/^\s*DESCRIPTION:/im);

    const textPart =
      descriptionMarker === -1 ? text : text.slice(0, descriptionMarker);
    const descriptionPart =
      descriptionMarker === -1
        ? ""
        : text.slice(descriptionMarker).replace(/^\s*DESCRIPTION:/i, "");

    const ocrText = textPart.replace(/^\s*TEXT:/i, "").trim();
    const description = descriptionPart.trim();

    return {
      ocrText: isNone(ocrText) ? "" : ocrText,
      description: isNone(description) ? "" : description,
    };
  }
}
