import { INTELLIGENCE_API_URL } from "../config/api";
import { ApiError } from "./documents.api";
import type {
  CollectionInsights,
  ExtractionResult,
  MultiCompareResult,
  QuestionsResult,
  SummaryLevel,
  SummaryResult,
} from "../types/intelligence";

const post = async <T>(token: string, path: string, body: unknown): Promise<T> => {
  const response = await fetch(`${INTELLIGENCE_API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as { message?: string | string[] };
  if (!response.ok) {
    const message = Array.isArray(data.message) ? data.message.join(" ") : data.message;
    throw new ApiError(message ?? "Request failed", response.status);
  }
  return data as T;
};

export const summarizeRequest = (token: string, id: number, level: SummaryLevel) =>
  post<SummaryResult>(token, `/documents/${id}/summary`, { level });

export const extractionRequest = (token: string, id: number) =>
  post<ExtractionResult>(token, `/documents/${id}/extraction`, {});

export const questionsRequest = (token: string, id: number, count: number, mode: "study" | "review") =>
  post<QuestionsResult>(token, `/documents/${id}/questions`, { count, mode });

export const compareManyRequest = (token: string, documentIds: number[]) =>
  post<MultiCompareResult>(token, "/compare", { documentIds });

export const collectionInsightsRequest = (
  token: string,
  body: { documentIds?: number[]; categoryId?: number; interpret?: boolean },
) => post<CollectionInsights>(token, "/collection", body);
