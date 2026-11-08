import { ADMIN_API_URL } from "../config/api";
import type {
  AdminDocumentDetail,
  AdminDocumentRow,
  AdminDocumentSummary,
  AiMonitoringSnapshot,
  AdminStatsOverview,
  AdminUser,
  AuditLogEntry,
  DocumentPermissionEntry,
  DocumentPermissionRole,
  Paginated,
} from "../types/admin";

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
  Array.isArray(data.message) ? data.message.join(" ") : (data.message ?? "Request failed");

const request = async <T>(path: string, options: RequestOptions): Promise<T> => {
  const response = await fetch(`${ADMIN_API_URL}${path}`, {
    method: options.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.token}`,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = (await response.json().catch(() => ({}))) as { message?: string | string[] } & Partial<T>;

  if (!response.ok) {
    throw new ApiError(extractErrorMessage(data), response.status);
  }

  return data as T;
};

export const getAdminStatsRequest = (token: string): Promise<AdminStatsOverview> =>
  request<AdminStatsOverview>("/stats", { method: "GET", token });

export type UsersQuery = {
  search?: string;
  role?: "STUDENT" | "TEACHER" | "ADMIN";
  isActive?: boolean;
  page?: number;
  pageSize?: number;
};

const buildQuery = (params: Record<string, string | number | boolean | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
};

export const listAdminUsersRequest = (
  token: string,
  query: UsersQuery = {}
): Promise<Paginated<AdminUser>> =>
  request<Paginated<AdminUser>>(`/users${buildQuery(query)}`, { method: "GET", token });

export const getAdminUserRequest = (token: string, id: number): Promise<AdminUser> =>
  request<AdminUser>(`/users/${id}`, { method: "GET", token });

export const updateAdminUserRequest = (
  token: string,
  id: number,
  payload: { name?: string; email?: string; role?: "STUDENT" | "TEACHER" | "ADMIN" }
): Promise<AdminUser> =>
  request<AdminUser>(`/users/${id}`, { method: "PATCH", token, body: payload });

export const setAdminUserStatusRequest = (
  token: string,
  id: number,
  isActive: boolean
): Promise<AdminUser> =>
  request<AdminUser>(`/users/${id}/status`, { method: "PATCH", token, body: { isActive } });

export const deleteAdminUserRequest = (
  token: string,
  id: number
): Promise<{ id: number; message: string }> =>
  request<{ id: number; message: string }>(`/users/${id}`, { method: "DELETE", token });

export const listUserPermissionsRequest = (
  token: string,
  userId: number
): Promise<DocumentPermissionEntry[]> =>
  request<DocumentPermissionEntry[]>(`/users/${userId}/permissions`, { method: "GET", token });

export const grantPermissionRequest = (
  token: string,
  userId: number,
  documentId: number,
  role: DocumentPermissionRole
): Promise<DocumentPermissionEntry> =>
  request<DocumentPermissionEntry>(`/users/${userId}/permissions`, {
    method: "POST",
    token,
    body: { documentId, role },
  });

export const updatePermissionRequest = (
  token: string,
  userId: number,
  permissionId: number,
  role: DocumentPermissionRole
): Promise<DocumentPermissionEntry> =>
  request<DocumentPermissionEntry>(`/users/${userId}/permissions/${permissionId}`, {
    method: "PATCH",
    token,
    body: { role },
  });

export const revokePermissionRequest = (
  token: string,
  userId: number,
  permissionId: number
): Promise<{ id: number; message: string }> =>
  request<{ id: number; message: string }>(`/users/${userId}/permissions/${permissionId}`, {
    method: "DELETE",
    token,
  });

export const listAdminDocumentsRequest = (
  token: string,
  search?: string
): Promise<AdminDocumentSummary[]> =>
  request<AdminDocumentSummary[]>(`/documents${buildQuery({ search })}`, { method: "GET", token });

export type AuditLogsQuery = {
  action?: string;
  actorId?: number;
  targetType?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

export const listAuditLogsRequest = (
  token: string,
  query: AuditLogsQuery = {}
): Promise<Paginated<AuditLogEntry>> =>
  request<Paginated<AuditLogEntry>>(`/audit-logs${buildQuery(query)}`, { method: "GET", token });

export type AdminDocumentsQuery = {
  search?: string;
  state?: "active" | "trashed" | "all";
  status?: string;
};

export const listAdminDocumentRowsRequest = (
  token: string,
  query: AdminDocumentsQuery = {}
): Promise<AdminDocumentRow[]> =>
  request<AdminDocumentRow[]>(`/documents${buildQuery(query)}`, { method: "GET", token });

export const getAdminDocumentRequest = (token: string, id: number): Promise<AdminDocumentDetail> =>
  request<AdminDocumentDetail>(`/documents/${id}`, { method: "GET", token });

export const updateAdminDocumentRequest = (
  token: string,
  id: number,
  payload: { name?: string; description?: string; categoryId?: number | null }
): Promise<AdminDocumentDetail> =>
  request<AdminDocumentDetail>(`/documents/${id}`, { method: "PATCH", token, body: payload });

export const trashAdminDocumentRequest = (token: string, id: number): Promise<AdminDocumentDetail> =>
  request<AdminDocumentDetail>(`/documents/${id}`, { method: "DELETE", token });

export const restoreAdminDocumentRequest = (token: string, id: number): Promise<AdminDocumentDetail> =>
  request<AdminDocumentDetail>(`/documents/${id}/restore`, { method: "POST", token });

export const grantAdminDocumentAccessRequest = (
  token: string,
  id: number,
  userId: number,
  role: DocumentPermissionRole
): Promise<AdminDocumentDetail> =>
  request<AdminDocumentDetail>(`/documents/${id}/access`, {
    method: "POST",
    token,
    body: { userId, role },
  });

export const updateAdminDocumentAccessRequest = (
  token: string,
  id: number,
  permissionId: number,
  role: DocumentPermissionRole
): Promise<AdminDocumentDetail> =>
  request<AdminDocumentDetail>(`/documents/${id}/access/${permissionId}`, {
    method: "PATCH",
    token,
    body: { role },
  });

export const revokeAdminDocumentAccessRequest = (
  token: string,
  id: number,
  permissionId: number
): Promise<AdminDocumentDetail> =>
  request<AdminDocumentDetail>(`/documents/${id}/access/${permissionId}`, { method: "DELETE", token });

export const getAiMonitoringRequest = (token: string): Promise<AiMonitoringSnapshot> =>
  request<AiMonitoringSnapshot>("/ai-monitoring", { method: "GET", token });
