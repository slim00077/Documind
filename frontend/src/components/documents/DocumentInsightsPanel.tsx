import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ApiError, generateInsightsRequest } from "../../services/documents.api";
import type { Document, DocumentInsights } from "../../types/document";

type Props = {
  doc: Document;
  canGenerate: boolean;
  onGenerated: (insights: DocumentInsights, generatedAt: string) => void;
};

function InsightList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="insight-group">
      <h4>{title}</h4>
      <ul className="insight-chips">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default function DocumentInsightsPanel({ doc, canGenerate, onGenerated }: Props) {
  const { token } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const isProcessed = doc.status === "READY" || doc.status === "COMPLETED";

  const generate = async () => {
    if (!token) return;
    setIsLoading(true);
    setError("");
    try {
      const result = await generateInsightsRequest(token, doc.id);
      onGenerated(result.insights, result.insightsGeneratedAt);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to generate insights right now.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="extracted-text-section">
      <div className="panel-heading">
        <h3>AI insights</h3>
        {canGenerate && isProcessed ? (
          <button type="button" className="button button-secondary" onClick={generate} disabled={isLoading}>
            <Sparkles /> {isLoading ? "Analyzing..." : doc.insights ? "Regenerate" : "Generate insights"}
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}

      {doc.insights ? (
        <div className="insights-body">
          <p>{doc.insights.summary}</p>
          <InsightList title="Key topics" items={doc.insights.topics} />
          <InsightList title="Important dates" items={doc.insights.dates} />
          <InsightList title="People & organizations" items={doc.insights.entities} />
          {doc.insightsGeneratedAt ? (
            <p className="insights-meta">Generated {new Date(doc.insightsGeneratedAt).toLocaleString()}</p>
          ) : null}
        </div>
      ) : (
        <p className="insights-meta">
          {isProcessed
            ? canGenerate
              ? "No insights yet. Generate a summary, key topics, dates and entities from this document."
              : "No insights have been generated for this document yet."
            : "Insights become available once the document is fully processed."}
        </p>
      )}
    </div>
  );
}
