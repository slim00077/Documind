import { DOCUMENTS_API_URL } from "../config/api";
import type {
  CreateDocumentPayload,
  DeleteDocumentResponse,
  Document,
  DocumentChunksInfo,
  DocumentComparisonResult,
  DocumentText,
  DocumentVersionsResponse,
  GeneratedInsights,
  SharedDocument,
  UpdateDocumentPayload,
} from "../types/document";
import type { SearchResponse } from "../types/search";

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
  const isFormData = options.body instanceof FormData;

  const response = await fetch(`${DOCUMENTS_API_URL}${path}`, {
    method: options.method,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      Authorization: `Bearer ${options.token}`,
    },
    body: isFormData
      ? (options.body as FormData)
      : options.body !== undefined
        ? JSON.stringify(options.body)
        : undefined,
  });

  const data = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
  } & Partial<T>;

  if (!response.ok) {
    throw new ApiError(extractErrorMessage(data), response.status);
  }

  return data as T;
};

export const listDocumentsRequest = (token: string): Promise<Document[]> =>
  request<Document[]>("", { method: "GET", token });

export const getDocumentRequest = (
  token: string,
  id: number
): Promise<Document> =>
  request<Document>(`/${id}`, { method: "GET", token });

export const getDocumentTextRequest = (
  token: string,
  id: number
): Promise<DocumentText> =>
  request<DocumentText>(`/${id}/text`, { method: "GET", token });

export type SearchFilters = {
  categoryId?: number;
  mimeType?: string;
  createdFrom?: string;
  createdTo?: string;
  documentIds?: number[];
  rerank?: "none" | "lexical" | "llm";
};

export const searchDocumentsRequest = (
  token: string,
  query: string,
  limit?: number,
  filters: SearchFilters = {}
): Promise<SearchResponse> => {
  const params = new URLSearchParams({ query });
  if (limit) {
    params.set("limit", String(limit));
  }
  if (filters.categoryId) params.set("categoryId", String(filters.categoryId));
  if (filters.mimeType) params.set("mimeType", filters.mimeType);
  if (filters.createdFrom) params.set("createdFrom", filters.createdFrom);
  if (filters.createdTo) params.set("createdTo", filters.createdTo);
  if (filters.documentIds?.length) params.set("documentIds", filters.documentIds.join(","));
  if (filters.rerank) params.set("rerank", filters.rerank);
  return request<SearchResponse>(`/search?${params.toString()}`, {
    method: "GET",
    token,
  });
};

const buildCreateFormData = (payload: CreateDocumentPayload): FormData => {
  const formData = new FormData();
  formData.append("name", payload.name);

  if (payload.description) {
    formData.append("description", payload.description);
  }

  if (payload.categoryId !== undefined && payload.categoryId !== null) {
    formData.append("categoryId", String(payload.categoryId));
  }

  if (payload.file) {
    formData.append("file", payload.file);
  }

  return formData;
};

export const createDocumentRequest = (
  token: string,
  payload: CreateDocumentPayload,
  onUploadProgress?: (percent: number) => void
): Promise<Document> => {
  const formData = buildCreateFormData(payload);

  if (!payload.file || !onUploadProgress) {
    return request<Document>("", { method: "POST", token, body: formData });
  }

  return new Promise<Document>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", DOCUMENTS_API_URL);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onUploadProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      let data: { message?: string | string[] } & Partial<Document> = {};

      try {
        data = xhr.responseText
          ? JSON.parse(xhr.responseText)
          : {};
      } catch {
        data = {};
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as Document);
      } else {
        reject(new ApiError(extractErrorMessage(data), xhr.status));
      }
    };

    xhr.onerror = () => {
      reject(new ApiError("Network error while uploading the document.", 0));
    };

    xhr.send(formData);
  });
};

export const updateDocumentRequest = (
  token: string,
  id: number,
  payload: UpdateDocumentPayload
): Promise<Document> =>
  request<Document>(`/${id}`, { method: "PATCH", token, body: payload });

export const deleteDocumentRequest = (
  token: string,
  id: number
): Promise<DeleteDocumentResponse> =>
  request<DeleteDocumentResponse>(`/${id}`, { method: "DELETE", token });

export const getDocumentChunksRequest = (
  token: string,
  id: number
): Promise<DocumentChunksInfo> =>
  request<DocumentChunksInfo>(`/${id}/chunks`, { method: "GET", token });

export const listTrashRequest = (token: string): Promise<Document[]> =>
  request<Document[]>("/trash", { method: "GET", token });

export const restoreDocumentRequest = (
  token: string,
  id: number
): Promise<Document> =>
  request<Document>(`/${id}/restore`, { method: "POST", token });

export const permanentDeleteDocumentRequest = (
  token: string,
  id: number
): Promise<DeleteDocumentResponse> =>
  request<DeleteDocumentResponse>(`/${id}/permanent`, {
    method: "DELETE",
    token,
  });

export const listVersionsRequest = (
  token: string,
  id: number
): Promise<DocumentVersionsResponse> =>
  request<DocumentVersionsResponse>(`/${id}/versions`, {
    method: "GET",
    token,
  });

export const uploadVersionRequest = (
  token: string,
  id: number,
  file: File
): Promise<Document> => {
  const formData = new FormData();
  formData.append("file", file);
  return request<Document>(`/${id}/versions`, {
    method: "POST",
    token,
    body: formData,
  });
};

export const restoreVersionRequest = (
  token: string,
  id: number,
  versionId: number
): Promise<Document> =>
  request<Document>(`/${id}/versions/${versionId}/restore`, {
    method: "POST",
    token,
  });

export const downloadVersionRequest = async (
  token: string,
  id: number,
  versionId: number
): Promise<Blob> => {
  const response = await fetch(
    `${DOCUMENTS_API_URL}/${id}/versions/${versionId}/file`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!response.ok) {
    throw new ApiError("Unable to download this version.", response.status);
  }

  return response.blob();
};

export const generateInsightsRequest = (
  token: string,
  id: number
): Promise<GeneratedInsights> =>
  request<GeneratedInsights>(`/${id}/insights`, { method: "POST", token });

export const listSharedDocumentsRequest = (
  token: string
): Promise<SharedDocument[]> =>
  request<SharedDocument[]>("/shared", { method: "GET", token });

export const compareDocumentsRequest = (
  token: string,
  documentIdA: number,
  documentIdB: number
): Promise<DocumentComparisonResult> =>
  request<DocumentComparisonResult>("/compare", {
    method: "POST",
    token,
    body: { documentIdA, documentIdB },
  });

export const setDocumentFavoriteRequest = (
  token: string,
  id: number,
  isFavorite: boolean
): Promise<{ id: number; isFavorite: boolean }> =>
  request<{ id: number; isFavorite: boolean }>(`/${id}/favorite`, {
    method: isFavorite ? "POST" : "DELETE",
    token,
  });

export const getDocumentImageRequest = async (token: string, id: number): Promise<Blob> => {
  const response = await fetch(`${DOCUMENTS_API_URL}/${id}/image`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new ApiError("Unable to load this image.", response.status);
  }

  return response.blob();
};
