import { useState } from "react";
import { Link } from "react-router-dom";
import { Lightbulb, Loader2 } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../services/documents.api";
import { collectionInsightsRequest } from "../services/intelligence.api";
import type { CollectionInsights } from "../types/intelligence";
import { PageState } from "../components/ui/PageState";
import type { TranslationKey } from "../i18n";
import { formatDate, formatNumber, formatPercent } from "../i18n/format";

const VERDICT_CLASS = { consistent: "ai-badge-computed", contradictory: "ai-badge-warn", unrelated: "" } as const;
const VERDICT_LABEL: Record<keyof typeof VERDICT_CLASS, TranslationKey> = {
  consistent: "consistent",
  contradictory: "contradictory",
  unrelated: "unrelated",
};

const Stat = ({ label, value }: { label: string; value: string | number }) => (
  <div className="ai-card">
    <div className="ai-muted">{label}</div>
    <strong style={{ fontSize: "1.4rem" }}>{typeof value === "number" ? formatNumber(value) : value}</strong>
  </div>
);

/** "2026-11" -> "Nov 2026" / "nov. 2026". */
const monthLabel = (month: string) => {
  const date = new Date(`${month}-01T00:00:00`);
  return Number.isNaN(date.getTime()) ? month : formatDate(date, { month: "short", year: "numeric" });
};

/** The server's fixed placeholder labels; real category names and MIME types are shown unchanged. */
const groupLabel = (label: string, t: TFunction) => (label === "Uncategorized" ? t("Uncategorized") : label === "unknown" ? t("unknown") : label);

/** The server explains a skipped overlap scan with one fixed English sentence. */
const overlapSkipped = (reason: string, t: TFunction) => {
  const match = /above (\d+) passages/.exec(reason);
  return match
    ? t("Passage-level overlap detection is skipped for collections above {{max}} passages; narrow the selection.", { max: formatNumber(Number(match[1])) })
    : reason;
};

