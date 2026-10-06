export type DocumentStatus =
  | "PENDING"
  | "UPLOADED"
  | "PROCESSING"
  | "READY"
  | "COMPLETED"
  | "FAILED";

export type DocumentCategory = {
  id: number;
  name: string;
};

export type DocumentAccessRole = "OWNER" | "EDITOR" | "VIEWER";

export type Document = {
  id: number;
  name: string;
  description: string | null;
  originalName: string | null;
  mimeType: string | null;
  size: number | null;
  status: DocumentStatus;
  hasExtractedText: boolean;
  chunkCount: number;
  processingError: string | null;
  deletedAt: string | null;
  insights: DocumentInsights | null;
  insightsGeneratedAt: string | null;
  userId: number;
  categoryId: number | null;
  category: DocumentCategory | null;
  accessRole?: DocumentAccessRole;
  isFavorite?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DocumentInsights = {
  summary: string;
  topics: string[];
  dates: string[];
  entities: string[];
};

export type DocumentVersion = {
  id: number;
  version: number;
  originalName: string | null;
  mimeType: string | null;
  size: number | null;
  createdAt: string;
};

export type DocumentVersionsResponse = {
  documentId: number;
  current: {
    version: number;
    originalName: string | null;
    mimeType: string | null;
    size: number | null;
    updatedAt: string;
  } | null;
  versions: DocumentVersion[];
};

export type DocumentChunksInfo = {
  documentId: number;
  count: number;
  embeddedCount: number;
};

export type GeneratedInsights = {
  insights: DocumentInsights;
  insightsGeneratedAt: string;
};

export type DocumentText = {
  id: number;
  extractedText: string;
};

export type CreateDocumentPayload = {
  name: string;
  description?: string;
  categoryId?: number | null;
  file?: File;
};

export type UpdateDocumentPayload = {
  name?: string;
  description?: string;
  categoryId?: number | null;
};

export type DeleteDocumentResponse = {
  id: number;
  message: string;
};

export type SharedDocument = Document & {
  owner: { id: number; name: string };
  sharedAt: string | null;
};

export type ComparedDocumentInfo = {
  id: number;
  name: string;
  size: number | null;
  category: string | null;
  updatedAt: string;
  chunkCount: number;
  excerptsCompared: number;
};

export type DocumentComparisonResult = {
  documentA: ComparedDocumentInfo;
  documentB: ComparedDocumentInfo;
  comparison: {
    overview: string;
    similarities: string[];
    differences: { aspect: string; documentA: string; documentB: string }[];
    onlyInA: string[];
    onlyInB: string[];
  };
  generatedAt: string;
};
