import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Bot, FileText, MessageSquare, type LucideIcon } from "lucide-react";
import type { Document } from "../../types/document";
import type { ConversationSummary } from "../../types/assistant";
import { PageState } from "../../components/ui/PageState";
import GlassCard from "../../components/ui/GlassCard";
import { formatRelativeTime } from "../../utils/formatRelativeTime";

export function Hello({ eyebrow, name, text, actions }: { eyebrow: string; name?: string; text: string; actions?: ReactNode }) {
  return (
    <div className="hello">
      <div>
        <p className="section-kicker">{eyebrow}</p>
        <h1>Welcome back{name ? `, ${name.split(" ")[0]}` : ""}</h1>
        <p>{text}</p>
      </div>
      {actions ? <div className="quick-actions">{actions}</div> : null}
    </div>
  );
}

export function Panel({ title, to, linkLabel = "View all", children }: { title: string; to?: string; linkLabel?: string; children: ReactNode }) {
  // AI panels get the glass treatment; document lists stay solid for readability.
  const Wrapper = title.split(" ").includes("AI") ? GlassCard : "section";
  return (
    <Wrapper className="workspace-panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {to ? <Link to={to}>{linkLabel}</Link> : null}
      </div>
      {children}
    </Wrapper>
  );
}

export function DocumentList({ documents, empty, icon: Icon = FileText }: { documents: Document[]; empty: string; icon?: LucideIcon }) {
  if (documents.length === 0) return <p className="inline-empty">{empty}</p>;
  return (
    <ul className="mini-list">
      {documents.map((doc) => (
        <li key={doc.id}>
          <Link to={`/app/documents/${doc.id}`}>
            <span className="mini-icon"><Icon /></span>
            <span className="mini-body">
              <strong>{doc.name}</strong>
              <span>{doc.category?.name ?? doc.originalName ?? "Uncategorized"}</span>
            </span>
            <span className="mini-time">{formatRelativeTime(doc.createdAt)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ConversationList({ conversations }: { conversations: ConversationSummary[] }) {
  if (conversations.length === 0) return <p className="inline-empty">No conversations yet. Ask the assistant a question to start one.</p>;
  return (
    <ul className="mini-list">
      {conversations.map((conversation) => (
        <li key={conversation.id}>
          <Link to="/app/assistant">
            <span className="mini-icon"><MessageSquare /></span>
            <span className="mini-body">
              <strong>{conversation.title || "AI conversation"}</strong>
              <span>{conversation.lastMessage?.content.slice(0, 70) ?? "No messages"}</span>
            </span>
            <span className="mini-time">{formatRelativeTime(conversation.updatedAt)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function AssistantShortcut() {
  return (
    <section className="workspace-panel">
      <div className="panel-head"><h2>AI Assistant</h2><Bot size={18} /></div>
      <p className="inline-empty" style={{ paddingTop: 0 }}>Ask questions about your documents and get answers with clickable citations.</p>
      <Link className="button button-primary" to="/app/assistant"><MessageSquare /> Ask a question</Link>
    </section>
  );
}

export function DashboardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <PageState
      icon={AlertTriangle}
      title="Couldn't load your dashboard"
      message={message}
      tone="error"
      action={<button className="button button-secondary" type="button" onClick={onRetry}>Try again</button>}
    />
  );
}
