export const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "image/png",
  "image/jpeg",
] as const;

import type { TranslationKey } from "../i18n";
import type { DocumentStatus } from "../types/document";

/** Document permission roles (VIEWER / EDITOR / OWNER), as translation keys. */
export const PERMISSION_ROLE_LABEL: Record<string, TranslationKey> = {
  VIEWER: "Viewer",
  EDITOR: "Editor",
  OWNER: "Owner",
};

/** Translation keys for document statuses: render with t(DOCUMENT_STATUS_LABEL[status]). */
export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, TranslationKey> = {
  PENDING: "Pending",
  UPLOADED: "Uploaded",
  PROCESSING: "Processing",
  READY: "Ready",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

export const ALLOWED_DOCUMENT_EXTENSIONS = [".pdf", ".docx", ".txt", ".png", ".jpg", ".jpeg"] as const;

/** Translation key: render with t(ALLOWED_DOCUMENT_FILE_TYPES_LABEL). */
export const ALLOWED_DOCUMENT_FILE_TYPES_LABEL: TranslationKey = "PDF, DOCX, TXT, PNG, or JPG";

export const MAX_DOCUMENT_FILE_SIZE_BYTES = 20 * 1024 * 1024;
