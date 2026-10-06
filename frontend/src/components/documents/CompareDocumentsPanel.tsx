import { useEffect, useMemo, useState } from "react";
import { GitCompareArrows, Loader2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import {
  ApiError,
  compareDocumentsRequest,
  listDocumentsRequest,
} from "../../services/documents.api";
import type { Document, DocumentComparisonResult } from "../../types/document";
import { formatFileSize } from "../../utils/formatFileSize";
import { PageState } from "../ui/PageState";

const isComparable = (document: Document) => document.status === "READY";

function ListSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="compare-section">
      <h3>{title}</h3>
      <ul className="compare-list">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default function CompareDocumentsPanel() {
  const { token } = useAuth();
  const [documents, setDocuments] = useState<Document[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [idA, setIdA] = useState("");
  const [idB, setIdB] = useState("");
  const [isComparing, setIsComparing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DocumentComparisonResult | null>(null);

  useEffect(() => {
    if (!token) return;
    listDocumentsRequest(token)
      .then(setDocuments)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Unable to load your documents."));
  }, [token]);

  const comparable = useMemo(() => (documents ?? []).filter(isComparable), [documents]);

  const onCompare = async () => {
    if (!token || !idA || !idB) return;
    setIsComparing(true);
    setError("");
    setResult(null);
    try {
      setResult(await compareDocumentsRequest(token, Number(idA), Number(idB)));
    } catch (compareError) {
      setError(
        compareError instanceof ApiError ? compareError.message : "Unable to compare these documents right now."
      );
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

  const optionLabel = (document: Document) =>
    document.accessRole && document.accessRole !== "OWNER" ? `${document.name} (shared)` : document.name;

  return (
    <div className="page-stack">
      <article className="workspace-panel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">AI comparison</p>
            <h2>Compare two documents</h2>
          </div>
          <GitCompareArrows />
        </div>
        <p className="modal-message">
          The AI reads representative passages from both documents and highlights what they share and where they differ.
        </p>
        <div className="compare-picker">
          <label>
            <span>Document A</span>
            <select className="auth-input" value={idA} onChange={(event) => setIdA(event.target.value)}>
              <option value="">Select a document...</option>
              {comparable.map((document) => (
                <option key={document.id} value={document.id} disabled={String(document.id) === idB}>
                  {optionLabel(document)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Document B</span>
            <select className="auth-input" value={idB} onChange={(event) => setIdB(event.target.value)}>
              <option value="">Select a document...</option>
              {comparable.map((document) => (
                <option key={document.id} value={document.id} disabled={String(document.id) === idA}>
                  {optionLabel(document)}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button button-primary"
            type="button"
            disabled={!idA || !idB || idA === idB || isComparing}
            onClick={onCompare}
          >
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
        {error ? <p className="auth-error">{error}</p> : null}
      </article>

      {result ? (
        <article className="workspace-panel compare-result">
          <div className="compare-heads">
            {[result.documentA, result.documentB].map((info, index) => (
              <div key={info.id} className="compare-head">
                <span className="section-kicker">Document {index === 0 ? "A" : "B"}</span>
                <strong>{info.name}</strong>
                <small>
                  {info.size !== null ? `${formatFileSize(info.size)} · ` : ""}
                  {info.category ? `${info.category} · ` : ""}
                  {info.excerptsCompared} of {info.chunkCount} passages analysed
                </small>
              </div>
            ))}
          </div>

          <div className="compare-section">
            <h3>Overview</h3>
            <p>{result.comparison.overview}</p>
          </div>

          <ListSection title="What they have in common" items={result.comparison.similarities} />

          {result.comparison.differences.length > 0 ? (
            <div className="compare-section">
              <h3>Key differences</h3>
              <div className="admin-table-wrap">
                <table className="admin-table compare-table">
                  <thead>
                    <tr>
                      <th>Aspect</th>
                      <th>{result.documentA.name}</th>
                      <th>{result.documentB.name}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.comparison.differences.map((row, index) => (
                      <tr key={index}>
                        <td>
                          <strong>{row.aspect}</strong>
                        </td>
                        <td>{row.documentA || "—"}</td>
                        <td>{row.documentB || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="compare-unique">
            <ListSection title={`Only in ${result.documentA.name}`} items={result.comparison.onlyInA} />
            <ListSection title={`Only in ${result.documentB.name}`} items={result.comparison.onlyInB} />
          </div>

          <p className="insights-meta">
            Generated by AI from sampled passages. Verify important details in the original documents.
          </p>
        </article>
      ) : null}
    </div>
  );
}
