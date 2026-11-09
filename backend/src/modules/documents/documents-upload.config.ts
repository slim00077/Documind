import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { extname, join } from "node:path";
import { UPLOAD_STAGING_ROOT } from "../storage/storage.config";
import { BadRequestException } from "@nestjs/common";
import type { MulterOptions } from "@nestjs/platform-express/multer/interfaces/multer-options.interface";
import { diskStorage } from "multer";

// Staging folder: with STORAGE_DRIVER=s3 this is the OS temp dir and files are moved to the bucket
// right after upload; with the local driver it is the permanent uploads/documents folder.
export const DOCUMENTS_UPLOAD_DIR = join(UPLOAD_STAGING_ROOT, "documents");

if (!existsSync(DOCUMENTS_UPLOAD_DIR)) {
  mkdirSync(DOCUMENTS_UPLOAD_DIR, { recursive: true });
}

export const MAX_DOCUMENT_FILE_SIZE = 20 * 1024 * 1024;

const allowedExtensionsByMimeType: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "text/plain": [".txt"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
};

export const documentFileInterceptorOptions: MulterOptions = {
  storage: diskStorage({
    destination: DOCUMENTS_UPLOAD_DIR,
    filename: (_req, file, callback) => {
      const extension = extname(file.originalname).toLowerCase();
      callback(null, `${randomUUID()}${extension}`);
    },
  }),
  limits: {
    fileSize: MAX_DOCUMENT_FILE_SIZE,
  },
  fileFilter: (_req, file, callback) => {
    const allowedExtensions = allowedExtensionsByMimeType[file.mimetype];
    const extension = extname(file.originalname).toLowerCase();

    if (!allowedExtensions || !allowedExtensions.includes(extension)) {
      callback(
        new BadRequestException(
          "Unsupported file type. Allowed formats: PDF, DOCX, TXT, PNG, JPG.",
        ),
        false,
      );
      return;
    }

    callback(null, true);
  },
};