export default function InsightsPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [interpret, setInterpret] = useState(true);
  const [data, setData] = useState<CollectionInsights | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      setData(await collectionInsightsRequest(token, { interpret }));
    } catch (err) {
      setData(null);
      setError(err instanceof ApiError ? err.message : t("Unable to analyse your documents right now."));
    } finally {
      setBusy(false);
    }
  };

  const c = data?.computed;
  const maxOccurrences = Math.max(1, ...(c?.recurringTerms.map((term) => term.occurrences) ?? [1]));
  const computedBadge = <span className="ai-badge ai-badge-computed">{t("computed")}</span>;

  return (
    <div className="page-stack">
      <article className="workspace-panel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">{t("AI insights")}</p>
            <h2>{t("Insights across your documents")}</h2>
          </div>
          <Lightbulb />
        </div>
        <p className="modal-message">
          <Trans
            i18nKey="Statistics, shared terms, related documents and overlapping passages are <computed>computed</computed> directly from your documents. The written interpretation is <ai>AI-generated</ai> and only sees that computed evidence."
            components={{ computed: <span className="ai-badge ai-badge-computed" />, ai: <span className="ai-badge ai-badge-ai" /> }}
          />
        </p>
        <div className="ai-toolbar">
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={interpret} onChange={(e) => setInterpret(e.target.checked)} /> {t("Include AI interpretation")}
          </label>
          <button type="button" className="button button-primary" disabled={busy} onClick={() => void run()}>
            {busy ? (
              <>
                <Loader2 className="spin" /> {t("Analysing…")}
              </>
            ) : data ? (
              t("Refresh analysis")
            ) : (
              t("Analyse my documents")
            )}
          </button>
        </div>
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}
      </article>

      {!data && !busy && !error ? (
        <PageState
          icon={Lightbulb}
          title={t("No analysis yet.")}
          message={t("Run the analysis to see recurring topics, related documents, overlaps and contradictions across your processed documents.")}
          compact
        />
      ) : null}

      {data && c ? (
        <div className="ai-panel">
          <div className="ai-grid">
            <Stat label={t("Documents analysed")} value={data.scope.documentCount} />
            <Stat label={t("Passages")} value={data.scope.passageCount} />
            <Stat label={t("Characters")} value={data.scope.characterCount} />
          </div>
          <p className="ai-muted">{data.cached ? t("Saved result - refreshed automatically when your documents change.") : t("Fresh analysis.")}</p>

          {data.interpretation ? (
            <div className="ai-card">
              <h3>
                {t("Interpretation")} <span className="ai-badge ai-badge-ai">{t("AI-generated")}</span>
              </h3>
              <p>{data.interpretation.summary}</p>
              {data.interpretation.themes.map((theme) => (
                <p key={theme.name}>
                  <strong>{theme.name}</strong> - {theme.description}{" "}
                  <span className="ai-muted">({theme.terms.join(", ")})</span>
                </p>
              ))}
              <p className="ai-muted">{t("Interpretations may be incomplete. Check the evidence below.")}</p>
            </div>
          ) : null}

          <div className="ai-card">
            <h3>
              {t("Recurring terms")} {computedBadge}
            </h3>
            {c.recurringTerms.length === 0 ? (
              <p className="ai-muted">{t("No terms recur across more than one document.")}</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
                {c.recurringTerms.slice(0, 15).map((term) => (
                  <li key={term.term} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ width: 140 }}>{term.term}</span>
                    <span className="relevance-bar" style={{ flex: 1, maxWidth: 260 }}>
                      <span style={{ width: `${(term.occurrences / maxOccurrences) * 100}%` }} />
                    </span>
                    <span className="ai-muted">
                      {t("{{occurrences}}× in {{count}} docs", { occurrences: formatNumber(term.occurrences), count: term.documents })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="ai-card">
            <h3>
              {t("Distinctive terms per document")} {computedBadge}
            </h3>
            <div className="ai-grid">
              {c.distinctiveTerms.map((d) => (
                <div key={d.document.id}>
                  <Link to={`/app/documents/${d.document.id}`}>
                    <strong>{d.document.name}</strong>
                  </Link>
                  <ul className="insight-chips">
                    {d.terms.map((term) => (
                      <li key={term.term}>
                        {term.term} ({formatNumber(term.count)})
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="ai-card">
            <h3>
              {t("Related documents")} {computedBadge}
            </h3>
            {c.relationships.length === 0 ? (
              <p className="ai-muted">{t("No pair of documents is semantically close enough to be reported as related.")}</p>
            ) : (
              <ul>
                {c.relationships.map((r) => (
                  <li key={`${r.a.id}-${r.b.id}`}>
                    <Link to={`/app/documents/${r.a.id}`}>{r.a.name}</Link> ↔ <Link to={`/app/documents/${r.b.id}`}>{r.b.name}</Link>{" "}
                    <span className="ai-badge">{t("{{percent}} similar", { percent: formatPercent(r.similarity) })}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="ai-card">
            <h3>
              {t("Overlapping passages")} {computedBadge}
            </h3>
            {c.overlapSkippedReason ? <p className="ai-muted">{overlapSkipped(c.overlapSkippedReason, t)}</p> : null}
            {!c.overlapSkippedReason && c.overlaps.length === 0 ? (
              <p className="ai-muted">{t("No near-duplicate passages were found across different documents.")}</p>
            ) : null}
            {c.overlaps.map((o, i) => {
              const assessment = data.interpretation?.assessments.find((a) => a.pair === i);
              return (
                <div key={i} className="ai-card" style={{ marginTop: 8 }}>
                  <span className="ai-badge">{t("{{percent}} similar", { percent: formatPercent(o.similarity) })}</span>{" "}
                  {assessment ? (
                    <span className={`ai-badge ${VERDICT_CLASS[assessment.verdict]}`}>
                      {t("AI: {{verdict}}", { verdict: VERDICT_LABEL[assessment.verdict] ? t(VERDICT_LABEL[assessment.verdict]) : assessment.verdict })}
                    </span>
                  ) : null}
                  {[o.a, o.b].map((side) => (
                    <p key={`${side.document.id}-${side.chunkIndex}`} className="source-excerpt">
                      <Link to={`/app/documents/${side.document.id}?chunk=${side.chunkIndex}`}>
                        {side.document.name} · {t("passage {{number}}", { number: side.chunkIndex + 1 })}
                      </Link>
                      : “{side.excerpt}…”
                    </p>
                  ))}
                  {assessment ? <p>{assessment.explanation}</p> : null}
                </div>
              );
            })}
          </div>

          <div className="ai-card">
            <h3>
              {t("Shared entities")} {computedBadge}
            </h3>
            {c.entities.documentsWithInsights === 0 ? (
              <p className="ai-muted">{t("Generate insights on individual documents to include their entities here.")}</p>
            ) : (
              <>
                <p className="ai-muted">
                  {t("Based on {{with}} of {{count}} documents that have insights.", { with: c.entities.documentsWithInsights, count: c.entities.totalDocuments })}
                </p>
                <ul className="insight-chips">
                  {c.entities.items.map((e) => (
                    <li key={e.name} title={e.documents.map((d) => d.name).join(", ")}>
                      {e.name} ({e.documents.length})
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="ai-card">
            <h3>
              {t("Collection makeup")} {computedBadge}
            </h3>
            <p>
              {c.byType.map((row) => `${groupLabel(row.label, t)}: ${formatNumber(row.count)}`).join(" · ")}
              <br />
              {c.byCategory.map((row) => `${groupLabel(row.label, t)}: ${formatNumber(row.count)}`).join(" · ")}
              <br />
              <span className="ai-muted">
                {t("Uploaded: {{months}}", { months: c.timeline.map((row) => `${monthLabel(row.month)} (${formatNumber(row.count)})`).join(", ") })}
              </span>
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
