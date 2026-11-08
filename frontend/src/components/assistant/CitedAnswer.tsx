import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { FileText } from "lucide-react";
import type { AssistantSource } from "../../types/assistant";

const sourceLink = (source: AssistantSource) =>
  `/app/documents/${source.documentId}?chunk=${source.chunkIndex}`;

const MATCH_LABEL = { semantic: "Meaning match", keyword: "Keyword match", hybrid: "Keyword + meaning" };

/** Renders answer text, turning [n] markers into links to the cited passage. */
function withCitations(text: string, sources: AssistantSource[]): ReactNode[] {
  return text.split(/(\[\d+\])/g).map((part, index) => {
    const match = /^\[(\d+)\]$/.exec(part);
    const source = match ? sources[Number(match[1]) - 1] : undefined;
    if (!match || !source) return <Fragment key={index}>{part}</Fragment>;
    return (
      <Link
        key={index}
        to={sourceLink(source)}
        className="citation-chip"
        title={`${source.documentName} - passage ${source.chunkIndex + 1}`}
      >
        {match[1]}
      </Link>
    );
  });
}

export function SourcePanel({ sources }: { sources: AssistantSource[] }) {
  if (sources.length === 0) return null;
  const documents = [...new Set(sources.map((source) => source.documentName))];

  return (
    <details className="source-panel">
      <summary>
        {sources.length} supporting passage{sources.length === 1 ? "" : "s"} from{" "}
        {documents.length} document{documents.length === 1 ? "" : "s"}
      </summary>
      <ol>
        {sources.map((source, index) => (
          <li key={source.chunkId}>
            <Link to={sourceLink(source)} className="source-title">
              <span className="citation-chip">{index + 1}</span>
              <FileText aria-hidden="true" />
              <strong>{source.documentName}</strong>
              <span>
                passage {source.chunkIndex + 1}
                {source.visual ? ` · ${source.visual.label}` : ""}
              </span>
            </Link>
            {source.excerpt ? <p className="source-excerpt">“{source.excerpt}…”</p> : null}
            <span className="source-meta">
              {source.matchType ? MATCH_LABEL[source.matchType] : null}
              {source.score !== undefined ? ` · relevance ${Math.round(source.score * 100)}%` : ""}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}

export default function CitedAnswer({
  content,
  sources,
}: {
  content: string;
  sources?: AssistantSource[] | null;
}) {
  const list = sources ?? [];
  return (
    <>
      {withCitations(content, list)}
      <SourcePanel sources={list} />
    </>
  );
}
