import { CATEGORIES_API_URL } from "../config/api";
import type { Category } from "../types/category";

export class ApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

type RequestOptions = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  token: string;
  body?: unknown;
};

const extractErrorMessage = (data: { message?: string | string[] }): string =>
  Array.isArray(data.message)
    ? data.message.join(" ")
    : (data.message ?? "Request failed");

const request = async <T>(
  path: string,
  options: RequestOptions
): Promise<T> => {
  const response = await fetch(`${CATEGORIES_API_URL}${path}`, {
    method: options.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.token}`,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
  } & Partial<T>;

  if (!response.ok) {
    throw new ApiError(extractErrorMessage(data), response.status);
  }

  return data as T;
};

export const listCategoriesRequest = (token: string): Promise<Category[]> =>
  request<Category[]>("", { method: "GET", token });

export const createCategoryRequest = (
  token: string,
  name: string
): Promise<Category> =>
  request<Category>("", { method: "POST", token, body: { name } });

export const updateCategoryRequest = (
  token: string,
  id: number,
  name: string
): Promise<Category> =>
  request<Category>(`/${id}`, { method: "PATCH", token, body: { name } });

export const deleteCategoryRequest = (
  token: string,
  id: number
): Promise<{ id: number; message: string }> =>
  request<{ id: number; message: string }>(`/${id}`, {
    method: "DELETE",
    token,
  });
