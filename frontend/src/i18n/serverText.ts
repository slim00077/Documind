import type { TFunction } from "i18next";
import type { TranslationKey } from "./index";

/**
 * Fixed English sentences the API stores in data (not in error responses), such as a document's
 * processing error. Listed here so the translation checker sees them as used.
 */
export const STORED_SERVER_TEXTS: TranslationKey[] = [
  "No extractable text was found in this document.",
  "We couldn't extract text from this file. It may be corrupted or in an unsupported format.",
  "Text was extracted, but the document could not be split into chunks.",
  "Text was extracted and chunked, but embeddings could not be generated.",
  "This document's extracted text is too large to process.",
  "This image is too large to analyze (maximum 14 MB).",
  "This scanned PDF is too large to analyze (maximum 14 MB).",
  "Image analysis is rate-limited right now. Please try again in a few minutes.",
  "Image analysis isn't available. Check the Gemini API key configuration.",
  "Image analysis failed temporarily. Please try again.",
];

const KNOWN = new Set<string>(STORED_SERVER_TEXTS);

/** Translates a stored server sentence when it is one of the fixed ones; anything else is shown as is. */
export const translateStoredText = (text: string, t: TFunction): string => (KNOWN.has(text) ? t(text as TranslationKey) : text);
