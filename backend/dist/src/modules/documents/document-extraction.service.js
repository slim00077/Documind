"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var DocumentExtractionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentExtractionService = void 0;
const common_1 = require("@nestjs/common");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const pdf_parse_1 = require("pdf-parse");
const mammoth = __importStar(require("mammoth"));
const prisma_service_1 = require("../../prisma/prisma.service");
const documents_upload_config_1 = require("./documents-upload.config");
const client_1 = require("../../../generated/prisma/client");
const document_chunking_service_1 = require("./document-chunking.service");
const document_embeddings_service_1 = require("./document-embeddings.service");
const NO_TEXT_FOUND_MESSAGE = "No extractable text was found in this document.";
const EXTRACTION_FAILED_MESSAGE = "We couldn't extract text from this file. It may be corrupted or in an unsupported format.";
const CHUNKING_FAILED_MESSAGE = "Text was extracted, but the document could not be split into chunks.";
const EMBEDDING_FAILED_MESSAGE = "Text was extracted and chunked, but embeddings could not be generated.";
const TEXT_TOO_LARGE_MESSAGE = "This document's extracted text is too large to process.";
// Generous but finite: guards against a single document (e.g. a large plain
// text file, or a PDF with unusually dense embedded text) producing an
// unbounded number of chunks and embedding calls, which would degrade
// processing for every other user sharing this instance. ~2,000,000
// characters is far beyond any normal document but still bounded.
const MAX_EXTRACTED_TEXT_LENGTH = 2_000_000;
let DocumentExtractionService = DocumentExtractionService_1 = class DocumentExtractionService {
    prisma;
    chunkingService;
    embeddingsService;
    logger = new common_1.Logger(DocumentExtractionService_1.name);
    constructor(prisma, chunkingService, embeddingsService) {
        this.prisma = prisma;
        this.chunkingService = chunkingService;
        this.embeddingsService = embeddingsService;
    }
    async processDocument(documentId) {
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
                    status: client_1.DocumentStatus.PROCESSING,
                    processingError: null,
                },
            });
            const text = await this.extractText(document.filePath, document.mimeType);
            const trimmedText = text.trim();
            if (!trimmedText) {
                await this.prisma.document.update({
                    where: { id: documentId },
                    data: {
                        status: client_1.DocumentStatus.FAILED,
                        processingError: NO_TEXT_FOUND_MESSAGE,
                        extractedText: null,
                    },
                });
                return;
            }
            if (trimmedText.length > MAX_EXTRACTED_TEXT_LENGTH) {
                this.logger.warn(`Document ${documentId} extracted text (${trimmedText.length} chars) exceeds the ${MAX_EXTRACTED_TEXT_LENGTH} char limit; marking FAILED instead of chunking/embedding.`);
                await this.prisma.document.update({
                    where: { id: documentId },
                    data: {
                        status: client_1.DocumentStatus.FAILED,
                        processingError: TEXT_TOO_LARGE_MESSAGE,
                        extractedText: null,
                    },
                });
                return;
            }
            try {
                await this.chunkingService.chunkDocument(documentId, trimmedText);
            }
            catch (chunkingError) {
                this.logger.error(`Chunking failed for document ${documentId}`, chunkingError instanceof Error
                    ? chunkingError.stack
                    : String(chunkingError));
                await this.prisma.document.update({
                    where: { id: documentId },
                    data: {
                        status: client_1.DocumentStatus.FAILED,
                        processingError: CHUNKING_FAILED_MESSAGE,
                        extractedText: trimmedText,
                    },
                });
                return;
            }
            try {
                await this.embeddingsService.embedDocumentChunks(documentId);
            }
            catch (embeddingError) {
                this.logger.error(`Embedding generation failed for document ${documentId}`, embeddingError instanceof Error
                    ? embeddingError.stack
                    : String(embeddingError));
                await this.prisma.document.update({
                    where: { id: documentId },
                    data: {
                        status: client_1.DocumentStatus.FAILED,
                        processingError: EMBEDDING_FAILED_MESSAGE,
                        extractedText: trimmedText,
                    },
                });
                return;
            }
            await this.prisma.document.update({
                where: { id: documentId },
                data: {
                    status: client_1.DocumentStatus.READY,
                    extractedText: trimmedText,
                    processingError: null,
                },
            });
        }
        catch (error) {
            this.logger.error(`Text extraction failed for document ${documentId}`, error instanceof Error ? error.stack : String(error));
            // This must never throw: a failure here would otherwise surface as an
            // unhandled 500 from DocumentsService.create() even though the
            // document row itself was already created successfully, and would
            // leave the document stuck at PENDING forever instead of FAILED.
            await this.prisma.document
                .update({
                where: { id: documentId },
                data: {
                    status: client_1.DocumentStatus.FAILED,
                    processingError: EXTRACTION_FAILED_MESSAGE,
                    extractedText: null,
                },
            })
                .catch((updateError) => {
                this.logger.error(`Failed to record FAILED status for document ${documentId}`, updateError instanceof Error
                    ? updateError.stack
                    : String(updateError));
            });
        }
    }
    async extractText(filePath, mimeType) {
        const absolutePath = (0, node_path_1.join)(documents_upload_config_1.DOCUMENTS_UPLOAD_DIR, filePath);
        switch (mimeType) {
            case "application/pdf":
                return this.extractFromPdf(absolutePath);
            case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
                return this.extractFromDocx(absolutePath);
            case "text/plain":
                return this.extractFromTxt(absolutePath);
            default:
                throw new Error(`Unsupported mime type for extraction: ${mimeType}`);
        }
    }
    async extractFromPdf(absolutePath) {
        const buffer = await (0, promises_1.readFile)(absolutePath);
        const parser = new pdf_parse_1.PDFParse({ data: buffer });
        try {
            const result = await parser.getText({ pageJoiner: "\n\n" });
            return result.text;
        }
        finally {
            await parser.destroy();
        }
    }
    async extractFromDocx(absolutePath) {
        const result = await mammoth.extractRawText({ path: absolutePath });
        return result.value;
    }
    async extractFromTxt(absolutePath) {
        return (0, promises_1.readFile)(absolutePath, "utf-8");
    }
};
exports.DocumentExtractionService = DocumentExtractionService;
exports.DocumentExtractionService = DocumentExtractionService = DocumentExtractionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        document_chunking_service_1.DocumentChunkingService,
        document_embeddings_service_1.DocumentEmbeddingsService])
], DocumentExtractionService);
