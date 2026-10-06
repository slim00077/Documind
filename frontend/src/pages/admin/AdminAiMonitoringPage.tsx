import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, ArrowRightLeft, Cpu, RefreshCw, Zap } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ApiError, getAiMonitoringRequest } from "../../services/admin.api";
import type { AiMonitoringSnapshot, AiProviderStatus } from "../../types/admin";
import { PageState } from "../../components/ui/PageState";
import { formatRelativeTime } from "../../utils/formatRelativeTime";

const REFRESH_MS = 15_000;

const STATUS_LABELS: Record<AiProviderStatus, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  limited: "Rate-limited",
  idle: "No traffic yet",
  disabled: "Not configured",
};

const EVENT_LABELS: Record<string, string> = {
  success: "Success",
  failure: "Error",
  quota: "Rate limit",
  failover: "Fallback",
  skipped: "Skipped",
};

const formatNumber = (value: number) => value.toLocaleString();

export default function AdminAiMonitoringPage() {
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
      setError(loadError instanceof ApiError ? loadError.message : "Unable to load AI monitoring right now.");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  if (isLoading) {
    return (
      <section className="page-stack">
        <PageState icon={Activity} title="Loading AI monitoring..." compact />
      </section>
    );
  }

  if (!data) {
    return (
      <section className="page-stack">
        <PageState
          icon={AlertTriangle}
          title="Couldn't load AI monitoring"
          message={error}
          tone="error"
          action={
            <button className="button button-secondary" type="button" onClick={() => void load()}>
              Try again
            </button>
          }
        />
      </section>
    );
  }

  const { live, persisted } = data;
  const totalTokens = live.totals.estimatedInputTokens + live.totals.estimatedOutputTokens;
  const errorRate = live.totals.requests > 0 ? Math.round((live.totals.errors / live.totals.requests) * 100) : 0;

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="section-kicker">Admin</p>
          <h1>AI monitoring</h1>
          <p>Live provider activity, errors, and fallbacks for the AI assistant, insights, and comparisons.</p>
        </div>
        <button className="button button-secondary" type="button" onClick={() => void load()}>
          <RefreshCw /> Refresh
        </button>
      </div>

      {error ? <p className="auth-error">Showing the last successful data. {error}</p> : null}

      <p className="auth-hint">
        Provider counters are kept in memory since the backend started {formatRelativeTime(live.since)} and reset on
        restart. Token counts are estimates (~4 characters per token), not provider billing.
      </p>

      <div className="metric-grid">
        <article className="metric-card">
          <Zap />
          <span>Provider requests</span>
          <strong>{formatNumber(live.totals.requests)}</strong>
          <small>{formatNumber(live.totals.successes)} succeeded.</small>
        </article>
        <article className="metric-card">
          <AlertTriangle />
          <span>Errors</span>
          <strong>{formatNumber(live.totals.errors)}</strong>
          <small>{errorRate}% of requests.</small>
        </article>
        <article className="metric-card">
          <ArrowRightLeft />
          <span>Fallbacks</span>
          <strong>{formatNumber(live.totals.fallbacks)}</strong>
          <small>Switches to another provider.</small>
        </article>
        <article className="metric-card">
          <Cpu />
          <span>Estimated tokens</span>
          <strong>{formatNumber(totalTokens)}</strong>
          <small>
            {formatNumber(live.totals.estimatedInputTokens)} in · {formatNumber(live.totals.estimatedOutputTokens)} out
          </small>
        </article>
      </div>

      <article className="workspace-panel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Fallback order</p>
            <h2>Providers &amp; models</h2>
          </div>
          <Activity />
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Provider / model</th>
                <th>Status</th>
                <th>Requests</th>
                <th>Errors</th>
                <th>Fallbacks</th>
                <th>Est. tokens</th>
                <th>Avg latency</th>
                <th>Last error</th>
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
                    <span className={`ai-status ai-status-${provider.status}`}>{STATUS_LABELS[provider.status]}</span>
                    {provider.cooldownUntil ? (
                      <div className="admin-table-sub">
                        Cooling down until {new Date(provider.cooldownUntil).toLocaleTimeString()}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    {formatNumber(provider.requests)}
                    {provider.requestLimit ? <div className="admin-table-sub">limit {formatNumber(provider.requestLimit)}</div> : null}
                  </td>
                  <td>
                    {formatNumber(provider.errors)}
                    {provider.quotaHits > 0 ? <div className="admin-table-sub">{provider.quotaHits} rate-limit</div> : null}
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
      </article>

      <div className="dashboard-panels">
        <article className="workspace-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Stored in the database</p>
              <h2>Persistent AI usage</h2>
            </div>
            <Cpu />
          </div>
          <dl className="insights-list">
            <div>
              <dt>Assistant answers (24h)</dt>
              <dd>{formatNumber(persisted.assistantAnswersLast24h)}</dd>
            </div>
            <div>
              <dt>Assistant answers (7 days)</dt>
              <dd>{formatNumber(persisted.assistantAnswersLast7d)}</dd>
            </div>
            <div>
              <dt>Assistant answers (all time)</dt>
              <dd>{formatNumber(persisted.assistantAnswersTotal)}</dd>
            </div>
            <div>
              <dt>Documents with AI insights</dt>
              <dd>{formatNumber(persisted.documentsWithInsights)}</dd>
            </div>
            <div>
              <dt>Indexed chunks</dt>
              <dd>{formatNumber(persisted.indexedChunks)}</dd>
            </div>
          </dl>
        </article>

        <article className="workspace-panel activity-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Since backend start</p>
              <h2>Recent provider events</h2>
            </div>
            <Activity />
          </div>
          {live.recentEvents.length === 0 ? (
            <p>No AI requests have been made since the backend started.</p>
          ) : (
            <ul className="activity-feed">
              {live.recentEvents.slice(0, 20).map((event, index) => (
                <li key={`${event.at}-${index}`} className="activity-feed-item">
                  <span className="activity-feed-link">
                    <span className={`ai-event ai-event-${event.type}`}>{EVENT_LABELS[event.type]}</span>
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
