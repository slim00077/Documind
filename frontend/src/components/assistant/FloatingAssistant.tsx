import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import CitedAnswer from "./CitedAnswer";
import { useLocation } from "react-router-dom";
import { Bot, Send, Square, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import SuggestedQuestions from "./SuggestedQuestions";
import { useAssistantConversation } from "../../hooks/useAssistantConversation";

export default function FloatingAssistant() {
  const { token } = useAuth();
  const location = useLocation();

  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, isSending, streamingMessageId, stopStreaming, error, sendMessage } = useAssistantConversation();

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isSending, isOpen]);

  if (!token || location.pathname.startsWith("/app/assistant")) {
    return null;
  }

  const submitQuestion = async () => {
    const trimmed = question.trim();
    if (!trimmed || isSending) return;
    setQuestion("");
    await sendMessage(trimmed);
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

  return (
    <>
      <button
        type="button"
        className="assistant-launcher"
        aria-label={isOpen ? "Close AI Assistant" : "Ask AI Assistant"}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((previous) => !previous)}
      >
        {isOpen ? <X /> : <Bot />}
      </button>

      {isOpen ? (
        <div
          className="assistant-panel"
          role="dialog"
          aria-label="DocuMind AI Assistant"
        >
          <div className="assistant-panel-header">
            <h2>DocuMind Assistant</h2>
            <button
              type="button"
              aria-label="Close assistant"
              onClick={() => setIsOpen(false)}
            >
              <X />
            </button>
          </div>

          <div className="assistant-panel-messages">
            {messages.length === 0 ? (
              <div className="assistant-panel-empty">
                <div className="empty-icon">
                  <Bot />
                </div>
                <h3>Ask about your documents</h3>
                <p>
                  I'll search your uploaded documents and answer using only
                  what I find there.
                </p>
                <SuggestedQuestions mode="start" disabled={isSending} onPick={(picked) => void sendMessage(picked)} />
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`chat-message chat-message-${message.role.toLowerCase()}${message.id === streamingMessageId ? " chat-message-streaming" : ""}`}
                >
                  {message.role === "ASSISTANT" ? (
                    <CitedAnswer content={message.content} sources={message.sources} />
                  ) : (
                    message.content
                  )}
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

          {messages.length > 0 && !isSending ? (
            <SuggestedQuestions mode="followup" onPick={(picked) => void sendMessage(picked)} />
          ) : null}

          <form className="assistant-panel-composer" onSubmit={onSubmit}>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask a question about your documents"
              aria-label="Message the AI assistant"
              rows={1}
              disabled={isSending}
            />
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
      ) : null}
    </>
  );
}
