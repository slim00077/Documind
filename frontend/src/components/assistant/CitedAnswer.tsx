import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { AssistantSource } from "../../types/assistant";
import type { TranslationKey } from "../../i18n";
import { formatPercent } from "../../i18n/format";
import { visualLabel } from "./visualLabel";

const sourceLink = (source: AssistantSource) =>
  `/app/documents/${source.documentId}?chunk=${source.chunkIndex}`;

const MATCH_LABEL: Record<NonNullable<AssistantSource["matchType"]>, TranslationKey> = {
  semantic: "Meaning match",
  keyword: "Keyword match",
  hybrid: "Keyword + meaning",
};

/** Renders answer text, turning [n] markers into links to the cited passage. The answer text itself is never translated. */
function withCitations(text: string, sources: AssistantSource[], t: TFunction): ReactNode[] {
  return text.split(/(\[\d+\])/g).map((part, index) => {
    const match = /^\[(\d+)\]$/.exec(part);
    const source = match ? sources[Number(match[1]) - 1] : undefined;
    if (!match || !source) return <Fragment key={index}>{part}</Fragment>;
    return (
      <Link
        key={index}
        to={sourceLink(source)}
        className="citation-chip"
        title={t("{{name}} - passage {{number}}", { name: source.documentName, number: source.chunkIndex + 1 })}
      >
        {match[1]}
      </Link>
    );
  });
}

export function SourcePanel({ sources }: { sources: AssistantSource[] }) {
  const { t } = useTranslation();
  if (sources.length === 0) return null;
  const documents = [...new Set(sources.map((source) => source.documentName))];

  return (
    <details className="source-panel">
      <summary>
        {t("{{count}} supporting passages", { count: sources.length })}{" "}
        {t("from {{count}} documents", { count: documents.length })}
      </summary>
      <ol>
        {sources.map((source, index) => (
          <li key={source.chunkId}>
            <Link to={sourceLink(source)} className="source-title">
              <span className="citation-chip">{index + 1}</span>
              <FileText aria-hidden="true" />
              <strong>{source.documentName}</strong>
              <span>
                {t("passage {{number}}", { number: source.chunkIndex + 1 })}
                {source.visual ? ` · ${visualLabel(source.visual.label, t)}` : ""}
              </span>
            </Link>
            {source.excerpt ? <p className="source-excerpt">“{source.excerpt}…”</p> : null}
            <span className="source-meta">
              {source.matchType ? t(MATCH_LABEL[source.matchType]) : null}
              {source.score !== undefined ? ` · ${t("relevance {{percent}}", { percent: formatPercent(source.score) })}` : ""}
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
  const { t } = useTranslation();
  const list = sources ?? [];
  return (
    <>
      {withCitations(content, list, t)}
      <SourcePanel sources={list} />
    </>
  );
}
