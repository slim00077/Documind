"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.documentFileInterceptorOptions = exports.MAX_DOCUMENT_FILE_SIZE = exports.DOCUMENTS_UPLOAD_DIR = void 0;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const common_1 = require("@nestjs/common");
const multer_1 = require("multer");
exports.DOCUMENTS_UPLOAD_DIR = (0, node_path_1.join)(process.cwd(), "uploads", "documents");
if (!(0, node_fs_1.existsSync)(exports.DOCUMENTS_UPLOAD_DIR)) {
    (0, node_fs_1.mkdirSync)(exports.DOCUMENTS_UPLOAD_DIR, { recursive: true });
}
exports.MAX_DOCUMENT_FILE_SIZE = 20 * 1024 * 1024;
const allowedExtensionsByMimeType = {
    "application/pdf": [".pdf"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
        ".docx",
    ],
    "text/plain": [".txt"],
};
exports.documentFileInterceptorOptions = {
    storage: (0, multer_1.diskStorage)({
        destination: exports.DOCUMENTS_UPLOAD_DIR,
        filename: (_req, file, callback) => {
            const extension = (0, node_path_1.extname)(file.originalname).toLowerCase();
            callback(null, `${(0, node_crypto_1.randomUUID)()}${extension}`);
        },
    }),
    limits: {
        fileSize: exports.MAX_DOCUMENT_FILE_SIZE,
    },
    fileFilter: (_req, file, callback) => {
        const allowedExtensions = allowedExtensionsByMimeType[file.mimetype];
        const extension = (0, node_path_1.extname)(file.originalname).toLowerCase();
        if (!allowedExtensions || !allowedExtensions.includes(extension)) {
            callback(new common_1.BadRequestException("Unsupported file type. Allowed formats: PDF, DOCX, TXT."), false);
            return;
        }
        callback(null, true);
    },
};
