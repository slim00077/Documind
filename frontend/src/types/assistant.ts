export type AssistantSource = {
  chunkId: number;
  documentId: number;
  documentName: string;
  chunkIndex: number;
  similarity: number;
  /** Set when the passage came from an image, chart, diagram or scanned page. */
  visual?: { label: string; documentIsImage: boolean } | null;
};

export type AskResponse = {
  question: string;
  answer: string;
  sources: AssistantSource[];
};

export type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: AssistantSource[];
  createdAt: string;
};

export type ConversationSummary = {
  id: number;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessage: {
    content: string;
    role: "USER" | "ASSISTANT";
    createdAt: string;
  } | null;
};

export type ConversationMessage = {
  id: number;
  conversationId: number;
  role: "USER" | "ASSISTANT";
  content: string;
  sources: AssistantSource[] | null;
  createdAt: string;
};

export type Conversation = {
  id: number;
  userId: number;
  title: string | null;
  lastDocumentId: number | null;
  scopedDocumentId?: number | null;
  scopedDocument?: { id: number; name: string } | null;
  createdAt: string;
  updatedAt: string;
  messages: ConversationMessage[];
};

export type AgentAnalysisEvent =
  | { type: "step"; text: string }
  | { type: "delta"; text: string }
  | {
      type: "done";
      result: { report: string; sources: AssistantSource[]; conversationId: number | null; llmCalls: number };
    };
