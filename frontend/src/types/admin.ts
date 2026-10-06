import type { AiResponseStyle, Theme } from "../services/auth.api";
import type { DocumentStatus } from "./document";

export type AdminStatsOverview = {
  users: {
    total: number;
    active: number;
    disabled: number;
    admins: number;
    newThisWeek: number;
  };
  documents: {
    total: number;
    byStatus: Record<DocumentStatus, number>;
    newThisWeek: number;
    totalStorageBytes: number;
  };
  categories: { total: number };
  assistant: { conversations: number; messages: number };
  recentActivity: AuditLogEntry[];
};

export type AdminUser = {
  id: number;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
  isActive: boolean;
  theme: Theme;
  aiResponseStyle: AiResponseStyle;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
};

export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type DocumentPermissionRole = "VIEWER" | "EDITOR" | "OWNER";

export type DocumentPermissionEntry = {
  id: number;
  documentId: number;
  userId: number;
  role: DocumentPermissionRole;
  createdAt: string;
  updatedAt: string;
  document: { id: number; name: string; status: DocumentStatus; userId: number };
};

export type AdminDocumentSummary = {
  id: number;
  name: string;
  status: DocumentStatus;
  size: number | null;
  userId: number;
  user: { id: number; name: string; email: string };
  createdAt: string;
  sharedWithCount: number;
};

export type AuditLogEntry = {
  id: number;
  actorId: number | null;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: number | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  actor: { id: number; name: string; email: string; role: string } | null;
};

export type AdminDocumentRow = AdminDocumentSummary & {
  deletedAt: string | null;
  category: { id: number; name: string } | null;
  updatedAt: string;
};

export type AdminDocumentAccess = {
  id: number;
  documentId: number;
  userId: number;
  role: DocumentPermissionRole;
  createdAt: string;
  user: { id: number; name: string; email: string };
};

export type AdminDocumentDetail = {
  id: number;
  name: string;
  description: string | null;
  originalName: string | null;
  mimeType: string | null;
  size: number | null;
  status: DocumentStatus;
  processingError: string | null;
  deletedAt: string | null;
  userId: number;
  categoryId: number | null;
  category: { id: number; name: string } | null;
  user: { id: number; name: string; email: string };
  createdAt: string;
  updatedAt: string;
  chunkCount: number;
  versionCount: number;
  permissions: AdminDocumentAccess[];
};

export type AiProviderStatus = "healthy" | "degraded" | "limited" | "idle" | "disabled";

export type AiProviderStats = {
  id: string;
  model: string;
  status: AiProviderStatus;
  requests: number;
  successes: number;
  errors: number;
  quotaHits: number;
  fallbacksFrom: number;
  skipped: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  avgLatencyMs: number | null;
  requestLimit: number | null;
  cooldownUntil: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
};

export type AiEvent = {
  at: string;
  type: "success" | "failure" | "quota" | "failover" | "skipped";
  providerId: string;
  model: string | null;
  detail: string;
};

export type AiMonitoringSnapshot = {
  live: {
    since: string;
    totals: {
      requests: number;
      successes: number;
      errors: number;
      fallbacks: number;
      estimatedInputTokens: number;
      estimatedOutputTokens: number;
    };
    providers: AiProviderStats[];
    recentEvents: AiEvent[];
  };
  persisted: {
    assistantAnswersLast24h: number;
    assistantAnswersLast7d: number;
    assistantAnswersTotal: number;
    documentsWithInsights: number;
    indexedChunks: number;
  };
};
