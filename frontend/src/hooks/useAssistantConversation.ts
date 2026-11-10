import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  ApiError,
  createConversationRequest,
  deleteConversationRequest,
  getConversationRequest,
  listConversationsRequest,
  streamConversationMessageRequest,
} from "../services/assistant.api";
import type { Conversation, ConversationMessage, ConversationSummary } from "../types/assistant";
import i18n from "../i18n";

const ACTIVE_CONVERSATION_KEY = "documind-active-conversation-id";

function readStoredActiveId(): number | null {
  try {
    const raw = window.localStorage.getItem(ACTIVE_CONVERSATION_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredActiveId(id: number | null) {
  try {
    if (id === null) {
      window.localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
    } else {
      window.localStorage.setItem(ACTIVE_CONVERSATION_KEY, String(id));
    }
  } catch {
    // localStorage unavailable (private mode, etc.) - active conversation
    // simply won't survive a reload, which is a safe degradation.
  }
}

const friendlyError = (err: unknown, fallback: string): string =>
  err instanceof ApiError ? err.message : fallback;

export function useAssistantConversation() {
  const { token } = useAuth();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<number | null>(() =>
    readStoredActiveId(),
  );
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [error, setError] = useState("");
  const [scopedDocument, setScopedDocument] = useState<{ id: number; name: string } | null>(null);

  const refreshList = useCallback(async () => {
    if (!token) return;
    setIsLoadingList(true);
    try {
      const list = await listConversationsRequest(token);
      setConversations(list);
    } catch (err) {
      setError(friendlyError(err, i18n.t("Unable to load conversation history.")));
    } finally {
      setIsLoadingList(false);
    }
  }, [token]);

  const loadConversation = useCallback(
    async (id: number) => {
      if (!token) return;
      setIsLoadingConversation(true);
      setError("");
      try {
        const conversation: Conversation = await getConversationRequest(token, id);
        setMessages(conversation.messages);
        setScopedDocument(conversation.scopedDocument ?? null);
        setActiveId(id);
        writeStoredActiveId(id);
      } catch (err) {
        setError(friendlyError(err, i18n.t("Unable to open that conversation.")));
        setActiveId(null);
        writeStoredActiveId(null);
        setMessages([]);
        setScopedDocument(null);
      } finally {
        setIsLoadingConversation(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (!token) return;
    void refreshList();
  }, [token, refreshList]);

  useEffect(() => {
    if (!token) return;
    // A "Ask AI about this document" deep link opens its own conversation.
    if (new URLSearchParams(window.location.search).has("document")) return;
    const storedId = readStoredActiveId();
    if (storedId !== null) {
      void loadConversation(storedId);
    }
    // Only run once per token (e.g. on login) - explicit navigation is
    // handled by loadConversation/startNewConversation afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const startNewConversation = useCallback(() => {
    setActiveId(null);
    writeStoredActiveId(null);
    setMessages([]);
    setScopedDocument(null);
    setError("");
  }, []);

  const startDocumentConversation = useCallback(
    async (documentId: number) => {
      if (!token) return;
      setError("");
      setIsLoadingConversation(true);
      try {
        const created = await createConversationRequest(token, documentId);
        await refreshList();
        await loadConversation(created.id);
      } catch (err) {
        setError(friendlyError(err, i18n.t("Unable to open the assistant for that document.")));
        setIsLoadingConversation(false);
      }
    },
    [token, refreshList, loadConversation],
  );

  const removeConversation = useCallback(
    async (id: number) => {
      if (!token) return;
      try {
        await deleteConversationRequest(token, id);
        setConversations((previous) => previous.filter((c) => c.id !== id));
        if (activeId === id) {
          startNewConversation();
        }
      } catch (err) {
        setError(friendlyError(err, i18n.t("Unable to delete that conversation.")));
      }
    },
    [token, activeId, startNewConversation],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || !token || isSending) return;

      setError("");
      setIsSending(true);

      const optimisticUserMessage: ConversationMessage = {
        id: Date.now(),
        conversationId: activeId ?? 0,
        role: "USER",
        content: trimmed,
        sources: null,
        createdAt: new Date().toISOString(),
      };
      setMessages((previous) => [...previous, optimisticUserMessage]);

      try {
        let conversationId = activeId;

        if (conversationId === null) {
          const created = await createConversationRequest(token);
          conversationId = created.id;
          setActiveId(conversationId);
          writeStoredActiveId(conversationId);
        }

        const controller = new AbortController();
        abortRef.current = controller;
        const streamId = optimisticUserMessage.id + 1;

        const assistantMessage = await streamConversationMessageRequest(
          token,
          conversationId,
          trimmed,
          (text) => {
            setStreamingMessageId(streamId);
            setMessages((previous) =>
              previous.some((m) => m.id === streamId)
                ? previous.map((m) =>
                    m.id === streamId ? { ...m, content: m.content + text } : m,
                  )
                : [
                    ...previous,
                    {
                      id: streamId,
                      conversationId: conversationId ?? 0,
                      role: "ASSISTANT",
                      content: text,
                      sources: null,
                      createdAt: new Date().toISOString(),
                    },
                  ],
            );
          },
          controller.signal,
        );

        setMessages((previous) =>
          previous.some((m) => m.id === streamId)
            ? previous.map((m) => (m.id === streamId ? assistantMessage : m))
            : [...previous, assistantMessage],
        );
        await refreshList();
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // Cancelled by the user: keep whatever was streamed so far. The
          // server saves the partial answer, so a reload shows the same.
          await refreshList();
        } else {
          setError(
            friendlyError(
              err,
              i18n.t("Unable to reach the assistant right now. Please try again."),
            ),
          );
          // Reset the view to the pre-send state so the question can be
          // retried; the server only keeps the question, not a failed answer.
          setMessages((previous) =>
            previous.filter(
              (m) => m.id !== optimisticUserMessage.id && m.id !== optimisticUserMessage.id + 1,
            ),
          );
        }
      } finally {
        abortRef.current = null;
        setStreamingMessageId(null);
        setIsSending(false);
      }
    },
    [token, activeId, isSending, refreshList],
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    conversations,
    activeId,
    messages,
    isLoadingList,
    isLoadingConversation,
    isSending,
    streamingMessageId,
    stopStreaming,
    error,
    scopedDocument,
    startDocumentConversation,
    selectConversation: loadConversation,
    startNewConversation,
    deleteConversation: removeConversation,
    sendMessage,
    refreshList,
  };
}
