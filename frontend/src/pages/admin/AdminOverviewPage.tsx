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
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { ApiError, getAdminStatsRequest, getAiMonitoringRequest } from "../../services/admin.api";
import type { AdminStatsOverview, AiMonitoringSnapshot } from "../../types/admin";
import { PageState } from "../../components/ui/PageState";
import { SkeletonMetricCard } from "../../components/ui/Skeleton";
import { formatFileSize } from "../../utils/formatFileSize";
import { formatRelativeTime } from "../../utils/formatRelativeTime";
import GlassCard from "../../components/ui/GlassCard";
import { auditActionSentence } from "../../config/auditActions";
import { DOCUMENT_STATUS_LABEL } from "../../config/documents";
import type { DocumentStatus } from "../../types/document";
import { formatNumber } from "../../i18n/format";

export default function AdminOverviewPage() {
  const { t } = useTranslation();
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
          : t("Unable to load admin statistics right now.")
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
            <p className="section-kicker">{t("Admin dashboard")}</p>
            <h1>{t("Overview")}</h1>
            <p>{t("Loading platform statistics...")}</p>
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
          title={t("Couldn't load admin statistics")}
          message={error}
          tone="error"
          action={
            <button className="button button-secondary" type="button" onClick={() => token && void load(token)}>
              {t("Try again")}
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
          <p className="section-kicker">{t("Admin dashboard")}</p>
          <h1>{t("Platform overview")}</h1>
          <p>{t("Real-time statistics across users, documents, and the AI assistant.")}</p>
        </div>
        <Link className="button button-primary" to="/admin/users">
          <Users /> {t("Manage users")}
        </Link>
      </div>

      <div className="metric-grid">
        <GlassCard as="article" tone="violet" className="metric-card">
          <Users />
          <span>{t("Total users")}</span>
          <strong>{formatNumber(stats.users.total)}</strong>
          <small>{t("{{count}} new in the last 7 days.", { count: stats.users.newThisWeek })}</small>
        </GlassCard>
        <GlassCard as="article" tone="cyan" className="metric-card">
          <UserCheck />
          <span>{t("Active users")}</span>
          <strong>{formatNumber(stats.users.active)}</strong>
          <small>
            {t("{{count}} students", { count: stats.users.students })}, {t("{{count}} teachers", { count: stats.users.teachers })},{" "}
            {t("{{count}} admins", { count: stats.users.admins })}.
          </small>
        </GlassCard>
        <GlassCard as="article" tone="blue" className="metric-card">
          <UserX />
          <span>{t("Disabled users")}</span>
          <strong>{formatNumber(stats.users.disabled)}</strong>
          <small>{t("Blocked from signing in.")}</small>
        </GlassCard>
        <GlassCard as="article" tone="lavender" className="metric-card">
          <FileText />
          <span>{t("Documents")}</span>
          <strong>{formatNumber(stats.documents.total)}</strong>
          <small>{t("{{count}} uploaded this week.", { count: stats.documents.newThisWeek })}</small>
        </GlassCard>
      </div>

      <div className="dashboard-panels">
        <GlassCard as="article" tone="violet" className="workspace-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">{t("Storage")}</p>
              <h2>{t("Document pipeline")}</h2>
            </div>
            <HardDrive />
          </div>
          <dl className="insights-list">
            <div>
              <dt>{t("Total storage used")}</dt>
              <dd>{formatFileSize(stats.documents.totalStorageBytes)}</dd>
            </div>
            <div>
              <dt>{t("Categories")}</dt>
              <dd>{formatNumber(stats.categories.total)}</dd>
            </div>
            <div>
              <dt>{t("AI conversations")}</dt>
              <dd>{formatNumber(stats.assistant.conversations)}</dd>
            </div>
            <div>
              <dt>{t("AI messages")}</dt>
              <dd>{formatNumber(stats.assistant.messages)}</dd>
            </div>
          </dl>
          <div className="pipeline-summary">
            {Object.entries(stats.documents.byStatus).map(([status, count]) => (
              <div className="pipeline-stage" key={status}>
                <span className="pipeline-stage-count">{formatNumber(count)}</span>
                <span>
                  {status in DOCUMENT_STATUS_LABEL
                    ? t(DOCUMENT_STATUS_LABEL[status as DocumentStatus])
                    : status.charAt(0) + status.slice(1).toLowerCase()}
                </span>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard as="article" tone="cyan" className="workspace-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">{t("AI usage")}</p>
              <h2>{t("Providers & tokens")}</h2>
            </div>
            <Bot />
          </div>
          {ai ? (
            <>
              <dl className="insights-list">
                <div><dt>{t("Requests since restart")}</dt><dd>{formatNumber(ai.live.totals.requests)}</dd></div>
                <div><dt>{t("Errors / fallbacks")}</dt><dd>{formatNumber(ai.live.totals.errors)} / {formatNumber(ai.live.totals.fallbacks)}</dd></div>
                <div><dt>{t("Estimated tokens (in / out)")}</dt><dd>{formatNumber(ai.live.totals.estimatedInputTokens)} / {formatNumber(ai.live.totals.estimatedOutputTokens)}</dd></div>
                <div><dt>{t("Assistant answers (24h / 7d)")}</dt><dd>{formatNumber(ai.persisted.assistantAnswersLast24h)} / {formatNumber(ai.persisted.assistantAnswersLast7d)}</dd></div>
              </dl>
              <div className="form-actions">
                <Link className="text-link" to="/admin/ai-monitoring">{t("Open provider monitoring")}</Link>
              </div>
            </>
          ) : (
            <p className="inline-empty">{t("AI monitoring data is unavailable right now.")}</p>
          )}
        </GlassCard>

        <article className="workspace-panel activity-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">{t("Recent activity")}</p>
              <h2>{t("Latest audit log entries")}</h2>
            </div>
            <ShieldCheck />
          </div>
          {stats.recentActivity.length === 0 ? (
            <p>{t("No activity recorded yet.")}</p>
          ) : (
            <ul className="activity-feed">
              {stats.recentActivity.map((entry) => (
                <li key={entry.id} className="activity-feed-item">
                  <span className="activity-feed-link">
                    <span className="activity-feed-icon">
                      <MessageSquare />
                    </span>
                    <span className="activity-feed-body">
                      <strong>{entry.actorName ?? entry.actor?.name ?? t("System")}</strong>
                      <span>{auditActionSentence(entry.action, t)}</span>
                    </span>
                    <span className="activity-feed-time">{formatRelativeTime(entry.createdAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="form-actions">
            <Link className="text-link" to="/admin/audit-logs">
              {t("View all audit logs")}
            </Link>
          </div>
        </article>
      </div>
    </section>
  );
}
