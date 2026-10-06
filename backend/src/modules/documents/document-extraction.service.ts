import { Injectable, Logger } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFParse } from "pdf-parse";
import * as mammoth from "mammoth";
import { PrismaService } from "../../prisma/prisma.service";
import { DOCUMENTS_UPLOAD_DIR } from "./documents-upload.config";
import { DocumentStatus, Prisma } from "../../../generated/prisma/client";
import { MediaAnalysisService } from "../llm/media-analysis.service";
import { LlmProviderError } from "../llm/provider-error";
import { DocumentChunkingService } from "./document-chunking.service";
import { DocumentEmbeddingsService } from "./document-embeddings.service";
import { NotificationsService } from "../notifications/notifications.service";

const NO_TEXT_FOUND_MESSAGE =
  "No extractable text was found in this document.";
const EXTRACTION_FAILED_MESSAGE =
  "We couldn't extract text from this file. It may be corrupted or in an unsupported format.";
const CHUNKING_FAILED_MESSAGE =
  "Text was extracted, but the document could not be split into chunks.";
const EMBEDDING_FAILED_MESSAGE =
  "Text was extracted and chunked, but embeddings could not be generated.";
const TEXT_TOO_LARGE_MESSAGE =
  "This document's extracted text is too large to process.";

// Visual (image / OCR) processing limits. Calls are sequential and capped so
// a picture-heavy document can't run up unbounded vision requests.
const MAX_IMAGES_PER_DOCUMENT = 6;
const MIN_EMBEDDED_IMAGE_BYTES = 4 * 1024;
// Gemini takes media inline as base64 (~4/3 larger) within a ~20 MB request.
const MAX_MEDIA_BYTES = 14 * 1024 * 1024;
// A PDF averaging less text than this per page is treated as scanned.
const MIN_TEXT_CHARS_PER_PAGE = 50;
const VISION_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

type VisualItem = { source: string; ocrText: string; description: string };
type ExtractedContent = { text: string; visual: VisualItem[] };

/** A failure in image analysis that the user should see verbatim. */
class VisualProcessingError extends Error {}

function sniffImageType(data: Uint8Array): string | null {
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return "image/png";
  }
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "image/jpeg";
  }
  return null;
}

// Generous but finite: guards against a single document (e.g. a large plain
// text file, or a PDF with unusually dense embedded text) producing an
// unbounded number of chunks and embedding calls, which would degrade
// processing for every other user sharing this instance. ~2,000,000
// characters is far beyond any normal document but still bounded.
const MAX_EXTRACTED_TEXT_LENGTH = 2_000_000;

@Injectable()
export class DocumentExtractionService {
  private readonly logger = new Logger(DocumentExtractionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chunkingService: DocumentChunkingService,
    private readonly embeddingsService: DocumentEmbeddingsService,
    private readonly notifications: NotificationsService,
    private readonly mediaAnalysis: MediaAnalysisService,
  ) {}

  async processDocument(documentId: number): Promise<void> {
    await this.runProcessing(documentId);
    await this.notifyOutcome(documentId);
  }

  /** Tells the owner how processing ended. Never throws. */
  private async notifyOutcome(documentId: number): Promise<void> {
    const document = await this.prisma.document
      .findUnique({
        where: { id: documentId },
        select: { id: true, name: true, userId: true, status: true, processingError: true },
      })
      .catch(() => null);

    if (!document) return;

    if (document.status === DocumentStatus.READY) {
      await this.notifications.notify({
        userId: document.userId,
        type: "PROCESSING_COMPLETED",
        title: "Document ready",
        message: `"${document.name}" finished processing and is ready for search and AI.`,
        documentId: document.id,
      });
    } else if (document.status === DocumentStatus.FAILED) {
      await this.notifications.notify({
        userId: document.userId,
        type: "PROCESSING_FAILED",
        title: "Processing failed",
        message: `"${document.name}" could not be processed: ${document.processingError ?? "unknown error"}`,
        documentId: document.id,
      });
    }
  }

