import type { JsonSchema } from "./llm-provider";

/** Extracts the first JSON value from model text (tolerates fences/prose). */
export function parseJsonLoose(raw: string): unknown | null {
  const text = raw.replace(/```(?:json)?/gi, "").trim();
  for (const [open, close] of [["{", "}"], ["[", "]"]]) {
    const start = text.indexOf(open);
    const end = text.lastIndexOf(close);
    if (start === -1 || end <= start) continue;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      // try next shape
    }
  }
  return null;
}

/** Prompt wrapper for providers with no native schema mode. */
export function withSchemaInstructions(prompt: string, schema: JsonSchema): string {
  return `${prompt}

Reply with ONLY one JSON value matching this JSON Schema, no prose, no code fences:
${JSON.stringify(schema)}`;
}
