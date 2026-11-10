import type { AppLanguage } from "./language";
import { FR_MESSAGES, FR_PATTERNS, FR_TEMPLATES, bindNestedTranslator } from "./messages.fr";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "Your access to \"${}\" is now ${}." -> /^Your access to "(.+?)" is now (.+?)\.$/ */
const COMPILED_TEMPLATES: [RegExp, (v: string[]) => string][] = Object.entries(FR_TEMPLATES)
  // Longer templates first, so a specific one wins over a shorter, more generic one.
  .sort(([a], [b]) => b.length - a.length)
  .map(([template, render]) => [
    new RegExp(`^${template.split("${}").map(escapeRegExp).join("([\\s\\S]+?)")}$`),
    render,
  ]);

function translateToFrench(message: string): string {
  const exact = FR_MESSAGES[message];
  if (exact !== undefined) return exact;

  for (const [pattern, render] of COMPILED_TEMPLATES) {
    const match = pattern.exec(message);
    if (match) return render(match.slice(1));
  }
  for (const [pattern, render] of FR_PATTERNS) {
    const match = pattern.exec(message);
    if (match) return render(match);
  }
  return message;
}

bindNestedTranslator(translateToFrench);

/**
 * Translates an English API message (error, validation message, notification text) into the
 * requested language. Unknown text is returned unchanged, so a missing entry degrades to English
 * instead of failing. Never used on document content or AI output.
 */
export function translateMessage(message: string, language: AppLanguage): string {
  if (language === "en" || !message) return message;
  return translateToFrench(message);
}

/** Same, for Nest's `message` field, which can be a string or a list of validation messages. */
export function translateMessageField<T>(message: T, language: AppLanguage): T {
  if (typeof message === "string") return translateMessage(message, language) as T;
  if (Array.isArray(message)) return message.map((item) => (typeof item === "string" ? translateMessage(item, language) : item)) as T;
  return message;
}
