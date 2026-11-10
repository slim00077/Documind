import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

/**
 * Interface languages. The web client sends its UI language as `Accept-Language` on every API
 * request; it decides the language of error messages, notifications and AI answers. Clients that
 * send nothing (curl, tests, older builds) get English, exactly as before.
 */
export type AppLanguage = "en" | "fr";

export const DEFAULT_LANGUAGE: AppLanguage = "en";

const toAppLanguage = (tag: string): AppLanguage | null => {
  const primary = tag.trim().toLowerCase().split("-")[0];
  return primary === "fr" ? "fr" : primary === "en" ? "en" : null;
};

/** Parses an Accept-Language header ("fr-FR,fr;q=0.9,en;q=0.8") into the best supported language. */
export function resolveLanguage(header: string | string[] | undefined | null): AppLanguage {
  const value = Array.isArray(header) ? header.join(",") : header;
  if (!value) return DEFAULT_LANGUAGE;

  const ranked = value
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { tag, weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);

  for (const entry of ranked) {
    const language = toAppLanguage(entry.tag);
    if (language) return language;
  }
  return DEFAULT_LANGUAGE;
}

export const languageOf = (request: Pick<Request, "headers">): AppLanguage =>
  resolveLanguage(request.headers["accept-language"]);

/** Controller parameter: the caller's interface language, from Accept-Language. */
export const RequestLanguage = createParamDecorator((_data: unknown, context: ExecutionContext): AppLanguage =>
  languageOf(context.switchToHttp().getRequest<Request>()),
);

/** Saved preference on the user record ("EN" / "FR") -> AppLanguage. */
export const fromPreference = (value: string | null | undefined): AppLanguage | null =>
  value === "FR" ? "fr" : value === "EN" ? "en" : null;
