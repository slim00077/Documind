import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Bot, FileText, Microscope, Plus, Send, Square, Trash2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { ApiError, analyzeDocumentsRequest } from "../services/assistant.api";
import type { AssistantSource } from "../types/assistant";
import SuggestedQuestions from "../components/assistant/SuggestedQuestions";
import { useAssistantConversation } from "../hooks/useAssistantConversation";

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isSameDay = date.toDateString() === now.toDateString();

  if (isSameDay) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function AssistantPage() {
  const {
    conversations,
    activeId,
    messages,
    isLoadingConversation,
    isSending,
    streamingMessageId,
    stopStreaming,
    error,
    scopedDocument,
    startDocumentConversation,
    selectConversation,
    refreshList,
    startNewConversation,
    deleteConversation,
    sendMessage,
  } = useAssistantConversation();

  const { token } = useAuth();
  const [question, setQuestion] = useState("");
  const [analysis, setAnalysis] = useState<{
    task: string;
    steps: string[];
    report: string;
    sources: AssistantSource[];
    running: boolean;
    error: string;
  } | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const handledDocumentParam = useRef<string | null>(null);

  const documentParam = searchParams.get("document");
  useEffect(() => {
    const documentId = Number(documentParam);
    if (!documentParam || !Number.isInteger(documentId) || handledDocumentParam.current === documentParam) {
      return;
    }
    handledDocumentParam.current = documentParam;
    setSearchParams({}, { replace: true });
    void startDocumentConversation(documentId);
  }, [documentParam, setSearchParams, startDocumentConversation]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  const submitQuestion = async () => {
    const trimmed = question.trim();
    if (!trimmed || isSending) return;
    setQuestion("");
    await sendMessage(trimmed);
  };

  const runAnalysis = async () => {
    const task = question.trim();
    if (!task || !token || isSending || analysis?.running) return;
    setQuestion("");
    setAnalysis({ task, steps: [], report: "", sources: [], running: true, error: "" });
    try {
      const result = await analyzeDocumentsRequest(
        token,
        task,
        scopedDocument ? [scopedDocument.id] : undefined,
        (event) =>
          setAnalysis((previous) =>
            previous
              ? event.type === "step"
                ? { ...previous, steps: [...previous.steps, event.text] }
                : event.type === "delta"
                  ? { ...previous, report: previous.report + event.text }
                  : previous
              : previous,
          ),
        undefined,
        activeId,
      );
      if (result.conversationId !== null) {
        // Saved to history: reopen it from the server so it matches a reload.
        await refreshList();
        await selectConversation(result.conversationId);
        setAnalysis(null);
      } else {
        setAnalysis((previous) =>
          previous ? { ...previous, report: result.report, sources: result.sources, running: false } : previous,
        );
      }
    } catch (err) {
      setAnalysis((previous) =>
        previous
          ? {
              ...previous,
              running: false,
              error: err instanceof ApiError ? err.message : "Analysis failed. Please try again.",
            }
          : previous,
      );
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitQuestion();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitQuestion();
    }
  };

  const onDeleteConversation = (event: MouseEvent, id: number) => {
    event.stopPropagation();
    if (window.confirm("Delete this conversation? This can't be undone.")) {
      void deleteConversation(id);
    }
  };

  return (
    <section className="page-stack assistant-page">
      <div className="page-heading">
        <div>
          <p className="section-kicker">Document intelligence</p>
          <h1>AI Assistant</h1>
          <p>Ask questions about your documents in plain language.</p>
        </div>
        <button type="button" className="button button-primary" onClick={startNewConversation}>
          <Plus /> New Chat
        </button>
      </div>

      {scopedDocument ? (
        <div className="scope-banner">
          <FileText /> Answering from <Link to={`/app/documents/${scopedDocument.id}`}>{scopedDocument.name}</Link> only
        </div>
      ) : null}

      <div className="assistant-page-layout">
        <aside className="assistant-history-sidebar">
          <h2>History</h2>
          {conversations.length === 0 ? (
            <p className="assistant-history-empty">No conversations yet.</p>
          ) : (
            <ul className="assistant-history-list">
              {conversations.map((conversation) => (
                <li
                  key={conversation.id}
                  className={`assistant-history-item ${activeId === conversation.id ? "active" : ""}`}
                >
                  <button
                    type="button"
                    className="assistant-history-item-main"
                    onClick={() => void selectConversation(conversation.id)}
                  >
                    <span className="assistant-history-title">
                      {conversation.title ?? "New conversation"}
                    </span>
                    <span className="assistant-history-meta">
                      {formatRelativeDate(conversation.updatedAt)}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="assistant-history-delete"
                    aria-label="Delete conversation"
                    onClick={(event) => onDeleteConversation(event, conversation.id)}
                  >
                    <Trash2 />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="assistant-workspace assistant-chat-panel">
          <div className="assistant-panel-messages assistant-page-messages">
            {isLoadingConversation ? (
              <div className="assistant-empty compact-empty">
                <p>Loading conversation…</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="assistant-empty compact-empty">
                <div className="empty-icon">
                  <Bot />
                </div>
                <h2>Ask about your documents</h2>
                <p>
                  Mention a document by name, ask for a summary, or just ask a
                  natural question - I'll search your documents and answer
                  using only what I find there.
                </p>
                <SuggestedQuestions
                  mode="start"
                  scopedDocument={scopedDocument}
                  disabled={isSending}
                  onPick={(picked) => void sendMessage(picked)}
                />
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`chat-message chat-message-${message.role.toLowerCase()}${message.id === streamingMessageId ? " chat-message-streaming" : ""}`}
                >
                  {message.content}
                </div>
              ))
            )}

            {isSending && streamingMessageId === null ? (
              <div
                className="chat-typing"
                aria-live="polite"
                aria-label="Assistant is thinking"
              >
                <span />
                <span />
                <span />
              </div>
            ) : null}

            {error ? (
              <div className="chat-message chat-message-error" role="alert">
                {error}
              </div>
            ) : null}

            <div ref={messagesEndRef} />
          </div>

          {messages.length > 0 && !isSending && !isLoadingConversation ? (
            <SuggestedQuestions mode="followup" onPick={(picked) => void sendMessage(picked)} />
          ) : null}

          {analysis ? (
            <div className="chat-message chat-message-assistant" aria-live="polite">
              <strong>Deep analysis: {analysis.task}</strong>
              {analysis.steps.length > 0 ? (
                <ul>
                  {analysis.steps.map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
                </ul>
              ) : null}
              {analysis.running && !analysis.report ? <p>Working…</p> : null}
              {analysis.report ? <div style={{ whiteSpace: "pre-wrap" }}>{analysis.report}</div> : null}
              {analysis.error ? <p role="alert">{analysis.error}</p> : null}
              {analysis.sources.length > 0 ? (
                <p>
                  Sources:{" "}
                  {[...new Set(analysis.sources.map((source) => source.documentName))].join(", ")}
                </p>
              ) : null}
              {!analysis.running ? (
                <button type="button" className="button" onClick={() => setAnalysis(null)}>
                  Dismiss
                </button>
              ) : null}
            </div>
          ) : null}

          <form
            className="assistant-panel-composer assistant-page-composer"
            onSubmit={onSubmit}
          >
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={scopedDocument ? `Ask about ${scopedDocument.name}` : "Ask a question about your documents"}
              aria-label="Message the AI assistant"
              rows={1}
              disabled={isSending}
            />
            <button
              type="button"
              aria-label="Deep analysis (agent)"
              title="Deep analysis: the agent searches and compares your documents and writes a report"
              disabled={!question.trim() || isSending || Boolean(analysis?.running)}
              onClick={() => void runAnalysis()}
            >
              <Microscope />
            </button>
            {isSending ? (
            <button type="button" aria-label="Stop generating" onClick={stopStreaming}>
              <Square />
            </button>
          ) : (
            <button
              type="submit"
              aria-label="Send message"
              disabled={!question.trim()}
            >
              <Send />
            </button>
          )}
          </form>
        </div>
      </div>
    </section>
  );
}
