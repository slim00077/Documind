import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { GitCompareArrows, Loader2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ApiError, listDocumentsRequest } from "../../services/documents.api";
import { compareManyRequest } from "../../services/intelligence.api";
import type { Document } from "../../types/document";
import type { MultiCompareResult } from "../../types/intelligence";
import { PageState } from "../ui/PageState";

const MAX_DOCUMENTS = 5;

export default function CompareDocumentsPanel() {
  const { token } = useAuth();
  const [documents, setDocuments] = useState<Document[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [isComparing, setIsComparing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<MultiCompareResult | null>(null);

  useEffect(() => {
    if (!token) return;
    listDocumentsRequest(token)
      .then(setDocuments)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Unable to load your documents."));
  }, [token]);

  const comparable = useMemo(() => (documents ?? []).filter((d) => d.status === "READY"), [documents]);

  const toggle = (id: number) =>
    setSelected((previous) =>
      previous.includes(id) ? previous.filter((x) => x !== id) : previous.length < MAX_DOCUMENTS ? [...previous, id] : previous,
    );

  const onCompare = async () => {
    if (!token || selected.length < 2) return;
    setIsComparing(true);
    setError("");
    setResult(null);
    try {
      setResult(await compareManyRequest(token, selected));
    } catch (compareError) {
      setError(compareError instanceof ApiError ? compareError.message : "Unable to compare these documents right now.");
    } finally {
      setIsComparing(false);
    }
  };

  if (loadError) {
    return <PageState icon={GitCompareArrows} title="Couldn't load your documents" message={loadError} tone="error" compact />;
  }
  if (documents === null) {
    return <PageState icon={GitCompareArrows} title="Loading documents..." compact />;
  }
  if (comparable.length < 2) {
    return (
      <PageState
        icon={GitCompareArrows}
        title="You need two processed documents to compare."
        message="Upload or get shared at least two documents that finished processing, then come back."
      />
    );
  }

  return (
    <div className="page-stack">
      <article className="workspace-panel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">AI comparison</p>
            <h2>Compare 2 to {MAX_DOCUMENTS} documents</h2>
          </div>
          <GitCompareArrows />
        </div>
        <p className="modal-message">
          The AI reads representative passages from each document and builds a comparison table, flags contradictions and lists missing information.
        </p>
        <fieldset className="ai-card" style={{ border: "1px solid rgba(148,163,184,.3)" }}>
          <legend>
            Select documents ({selected.length}/{MAX_DOCUMENTS})
          </legend>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
            {comparable.map((document) => (
              <li key={document.id}>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={selected.includes(document.id)}
                    disabled={!selected.includes(document.id) && selected.length >= MAX_DOCUMENTS}
                    onChange={() => toggle(document.id)}
                  />
                  <span>
                    {document.name}
                    {document.accessRole && document.accessRole !== "OWNER" ? " (shared)" : ""}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <div className="ai-toolbar" style={{ marginTop: 12 }}>
          <button className="button button-primary" type="button" disabled={selected.length < 2 || isComparing} onClick={() => void onCompare()}>
            {isComparing ? (
              <>
                <Loader2 className="spin" /> Comparing...
              </>
            ) : (
              <>
                <GitCompareArrows /> Compare
              </>
            )}
          </button>
        </div>
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}
      </article>

      {result ? (
        <article className="workspace-panel compare-result ai-panel">
          <div className="ai-card">
            <h3>Overview</h3>
            <p>{result.overview}</p>
            <p className="ai-muted">
              {result.documents.map((d) => `${d.name}: ${d.passagesCompared}/${d.totalPassages} passages`).join(" · ")}
            </p>
          </div>

          <div className="ai-card">
            <h3>Comparison table</h3>
            <div className="ai-table-wrap">
              <table className="ai-table">
                <thead>
                  <tr>
                    <th>Aspect</th>
                    {result.documents.map((d) => (
                      <th key={d.id}>
                        <Link to={`/app/documents/${d.id}`}>{d.name}</Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.table.map((row, i) => (
                    <tr key={i}>
                      <td>
                        <strong>{row.aspect}</strong>
                      </td>
                      {row.cells.map((cell, j) => (
                        <td key={j} className={cell ? "" : "ai-muted"}>
                          {cell ?? "Not addressed"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {result.similarities.length > 0 ? (
            <div className="ai-card">
              <h3>What they have in common</h3>
              <ul>
                {result.similarities.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="ai-card">
            <h3>
              Contradictions <span className="ai-badge ai-badge-warn">{result.contradictions.length}</span>
            </h3>
            {result.contradictions.length === 0 ? (
              <p className="ai-muted">No direct contradictions were found in the compared passages.</p>
            ) : (
              result.contradictions.map((c, i) => (
                <div key={i} style={{ marginBottom: 10 }}>
                  <strong>{c.topic}</strong>
                  <ul>
                    {c.statements.map((s) => (
                      <li key={s.document.id}>
                        <em>{s.document.name}:</em> {s.statement}
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>

          {result.missingInformation.length > 0 ? (
            <div className="ai-card">
              <h3>Missing information</h3>
              <ul>
                {result.missingInformation.map((m, i) => (
                  <li key={i}>
                    <em>{m.document.name}:</em> {m.missing}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="insights-meta">
            Generated by AI from sampled passages{result.cached ? " (saved result)" : ""}. Verify important details in the original documents.
          </p>
        </article>
      ) : null}
    </div>
  );
}
