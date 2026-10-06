"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentChunkingService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;
let DocumentChunkingService = class DocumentChunkingService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    /**
     * Splits `text` into chunks and atomically replaces any existing chunks
     * for `documentId`, so reprocessing never leaves stale or duplicate rows.
     */
    async chunkDocument(documentId, text) {
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
    splitIntoChunks(text, chunkSize = CHUNK_SIZE, overlapSize = CHUNK_OVERLAP) {
        const atoms = this.tokenize(text);
        if (atoms.length === 0) {
            return [];
        }
        const chunks = [];
        let current = "";
        for (const atom of atoms) {
            const separator = current.length === 0 ? "" : atom.precededByParagraphBreak ? "\n\n" : " ";
            const candidate = current + separator + atom.text;
            if (current.length > 0 && candidate.length > chunkSize) {
                chunks.push(current);
                current = this.takeOverlapTail(current, overlapSize);
                current = current.length === 0 ? atom.text : `${current} ${atom.text}`;
            }
            else {
                current = candidate;
            }
        }
        if (current.trim().length > 0) {
            chunks.push(current);
        }
        return chunks.map((c) => c.trim()).filter((c) => c.length > 0);
    }
    tokenize(text) {
        const paragraphs = text
            .replace(/\r\n/g, "\n")
            .split(/\n{2,}/)
            .map((p) => p.trim())
            .filter(Boolean);
        const atoms = [];
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
    takeOverlapTail(text, maxLength) {
        if (text.length <= maxLength) {
            return text;
        }
        const slice = text.slice(-maxLength);
        const firstSpace = slice.indexOf(" ");
        return firstSpace === -1 ? slice : slice.slice(firstSpace + 1);
    }
};
exports.DocumentChunkingService = DocumentChunkingService;
exports.DocumentChunkingService = DocumentChunkingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DocumentChunkingService);