  private async runProcessing(documentId: number): Promise<void> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, filePath: true, mimeType: true },
    });

    if (!document || !document.filePath || !document.mimeType) {
      return;
    }

    try {
      await this.prisma.document.update({
        where: { id: documentId },
        data: {
          status: DocumentStatus.PROCESSING,
          processingError: null,
          visualAnalysis: Prisma.DbNull,
        },
      });

      const { text, visual } = await this.extractContent(
        document.filePath,
        document.mimeType,
      );
      const trimmedText = this.mergeVisual(text, visual);

      if (!trimmedText) {
        await this.prisma.document.update({
          where: { id: documentId },
          data: {
            status: DocumentStatus.FAILED,
            processingError: NO_TEXT_FOUND_MESSAGE,
            extractedText: null,
          },
        });
        return;
      }

      if (trimmedText.length > MAX_EXTRACTED_TEXT_LENGTH) {
        this.logger.warn(
          `Document ${documentId} extracted text (${trimmedText.length} chars) exceeds the ${MAX_EXTRACTED_TEXT_LENGTH} char limit; marking FAILED instead of chunking/embedding.`,
        );
        await this.prisma.document.update({
          where: { id: documentId },
          data: {
            status: DocumentStatus.FAILED,
            processingError: TEXT_TOO_LARGE_MESSAGE,
            extractedText: null,
          },
        });
        return;
      }

      try {
        await this.chunkingService.chunkDocument(documentId, trimmedText);
      } catch (chunkingError) {
        this.logger.error(
          `Chunking failed for document ${documentId}`,
          chunkingError instanceof Error
            ? chunkingError.stack
            : String(chunkingError),
        );

        await this.prisma.document.update({
          where: { id: documentId },
          data: {
            status: DocumentStatus.FAILED,
            processingError: CHUNKING_FAILED_MESSAGE,
            extractedText: trimmedText,
          },
        });
        return;
      }

      try {
        await this.embeddingsService.embedDocumentChunks(documentId);
      } catch (embeddingError) {
        this.logger.error(
          `Embedding generation failed for document ${documentId}`,
          embeddingError instanceof Error
            ? embeddingError.stack
            : String(embeddingError),
        );

        await this.prisma.document.update({
          where: { id: documentId },
          data: {
            status: DocumentStatus.FAILED,
            processingError: EMBEDDING_FAILED_MESSAGE,
            extractedText: trimmedText,
          },
        });
        return;
      }

      await this.prisma.document.update({
        where: { id: documentId },
        data: {
          status: DocumentStatus.READY,
          extractedText: trimmedText,
          processingError: null,
          visualAnalysis: visual.length ? visual : Prisma.DbNull,
        },
      });
    } catch (error) {
      this.logger.error(
        `Text extraction failed for document ${documentId}`,
        error instanceof Error ? error.stack : String(error),
      );

      // This must never throw: a failure here would otherwise surface as an
      // unhandled 500 from DocumentsService.create() even though the
      // document row itself was already created successfully, and would
      // leave the document stuck at PENDING forever instead of FAILED.
      await this.prisma.document
        .update({
          where: { id: documentId },
          data: {
            status: DocumentStatus.FAILED,
            processingError:
              error instanceof VisualProcessingError
                ? error.message
                : EXTRACTION_FAILED_MESSAGE,
            extractedText: null,
          },
        })
        .catch((updateError) => {
          this.logger.error(
            `Failed to record FAILED status for document ${documentId}`,
            updateError instanceof Error
              ? updateError.stack
              : String(updateError),
          );
        });
    }
  }

  private async extractContent(
    filePath: string,
    mimeType: string,
  ): Promise<ExtractedContent> {
    const absolutePath = join(DOCUMENTS_UPLOAD_DIR, filePath);

    switch (mimeType) {
      case "application/pdf":
        return this.extractFromPdf(absolutePath);
      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return this.extractFromDocx(absolutePath);
      case "text/plain":
        return { text: await this.extractFromTxt(absolutePath), visual: [] };
      case "image/png":
      case "image/jpeg":
        return this.extractFromImage(absolutePath, mimeType);
      default:
        throw new Error(`Unsupported mime type for extraction: ${mimeType}`);
    }
  }

  /** Text first, then the visual blocks (OCR text + descriptions), as one RAG-ready string. */
  private mergeVisual(text: string, visual: VisualItem[]): string {
    const blocks = visual.map((item, index) =>
      [
        `[Visual content ${index + 1} - ${item.source}]`,
        item.ocrText && `Text in image:\n${item.ocrText}`,
        item.description && `Description:\n${item.description}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );

    return [text.trim(), ...blocks].filter(Boolean).join("\n\n").trim();
  }

  /** Standalone image upload: vision is the only way to get any content. */
  private async extractFromImage(
    absolutePath: string,
    mimeType: string,
  ): Promise<ExtractedContent> {
    const buffer = await readFile(absolutePath);
    if (buffer.length > MAX_MEDIA_BYTES) {
      throw new VisualProcessingError(
        "This image is too large to analyze (maximum 14 MB).",
      );
    }

    const analysis = await this.analyzeRequired(buffer, mimeType, "image");
    return {
      text: "",
      visual: [{ source: "uploaded image", ...analysis }],
    };
  }

  private async extractFromPdf(absolutePath: string): Promise<ExtractedContent> {
    const buffer = await readFile(absolutePath);
    const parser = new PDFParse({ data: buffer });

    try {
      const result = await parser.getText({ pageJoiner: "\n\n" });
      const pageCount = Math.max(result.total ?? 1, 1);

      if (result.text.trim().length < MIN_TEXT_CHARS_PER_PAGE * pageCount) {
        // Scanned / image-only: no usable text layer, so let Gemini read the pages.
        // (Re-read the file: pdf.js may have taken ownership of the first buffer.)
        const pdfBytes = await readFile(absolutePath);
        if (pdfBytes.length > MAX_MEDIA_BYTES) {
          throw new VisualProcessingError(
            "This scanned PDF is too large to analyze (maximum 14 MB).",
          );
        }
        const analysis = await this.analyzeRequired(
          pdfBytes,
          "application/pdf",
          "scanned-pdf",
        );
        return {
          text: result.text,
          visual: [{ source: "scanned pages", ...analysis }],
        };
      }

      return { text: result.text, visual: await this.analyzePdfImages(parser) };
    } finally {
      await parser.destroy();
    }
  }

  /** Embedded pictures in a text PDF. Best effort - never fails the document. */
  private async analyzePdfImages(parser: PDFParse): Promise<VisualItem[]> {
    let candidates: { page: number; data: Buffer; mime: string; area: number }[];

    try {
      const images = await parser.getImage({
        imageThreshold: 100,
        imageDataUrl: false,
      });
      candidates = images.pages.flatMap((page) =>
        page.images.flatMap((image) => {
          const mime = sniffImageType(image.data);
          return mime && image.data.length >= MIN_EMBEDDED_IMAGE_BYTES
            ? [
                {
                  page: page.pageNumber,
                  data: Buffer.from(image.data),
                  mime,
                  area: image.width * image.height,
                },
              ]
            : [];
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Could not extract embedded PDF images: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }

    const chosen = candidates
      .sort((a, b) => b.area - a.area)
      .slice(0, MAX_IMAGES_PER_DOCUMENT)
      .sort((a, b) => a.page - b.page);

    return this.analyzeOptional(
      chosen.map((image) => ({
        source: `image on page ${image.page}`,
        data: image.data,
        mime: image.mime,
      })),
    );
  }

  private async extractFromDocx(absolutePath: string): Promise<ExtractedContent> {
    const result = await mammoth.extractRawText({ path: absolutePath });

    const found: { data: Buffer; mime: string }[] = [];
    try {
      await mammoth.convertToHtml(
        { path: absolutePath },
        {
          convertImage: mammoth.images.imgElement(async (image) => {
            if (VISION_IMAGE_TYPES.has(image.contentType)) {
              const data = await image.readAsBuffer();
              if (data.length >= MIN_EMBEDDED_IMAGE_BYTES) {
                found.push({ data, mime: image.contentType });
              }
            }
            return { src: "" };
          }),
        },
      );
    } catch (error) {
      this.logger.warn(
        `Could not extract embedded DOCX images: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const chosen = found
      .slice(0, MAX_IMAGES_PER_DOCUMENT)
      .map((image, index) => ({ source: `embedded image ${index + 1}`, ...image }));

    return { text: result.value, visual: await this.analyzeOptional(chosen) };
  }

  private async analyzeRequired(
    data: Buffer,
    mimeType: string,
    kind: "image" | "scanned-pdf",
  ): Promise<{ ocrText: string; description: string }> {
    try {
      return await this.mediaAnalysis.analyze(data, mimeType, kind);
    } catch (error) {
      if (!(error instanceof LlmProviderError)) {
        throw error;
      }
      this.logger.warn(`Image analysis failed (${error.kind}): ${error.message}`);
      throw new VisualProcessingError(
        error.kind === "quota"
          ? "Image analysis is rate-limited right now. Please try again in a few minutes."
          : error.kind === "fatal"
            ? "Image analysis isn't available. Check the Gemini API key configuration."
            : "Image analysis failed temporarily. Please try again.",
      );
    }
  }

  /** Analyzes embedded images one at a time; a failure just skips that image. */
  private async analyzeOptional(
    images: { source: string; data: Buffer; mime: string }[],
  ): Promise<VisualItem[]> {
    const items: VisualItem[] = [];

    for (const image of images) {
      try {
        const analysis = await this.mediaAnalysis.analyze(
          image.data,
          image.mime,
          "image",
        );
        if (analysis.ocrText || analysis.description) {
          items.push({ source: image.source, ...analysis });
        }
      } catch (error) {
        this.logger.warn(
          `Skipping ${image.source}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return items;
  }

  private async extractFromTxt(absolutePath: string): Promise<string> {
    return readFile(absolutePath, "utf-8");
  }
}
