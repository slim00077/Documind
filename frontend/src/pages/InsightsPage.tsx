import { useState } from "react";
import { Link } from "react-router-dom";
import { Lightbulb, Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../services/documents.api";
import { collectionInsightsRequest } from "../services/intelligence.api";
import type { CollectionInsights } from "../types/intelligence";
import { PageState } from "../components/ui/PageState";

const VERDICT_CLASS = { consistent: "ai-badge-computed", contradictory: "ai-badge-warn", unrelated: "" } as const;

const Stat = ({ label, value }: { label: string; value: string | number }) => (
  <div className="ai-card">
    <div className="ai-muted">{label}</div>
    <strong style={{ fontSize: "1.4rem" }}>{value}</strong>
  </div>
);

export default function InsightsPage() {
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
      setError(err instanceof ApiError ? err.message : "Unable to analyse your documents right now.");
    } finally {
      setBusy(false);
    }
  };

  const c = data?.computed;
  const maxOccurrences = Math.max(1, ...(c?.recurringTerms.map((t) => t.occurrences) ?? [1]));

  return (
    <div className="page-stack">
      <article className="workspace-panel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">AI insights</p>
            <h2>Insights across your documents</h2>
          </div>
          <Lightbulb />
        </div>
        <p className="modal-message">
          Statistics, shared terms, related documents and overlapping passages are <span className="ai-badge ai-badge-computed">computed</span> directly from your
          documents. The written interpretation is <span className="ai-badge ai-badge-ai">AI-generated</span> and only sees that computed evidence.
        </p>
        <div className="ai-toolbar">
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={interpret} onChange={(e) => setInterpret(e.target.checked)} /> Include AI interpretation
          </label>
          <button type="button" className="button button-primary" disabled={busy} onClick={() => void run()}>
            {busy ? (
              <>
                <Loader2 className="spin" /> Analysing…
              </>
            ) : data ? (
              "Refresh analysis"
            ) : (
              "Analyse my documents"
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
          title="No analysis yet."
          message="Run the analysis to see recurring topics, related documents, overlaps and contradictions across your processed documents."
          compact
        />
      ) : null}

      {data && c ? (
        <div className="ai-panel">
          <div className="ai-grid">
            <Stat label="Documents analysed" value={data.scope.documentCount} />
            <Stat label="Passages" value={data.scope.passageCount} />
            <Stat label="Characters" value={data.scope.characterCount.toLocaleString()} />
          </div>
          <p className="ai-muted">{data.cached ? "Saved result - refreshed automatically when your documents change." : "Fresh analysis."}</p>

          {data.interpretation ? (
            <div className="ai-card">
              <h3>
                Interpretation <span className="ai-badge ai-badge-ai">AI-generated</span>
              </h3>
              <p>{data.interpretation.summary}</p>
              {data.interpretation.themes.map((t) => (
                <p key={t.name}>
                  <strong>{t.name}</strong> - {t.description}{" "}
                  <span className="ai-muted">({t.terms.join(", ")})</span>
                </p>
              ))}
              <p className="ai-muted">Interpretations may be incomplete. Check the evidence below.</p>
            </div>
          ) : null}

          <div className="ai-card">
            <h3>
              Recurring terms <span className="ai-badge ai-badge-computed">computed</span>
            </h3>
            {c.recurringTerms.length === 0 ? (
              <p className="ai-muted">No terms recur across more than one document.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
                {c.recurringTerms.slice(0, 15).map((t) => (
                  <li key={t.term} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ width: 140 }}>{t.term}</span>
                    <span className="relevance-bar" style={{ flex: 1, maxWidth: 260 }}>
                      <span style={{ width: `${(t.occurrences / maxOccurrences) * 100}%` }} />
                    </span>
                    <span className="ai-muted">
                      {t.occurrences}× in {t.documents} docs
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="ai-card">
            <h3>
              Distinctive terms per document <span className="ai-badge ai-badge-computed">computed</span>
            </h3>
            <div className="ai-grid">
              {c.distinctiveTerms.map((d) => (
                <div key={d.document.id}>
                  <Link to={`/app/documents/${d.document.id}`}>
                    <strong>{d.document.name}</strong>
                  </Link>
                  <ul className="insight-chips">
                    {d.terms.map((t) => (
                      <li key={t.term}>
                        {t.term} ({t.count})
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="ai-card">
            <h3>
              Related documents <span className="ai-badge ai-badge-computed">computed</span>
            </h3>
            {c.relationships.length === 0 ? (
              <p className="ai-muted">No pair of documents is semantically close enough to be reported as related.</p>
            ) : (
              <ul>
                {c.relationships.map((r) => (
                  <li key={`${r.a.id}-${r.b.id}`}>
                    <Link to={`/app/documents/${r.a.id}`}>{r.a.name}</Link> ↔ <Link to={`/app/documents/${r.b.id}`}>{r.b.name}</Link>{" "}
                    <span className="ai-badge">{Math.round(r.similarity * 100)}% similar</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="ai-card">
            <h3>
              Overlapping passages <span className="ai-badge ai-badge-computed">computed</span>
            </h3>
            {c.overlapSkippedReason ? <p className="ai-muted">{c.overlapSkippedReason}</p> : null}
            {!c.overlapSkippedReason && c.overlaps.length === 0 ? (
              <p className="ai-muted">No near-duplicate passages were found across different documents.</p>
            ) : null}
            {c.overlaps.map((o, i) => {
              const assessment = data.interpretation?.assessments.find((a) => a.pair === i);
              return (
                <div key={i} className="ai-card" style={{ marginTop: 8 }}>
                  <span className="ai-badge">{Math.round(o.similarity * 100)}% similar</span>{" "}
                  {assessment ? (
                    <span className={`ai-badge ${VERDICT_CLASS[assessment.verdict]}`}>AI: {assessment.verdict}</span>
                  ) : null}
                  {[o.a, o.b].map((side) => (
                    <p key={`${side.document.id}-${side.chunkIndex}`} className="source-excerpt">
                      <Link to={`/app/documents/${side.document.id}?chunk=${side.chunkIndex}`}>
                        {side.document.name} · passage {side.chunkIndex + 1}
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
              Shared entities <span className="ai-badge ai-badge-computed">computed</span>
            </h3>
            {c.entities.documentsWithInsights === 0 ? (
              <p className="ai-muted">Generate insights on individual documents to include their entities here.</p>
            ) : (
              <>
                <p className="ai-muted">
                  Based on {c.entities.documentsWithInsights} of {c.entities.totalDocuments} documents that have insights.
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
              Collection makeup <span className="ai-badge ai-badge-computed">computed</span>
            </h3>
            <p>
              {c.byType.map((t) => `${t.label}: ${t.count}`).join(" · ")}
              <br />
              {c.byCategory.map((t) => `${t.label}: ${t.count}`).join(" · ")}
              <br />
              <span className="ai-muted">Uploaded: {c.timeline.map((t) => `${t.month} (${t.count})`).join(", ")}</span>
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
