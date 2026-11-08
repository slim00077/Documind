import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Bot,
  FileText,
  HardDrive,
  MessageSquare,
  ShieldCheck,
  UserCheck,
  Users,
  UserX,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ApiError, getAdminStatsRequest, getAiMonitoringRequest } from "../../services/admin.api";
import type { AdminStatsOverview, AiMonitoringSnapshot } from "../../types/admin";
import { PageState } from "../../components/ui/PageState";
import { SkeletonMetricCard } from "../../components/ui/Skeleton";
import { formatFileSize } from "../../utils/formatFileSize";
import { formatRelativeTime } from "../../utils/formatRelativeTime";
import GlassCard from "../../components/ui/GlassCard";

const ACTION_LABELS: Record<string, string> = {
  LOGIN: "Logged in",
  REGISTER: "Registered",
  DOCUMENT_UPLOAD: "Uploaded a document",
  DOCUMENT_UPDATE: "Updated a document",
  DOCUMENT_DELETE: "Deleted a document",
  PERMISSION_GRANT: "Granted a permission",
  PERMISSION_UPDATE: "Updated a permission",
  PERMISSION_REVOKE: "Revoked a permission",
  USER_UPDATE: "Updated a user",
  USER_DISABLE: "Disabled a user",
  USER_ENABLE: "Enabled a user",
  USER_DELETE: "Deleted a user",
  USER_ROLE_CHANGE: "Changed a user's role",
  CATEGORY_CREATE: "Created a category",
  CATEGORY_UPDATE: "Updated a category",
  CATEGORY_DELETE: "Deleted a category",
};

export default function AdminOverviewPage() {
  const { token } = useAuth();
  const [stats, setStats] = useState<AdminStatsOverview | null>(null);
  const [ai, setAi] = useState<AiMonitoringSnapshot | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const load = async (activeToken: string) => {
    setIsLoading(true);
    setError("");
    try {
      const [result, aiSnapshot] = await Promise.all([
        getAdminStatsRequest(activeToken),
        getAiMonitoringRequest(activeToken).catch(() => null),
      ]);
      setStats(result);
      setAi(aiSnapshot);
    } catch (loadError) {
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : "Unable to load admin statistics right now."
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    void load(token);
  }, [token]);

  if (isLoading) {
    return (
      <section className="page-stack">
        <div className="page-heading">
          <div>
            <p className="section-kicker">Admin dashboard</p>
            <h1>Overview</h1>
            <p>Loading platform statistics...</p>
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

  if (error || !stats) {
    return (
      <section className="page-stack">
        <PageState
          icon={AlertTriangle}
          title="Couldn't load admin statistics"
          message={error}
          tone="error"
          action={
            <button className="button button-secondary" type="button" onClick={() => token && void load(token)}>
              Try again
            </button>
          }
        />
      </section>
    );
  }

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="section-kicker">Admin dashboard</p>
          <h1>Platform overview</h1>
          <p>Real-time statistics across users, documents, and the AI assistant.</p>
        </div>
        <Link className="button button-primary" to="/admin/users">
          <Users /> Manage users
        </Link>
      </div>

      <div className="metric-grid">
        <GlassCard as="article" tone="violet" className="metric-card">
          <Users />
          <span>Total users</span>
          <strong>{stats.users.total}</strong>
          <small>{stats.users.newThisWeek} new in the last 7 days.</small>
        </GlassCard>
        <GlassCard as="article" tone="cyan" className="metric-card">
          <UserCheck />
          <span>Active users</span>
          <strong>{stats.users.active}</strong>
          <small>{stats.users.students} students, {stats.users.teachers} teachers, {stats.users.admins} admin{stats.users.admins === 1 ? "" : "s"}.</small>
        </GlassCard>
        <GlassCard as="article" tone="blue" className="metric-card">
          <UserX />
          <span>Disabled users</span>
          <strong>{stats.users.disabled}</strong>
          <small>Blocked from signing in.</small>
        </GlassCard>
        <GlassCard as="article" tone="lavender" className="metric-card">
          <FileText />
          <span>Documents</span>
          <strong>{stats.documents.total}</strong>
          <small>{stats.documents.newThisWeek} uploaded this week.</small>
        </GlassCard>
      </div>

      <div className="dashboard-panels">
        <GlassCard as="article" tone="violet" className="workspace-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Storage</p>
              <h2>Document pipeline</h2>
            </div>
            <HardDrive />
          </div>
          <dl className="insights-list">
            <div>
              <dt>Total storage used</dt>
              <dd>{formatFileSize(stats.documents.totalStorageBytes)}</dd>
            </div>
            <div>
              <dt>Categories</dt>
              <dd>{stats.categories.total}</dd>
            </div>
            <div>
              <dt>AI conversations</dt>
              <dd>{stats.assistant.conversations}</dd>
            </div>
            <div>
              <dt>AI messages</dt>
              <dd>{stats.assistant.messages}</dd>
            </div>
          </dl>
          <div className="pipeline-summary">
            {Object.entries(stats.documents.byStatus).map(([status, count]) => (
              <div className="pipeline-stage" key={status}>
                <span className="pipeline-stage-count">{count}</span>
                <span>{status.charAt(0) + status.slice(1).toLowerCase()}</span>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard as="article" tone="cyan" className="workspace-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">AI usage</p>
              <h2>Providers &amp; tokens</h2>
            </div>
            <Bot />
          </div>
          {ai ? (
            <>
              <dl className="insights-list">
                <div><dt>Requests since restart</dt><dd>{ai.live.totals.requests}</dd></div>
                <div><dt>Errors / fallbacks</dt><dd>{ai.live.totals.errors} / {ai.live.totals.fallbacks}</dd></div>
                <div><dt>Estimated tokens (in / out)</dt><dd>{ai.live.totals.estimatedInputTokens.toLocaleString()} / {ai.live.totals.estimatedOutputTokens.toLocaleString()}</dd></div>
                <div><dt>Assistant answers (24h / 7d)</dt><dd>{ai.persisted.assistantAnswersLast24h} / {ai.persisted.assistantAnswersLast7d}</dd></div>
              </dl>
              <div className="form-actions">
                <Link className="text-link" to="/admin/ai-monitoring">Open provider monitoring</Link>
              </div>
            </>
          ) : (
            <p className="inline-empty">AI monitoring data is unavailable right now.</p>
          )}
        </GlassCard>

        <article className="workspace-panel activity-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Recent activity</p>
              <h2>Latest audit log entries</h2>
            </div>
            <ShieldCheck />
          </div>
          {stats.recentActivity.length === 0 ? (
            <p>No activity recorded yet.</p>
          ) : (
            <ul className="activity-feed">
              {stats.recentActivity.map((entry) => (
                <li key={entry.id} className="activity-feed-item">
                  <span className="activity-feed-link">
                    <span className="activity-feed-icon">
                      <MessageSquare />
                    </span>
                    <span className="activity-feed-body">
                      <strong>{entry.actorName ?? entry.actor?.name ?? "System"}</strong>
                      <span>{ACTION_LABELS[entry.action] ?? entry.action}</span>
                    </span>
                    <span className="activity-feed-time">{formatRelativeTime(entry.createdAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="form-actions">
            <Link className="text-link" to="/admin/audit-logs">
              View all audit logs
            </Link>
          </div>
        </article>
      </div>
    </section>
  );
}
