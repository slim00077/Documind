import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, ArrowRightLeft, Cpu, RefreshCw, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { ApiError, getAiMonitoringRequest } from "../../services/admin.api";
import type { AiMonitoringSnapshot, AiProviderStatus } from "../../types/admin";
import { PageState } from "../../components/ui/PageState";
import { formatRelativeTime } from "../../utils/formatRelativeTime";
import GlassCard from "../../components/ui/GlassCard";
import type { TranslationKey } from "../../i18n";
import { formatNumber, formatPercent, formatTime } from "../../i18n/format";

const REFRESH_MS = 15_000;

const STATUS_LABELS: Record<AiProviderStatus, TranslationKey> = {
  healthy: "Healthy",
  degraded: "Degraded",
  limited: "Rate-limited",
  idle: "No traffic yet",
  disabled: "Not configured",
};

const EVENT_LABELS: Record<string, TranslationKey> = {
  success: "Success",
  failure: "Error",
  quota: "Rate limit",
  failover: "Fallback",
  skipped: "Skipped",
};

export default function AdminAiMonitoringPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [data, setData] = useState<AiMonitoringSnapshot | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setData(await getAiMonitoringRequest(token));
      setError("");
    } catch (loadError) {
      setError(loadError instanceof ApiError ? loadError.message : t("Unable to load AI monitoring right now."));
    } finally {
      setIsLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  if (isLoading) {
    return (
      <section className="page-stack">
        <PageState icon={Activity} title={t("Loading AI monitoring...")} compact />
      </section>
    );
  }

  if (!data) {
    return (
      <section className="page-stack">
        <PageState
          icon={AlertTriangle}
          title={t("Couldn't load AI monitoring")}
          message={error}
          tone="error"
          action={
            <button className="button button-secondary" type="button" onClick={() => void load()}>
              {t("Try again")}
            </button>
          }
        />
      </section>
    );
  }

  const { live, persisted } = data;
  const totalTokens = live.totals.estimatedInputTokens + live.totals.estimatedOutputTokens;
  const errorRate = live.totals.requests > 0 ? live.totals.errors / live.totals.requests : 0;

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="section-kicker">{t("Admin")}</p>
          <h1>{t("Analytics & AI monitoring")}</h1>
          <p>{t("Live provider activity, errors, and fallbacks for the AI assistant, insights, and comparisons.")}</p>
        </div>
        <button className="button button-secondary" type="button" onClick={() => void load()}>
          <RefreshCw /> {t("Refresh")}
        </button>
      </div>

      {error ? <p className="auth-error">{t("Showing the last successful data.")} {error}</p> : null}

      <p className="auth-hint">
        {t("Provider counters are kept in memory since the backend started {{when}} and reset on restart. Token counts are estimates (~4 characters per token), not provider billing.", { when: formatRelativeTime(live.since) })}
      </p>

      <div className="metric-grid">
        <GlassCard as="article" tone="violet" className="metric-card">
          <Zap />
          <span>{t("Provider requests")}</span>
          <strong>{formatNumber(live.totals.requests)}</strong>
          <small>{t("{{count}} succeeded.", { count: live.totals.successes })}</small>
        </GlassCard>
        <GlassCard as="article" tone="cyan" className="metric-card">
          <AlertTriangle />
          <span>{t("Errors")}</span>
          <strong>{formatNumber(live.totals.errors)}</strong>
          <small>{t("{{percent}} of requests.", { percent: formatPercent(errorRate) })}</small>
        </GlassCard>
        <GlassCard as="article" tone="blue" className="metric-card">
          <ArrowRightLeft />
          <span>{t("Fallbacks")}</span>
          <strong>{formatNumber(live.totals.fallbacks)}</strong>
          <small>{t("Switches to another provider.")}</small>
        </GlassCard>
        <GlassCard as="article" tone="lavender" className="metric-card">
          <Cpu />
          <span>{t("Estimated tokens")}</span>
          <strong>{formatNumber(totalTokens)}</strong>
          <small>
            {t("{{input}} in · {{output}} out", { input: formatNumber(live.totals.estimatedInputTokens), output: formatNumber(live.totals.estimatedOutputTokens) })}
          </small>
        </GlassCard>
      </div>

      <GlassCard as="article" tone="violet" className="workspace-panel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">{t("Fallback order")}</p>
            <h2>{t("Providers & models")}</h2>
          </div>
          <Activity />
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t("Provider / model")}</th>
                <th>{t("Status")}</th>
                <th>{t("Requests")}</th>
                <th>{t("Errors")}</th>
                <th>{t("Fallbacks")}</th>
                <th>{t("Est. tokens")}</th>
                <th>{t("Avg latency")}</th>
                <th>{t("Last error")}</th>
              </tr>
            </thead>
            <tbody>
              {live.providers.map((provider, index) => (
                <tr key={provider.id}>
                  <td>{index + 1}</td>
                  <td>
                    <strong>{provider.id}</strong>
                    <div className="admin-table-sub">{provider.model}</div>
                  </td>
                  <td>
                    <span className={`ai-status ai-status-${provider.status}`}>{t(STATUS_LABELS[provider.status])}</span>
                    {provider.cooldownUntil ? (
                      <div className="admin-table-sub">
                        {t("Cooling down until {{time}}", { time: formatTime(provider.cooldownUntil, { timeStyle: "medium" }) })}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    {formatNumber(provider.requests)}
                    {provider.requestLimit ? <div className="admin-table-sub">{t("limit {{limit}}", { limit: formatNumber(provider.requestLimit) })}</div> : null}
                  </td>
                  <td>
                    {formatNumber(provider.errors)}
                    {provider.quotaHits > 0 ? <div className="admin-table-sub">{t("{{count}} rate-limit hits", { count: provider.quotaHits })}</div> : null}
                  </td>
                  <td>{formatNumber(provider.fallbacksFrom)}</td>
                  <td>{formatNumber(provider.estimatedInputTokens + provider.estimatedOutputTokens)}</td>
                  <td>{provider.avgLatencyMs !== null ? `${formatNumber(provider.avgLatencyMs)} ms` : "—"}</td>
                  <td className="ai-last-error">
                    {provider.lastError ? (
                      <>
                        {provider.lastError}
                        {provider.lastFailureAt ? (
                          <div className="admin-table-sub">{formatRelativeTime(provider.lastFailureAt)}</div>
                        ) : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <div className="dashboard-panels">
        <GlassCard as="article" tone="cyan" className="workspace-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">{t("Stored in the database")}</p>
              <h2>{t("Persistent AI usage")}</h2>
            </div>
            <Cpu />
          </div>
          <dl className="insights-list">
            <div>
              <dt>{t("Assistant answers (24h)")}</dt>
              <dd>{formatNumber(persisted.assistantAnswersLast24h)}</dd>
            </div>
            <div>
              <dt>{t("Assistant answers (7 days)")}</dt>
              <dd>{formatNumber(persisted.assistantAnswersLast7d)}</dd>
            </div>
            <div>
              <dt>{t("Assistant answers (all time)")}</dt>
              <dd>{formatNumber(persisted.assistantAnswersTotal)}</dd>
            </div>
            <div>
              <dt>{t("Documents with AI insights")}</dt>
              <dd>{formatNumber(persisted.documentsWithInsights)}</dd>
            </div>
            <div>
              <dt>{t("Indexed chunks")}</dt>
              <dd>{formatNumber(persisted.indexedChunks)}</dd>
            </div>
          </dl>
        </GlassCard>

        <article className="workspace-panel activity-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">{t("Since backend start")}</p>
              <h2>{t("Recent provider events")}</h2>
            </div>
            <Activity />
          </div>
          {live.recentEvents.length === 0 ? (
            <p>{t("No AI requests have been made since the backend started.")}</p>
          ) : (
            <ul className="activity-feed">
              {live.recentEvents.slice(0, 20).map((event, index) => (
                <li key={`${event.at}-${index}`} className="activity-feed-item">
                  <span className="activity-feed-link">
                    <span className={`ai-event ai-event-${event.type}`}>{EVENT_LABELS[event.type] ? t(EVENT_LABELS[event.type]) : event.type}</span>
                    <span className="activity-feed-body">
                      <strong>
                        {event.providerId}
                        {event.model ? ` · ${event.model}` : ""}
                      </strong>
                      <span>{event.detail}</span>
                    </span>
                    <span className="activity-feed-time">{formatRelativeTime(event.at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>
    </section>
  );
}
