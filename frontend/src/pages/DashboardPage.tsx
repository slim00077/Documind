import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  FileText,
  FolderOpen,
  HardDrive,
  Loader2,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { ApiError, listDocumentsRequest } from "../services/documents.api";
import { listCategoriesRequest } from "../services/categories.api";
import { listConversationsRequest } from "../services/assistant.api";
import type { Document } from "../types/document";
import type { Category } from "../types/category";
import type { ConversationSummary } from "../types/assistant";
import { PageState } from "../components/ui/PageState";
import { SkeletonMetricCard } from "../components/ui/Skeleton";
import { formatFileSize } from "../utils/formatFileSize";
import { formatRelativeTime } from "../utils/formatRelativeTime";

type ActivityItem = {
  id: string;
  icon: typeof FileText;
  title: string;
  detail: string;
  timestamp: string;
  href: string;
};

export default function DashboardPage() {
  const { token, user } = useAuth();

  const [documents, setDocuments] = useState<Document[] | null>(null);
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadAll = async (activeToken: string) => {
    setIsLoading(true);
    setError("");

    try {
      const [documentsResult, categoriesResult, conversationsResult] = await Promise.all([
        listDocumentsRequest(activeToken),
        listCategoriesRequest(activeToken),
        listConversationsRequest(activeToken).catch(() => []),
      ]);
      setDocuments(documentsResult);
      setCategories(categoriesResult);
      setConversations(conversationsResult);
    } catch (loadError) {
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : "Unable to load your workspace overview right now."
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadAll(token);
  }, [token]);

  const stats = useMemo(() => {
    const docs = documents ?? [];

    const readyCount = docs.filter((doc) => doc.status === "READY" || doc.status === "COMPLETED").length;
    const processingCount = docs.filter((doc) =>
      ["PENDING", "UPLOADED", "PROCESSING"].includes(doc.status)
    ).length;
    const failedCount = docs.filter((doc) => doc.status === "FAILED").length;
    const totalSize = docs.reduce((sum, doc) => sum + (doc.size ?? 0), 0);
    const averageSize = docs.length > 0 ? totalSize / docs.length : 0;

    const categoryCounts = new Map<number, number>();
    for (const doc of docs) {
      if (doc.categoryId) {
        categoryCounts.set(doc.categoryId, (categoryCounts.get(doc.categoryId) ?? 0) + 1);
      }
    }

    const topCategories = (categories ?? [])
      .map((category) => ({ category, count: categoryCounts.get(category.id) ?? 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);

    return { readyCount, processingCount, failedCount, totalSize, averageSize, topCategories };
  }, [documents, categories]);

  const recentActivity = useMemo<ActivityItem[]>(() => {
    const documentItems: ActivityItem[] = (documents ?? []).map((doc) => ({
      id: `doc-${doc.id}`,
      icon: FileText,
      title: doc.name,
      detail: `Document ${doc.status === "FAILED" ? "failed to process" : doc.status.toLowerCase()}`,
      timestamp: doc.updatedAt,
      href: `/app/documents/${doc.id}`,
    }));

    const conversationItems: ActivityItem[] = (conversations ?? [])
      .filter((conversation) => conversation.lastMessage)
      .map((conversation) => ({
        id: `conv-${conversation.id}`,
        icon: Bot,
        title: conversation.title || "AI conversation",
        detail: conversation.lastMessage!.content.slice(0, 80),
        timestamp: conversation.lastMessage!.createdAt,
        href: "/app/assistant",
      }));

    return [...documentItems, ...conversationItems]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 6);
  }, [documents, conversations]);

  const recentDocuments = useMemo(
    () =>
      [...(documents ?? [])]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5),
    [documents]
  );

  if (isLoading) {
    return (
      <section className="page-stack">
        <div className="page-heading">
          <div>
            <p className="section-kicker">Workspace overview</p>
            <h1>Welcome back{user ? `, ${user.name}` : ""}</h1>
            <p>Loading your workspace overview...</p>
          </div>
        </div>
        <div className="metric-grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonMetricCard key={index} />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="page-stack">
        <PageState
          icon={AlertTriangle}
          title="Couldn't load your dashboard"
          message={error}
          tone="error"
          action={
            <button className="button button-secondary" type="button" onClick={() => token && void loadAll(token)}>
              Try again
            </button>
          }
        />
      </section>
    );
  }

  const docs = documents ?? [];

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="section-kicker">Workspace overview</p>
          <h1>Welcome back{user ? `, ${user.name}` : ""}</h1>
          <p>
            {docs.length === 0
              ? "Your library is ready for its first upload."
              : `Tracking ${docs.length} document${docs.length === 1 ? "" : "s"} across ${
                  (categories ?? []).length
                } categor${(categories ?? []).length === 1 ? "y" : "ies"}.`}
          </p>
        </div>
        <Link className="button button-primary" to="/app/documents">
          <FileText /> Go to Documents
        </Link>
      </div>

      <div className="metric-grid">
        <article className="metric-card">
          <FileText />
          <span>Documents</span>
          <strong>{docs.length}</strong>
          <small>{formatFileSize(stats.totalSize)} stored across your library.</small>
        </article>
        <article className="metric-card">
          <CheckCircle2 />
          <span>Ready</span>
          <strong>{stats.readyCount}</strong>
          <small>Fully processed and searchable.</small>
        </article>
        <article className="metric-card">
          <Loader2 />
          <span>Processing</span>
          <strong>{stats.processingCount}</strong>
          <small>Currently being uploaded or analyzed.</small>
        </article>
        <article className="metric-card">
          <AlertTriangle />
          <span>Failed</span>
          <strong>{stats.failedCount}</strong>
          <small>Needs attention -- check document details.</small>
        </article>
      </div>

      <div className="dashboard-panels">
        <article className="workspace-panel activity-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Recent activity</p>
              <h2>{recentActivity.length === 0 ? "Nothing to show yet" : "What's been happening"}</h2>
            </div>
            <Sparkles />
          </div>
          {recentActivity.length === 0 ? (
            <p>Upload a document or ask the AI assistant a question to start building activity here.</p>
          ) : (
            <ul className="activity-feed">
              {recentActivity.map((item) => (
                <li key={item.id} className="activity-feed-item">
                  <Link to={item.href} className="activity-feed-link">
                    <span className="activity-feed-icon">
                      <item.icon />
                    </span>
                    <span className="activity-feed-body">
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                    </span>
                    <span className="activity-feed-time">{formatRelativeTime(item.timestamp)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="workspace-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Storage insights</p>
              <h2>Library composition</h2>
            </div>
            <HardDrive />
          </div>
          <dl className="insights-list">
            <div>
              <dt>Total storage</dt>
              <dd>{formatFileSize(stats.totalSize)}</dd>
            </div>
            <div>
              <dt>Average file size</dt>
              <dd>{docs.length > 0 ? formatFileSize(stats.averageSize) : "--"}</dd>
            </div>
            <div>
              <dt>AI conversations</dt>
              <dd>{(conversations ?? []).length}</dd>
            </div>
          </dl>
          {stats.topCategories.length > 0 ? (
            <div className="category-bars">
              {stats.topCategories.map(({ category, count }) => (
                <div className="category-bar-row" key={category.id}>
                  <span>
                    <FolderOpen /> {category.name}
                  </span>
                  <div className="category-bar-track">
                    <div
                      className="category-bar-fill"
                      style={{
                        width: `${docs.length > 0 ? Math.round((count / docs.length) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  <span className="category-bar-count">{count}</span>
                </div>
              ))}
            </div>
          ) : null}
        </article>
      </div>

      <article className="workspace-panel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Processing pipeline</p>
            <h2>Where your documents stand</h2>
          </div>
          <Activity />
        </div>
        <div className="pipeline-summary">
          <div className="pipeline-stage">
            <span className="pipeline-stage-count">{stats.processingCount}</span>
            <span>In progress</span>
          </div>
          <div className="pipeline-stage pipeline-stage-ready">
            <span className="pipeline-stage-count">{stats.readyCount}</span>
            <span>Ready</span>
          </div>
          <div className="pipeline-stage pipeline-stage-failed">
            <span className="pipeline-stage-count">{stats.failedCount}</span>
            <span>Failed</span>
          </div>
        </div>
        {recentDocuments.length > 0 ? (
          <ul className="recent-documents-list">
            {recentDocuments.map((doc) => (
              <li key={doc.id}>
                <Link to={`/app/documents/${doc.id}`}>
                  <FileText /> {doc.name}
                </Link>
                <span>{formatRelativeTime(doc.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </article>

      {(conversations ?? []).length === 0 ? (
        <article className="workspace-panel quick-start-panel">
          <p className="section-kicker">Getting started</p>
          <h2>Ask your documents a question</h2>
          <p>Once your documents finish processing, the AI Assistant can answer questions grounded in their content.</p>
          <Link className="button button-primary" to="/app/assistant">
            <MessageSquare /> Open AI Assistant
          </Link>
        </article>
      ) : null}
    </section>
  );
}
