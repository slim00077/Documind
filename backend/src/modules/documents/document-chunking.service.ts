import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;

type Atom = {
  text: string;
  precededByParagraphBreak: boolean;
};

@Injectable()
export class DocumentChunkingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Splits `text` into chunks and atomically replaces any existing chunks
   * for `documentId`, so reprocessing never leaves stale or duplicate rows.
   */
  async chunkDocument(documentId: number, text: string): Promise<number> {
    const chunks = this.splitIntoChunks(text);

    await this.prisma.$transaction([
      this.prisma.documentChunk.deleteMany({ where: { documentId } }),
      ...(chunks.length > 0
        ? [
            this.prisma.documentChunk.createMany({
              data: chunks.map((content, index) => ({
                documentId,
                content,
                chunkIndex: index,
              })),
            }),
          ]
        : []),
    ]);

    return chunks.length;
  }

  private splitIntoChunks(
    text: string,
    chunkSize: number = CHUNK_SIZE,
    overlapSize: number = CHUNK_OVERLAP,
  ): string[] {
    const atoms = this.tokenize(text);
    if (atoms.length === 0) {
      return [];
    }

    const chunks: string[] = [];
    let current = "";

    for (const atom of atoms) {
      const separator =
        current.length === 0 ? "" : atom.precededByParagraphBreak ? "\n\n" : " ";
      const candidate = current + separator + atom.text;

      if (current.length > 0 && candidate.length > chunkSize) {
        chunks.push(current);
        current = this.takeOverlapTail(current, overlapSize);
        current = current.length === 0 ? atom.text : `${current} ${atom.text}`;
      } else {
        current = candidate;
      }
    }

    if (current.trim().length > 0) {
      chunks.push(current);
    }

    return chunks.map((c) => c.trim()).filter((c) => c.length > 0);
  }

  private tokenize(text: string): Atom[] {
    const paragraphs = text
      .replace(/\r\n/g, "\n")
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    const atoms: Atom[] = [];

    paragraphs.forEach((paragraph, paragraphIndex) => {
      const words = paragraph.split(/\s+/).filter(Boolean);

      words.forEach((word, wordIndex) => {
        atoms.push({
          text: word,
          precededByParagraphBreak: paragraphIndex > 0 && wordIndex === 0,
        });
      });
    });

    return atoms;
  }

  private takeOverlapTail(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }

    const slice = text.slice(-maxLength);
    const firstSpace = slice.indexOf(" ");
    return firstSpace === -1 ? slice : slice.slice(firstSpace + 1);
  }
}
