export const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "image/png",
  "image/jpeg",
] as const;

export const ALLOWED_DOCUMENT_EXTENSIONS = [".pdf", ".docx", ".txt", ".png", ".jpg", ".jpeg"] as const;

export const ALLOWED_DOCUMENT_FILE_TYPES_LABEL = "PDF, DOCX, TXT, PNG, or JPG";

export const MAX_DOCUMENT_FILE_SIZE_BYTES = 20 * 1024 * 1024;

export const MAX_DOCUMENT_FILE_SIZE_LABEL = "20 MB";
