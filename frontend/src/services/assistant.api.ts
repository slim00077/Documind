import { AGENT_API_URL, ASSISTANT_API_URL, CONVERSATIONS_API_URL } from "../config/api";
import type {
  AssistantSource,
  AgentAnalysisEvent,
  AskResponse,
  Conversation,
  ConversationMessage,
  ConversationSummary,
} from "../types/assistant";
import i18n from "../i18n";

export class ApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

const extractErrorMessage = (data: { message?: string | string[] }): string =>
  Array.isArray(data.message)
    ? data.message.join(" ")
    : (data.message ?? i18n.t("Request failed"));

async function request<T>(
  url: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });

  const data = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
  } & Partial<T>;

  if (!response.ok) {
    throw new ApiError(extractErrorMessage(data), response.status);
  }

  return data as T;
}

export const askAssistantRequest = async (
  token: string,
  question: string
): Promise<AskResponse> => {
  return request<AskResponse>(`${ASSISTANT_API_URL}/ask`, token, {
    method: "POST",
    body: JSON.stringify({ question }),
  });
};

export const listConversationsRequest = (
  token: string,
): Promise<ConversationSummary[]> =>
  request<ConversationSummary[]>(CONVERSATIONS_API_URL, token);

export const createConversationRequest = (
  token: string,
  documentId?: number,
): Promise<Conversation> =>
  request<Conversation>(CONVERSATIONS_API_URL, token, {
    method: "POST",
    body: JSON.stringify(documentId !== undefined ? { documentId } : {}),
  });

export const getConversationRequest = (
  token: string,
  id: number,
): Promise<Conversation> =>
  request<Conversation>(`${CONVERSATIONS_API_URL}/${id}`, token);

export const deleteConversationRequest = (
  token: string,
  id: number,
): Promise<{ id: number }> =>
  request<{ id: number }>(`${CONVERSATIONS_API_URL}/${id}`, token, {
    method: "DELETE",
  });

export const sendConversationMessageRequest = (
  token: string,
  id: number,
  content: string,
): Promise<ConversationMessage> =>
  request<ConversationMessage>(
    `${CONVERSATIONS_API_URL}/${id}/messages`,
    token,
    {
      method: "POST",
      body: JSON.stringify({ content }),
    },
  );

/**
 * POSTs a message and reads the SSE reply, calling onDelta for each text
 * chunk. Resolves with the saved assistant message; rejects with ApiError on
 * failure, or an AbortError if the signal is aborted.
 */
export const streamConversationMessageRequest = async (
  token: string,
  id: number,
  content: string,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<ConversationMessage> => {
  const response = await fetch(`${CONVERSATIONS_API_URL}/${id}/messages/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ content }),
    signal,
  });

  if (!response.ok || !response.body) {
    const data = (await response.json().catch(() => ({}))) as { message?: string | string[] };
    throw new ApiError(extractErrorMessage(data), response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalMessage: ConversationMessage | null = null;

  const handleBlock = (block: string) => {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) return;
    const data = JSON.parse(dataLines.join("\n")) as {
      text?: string;
      message?: ConversationMessage | string;
      statusCode?: number;
    };

    if (event === "delta" && data.text) {
      onDelta(data.text);
    } else if (event === "done") {
      finalMessage = data.message as ConversationMessage;
    } else if (event === "error") {
      throw new ApiError(
        typeof data.message === "string" ? data.message : i18n.t("Request failed"),
        data.statusCode ?? 500,
      );
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";
    blocks.forEach(handleBlock);
  }

  if (!finalMessage) {
    throw new ApiError(i18n.t("The response ended unexpectedly. Please try again."), 502);
  }
  return finalMessage;
};

/**
 * Runs the document-analysis agent and reads its SSE reply, calling onEvent
 * for each step / report delta. Resolves with the final report and sources.
 */
export const analyzeDocumentsRequest = async (
  token: string,
  task: string,
  documentIds: number[] | undefined,
  onEvent: (event: AgentAnalysisEvent) => void,
  signal?: AbortSignal,
  conversationId?: number | null,
): Promise<{ report: string; sources: AssistantSource[]; conversationId: number | null }> => {
  const response = await fetch(`${AGENT_API_URL}/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ task, documentIds, conversationId: conversationId ?? undefined }),
    signal,
  });

  if (!response.ok || !response.body) {
    const data = (await response.json().catch(() => ({}))) as { message?: string | string[] };
    throw new ApiError(extractErrorMessage(data), response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final: { report: string; sources: AssistantSource[]; conversationId: number | null } | null = null;

  const handleBlock = (block: string) => {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) return;
    const data = JSON.parse(dataLines.join("\n")) as AgentAnalysisEvent & {
      message?: string;
      statusCode?: number;
    };
    if (event === "error") {
      throw new ApiError(data.message ?? i18n.t("Request failed"), data.statusCode ?? 500);
    }
    if (event === "step" || event === "delta") onEvent(data);
    if (event === "done" && data.type === "done") final = data.result;
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";
    blocks.forEach(handleBlock);
  }

  if (!final) {
    throw new ApiError(i18n.t("The analysis ended unexpectedly. Please try again."), 502);
  }
  return final;
};
