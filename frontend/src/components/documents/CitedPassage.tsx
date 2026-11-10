import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Quote, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { getDocumentChunksRequest } from "../../services/documents.api";

/** Shows the passage a citation points to (?chunk=N), with its neighbours for context. */
export default function CitedPassage({ documentId }: { documentId: number }) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [params, setParams] = useSearchParams();
  const raw = params.get("chunk");
  const chunkIndex = raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;
  const [loaded, setLoaded] = useState<{
    key: string;
    passages: { chunkIndex: number; content: string }[];
    error: string;
  } | null>(null);
  const key = `${documentId}:${chunkIndex}`;
  // Ignore results that belong to a previously requested passage.
  const current = loaded?.key === key ? loaded : null;
  const passages = current?.passages ?? null;
  const error = current?.error ?? "";
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token || chunkIndex === null) return;
    let active = true;
    getDocumentChunksRequest(token, documentId)
      .then((info) => {
        if (!active) return;
        const near = (info.chunks ?? []).filter(
          (chunk) => Math.abs(chunk.chunkIndex - chunkIndex) <= 1,
        );
        setLoaded({
          key,
          passages: near,
          error: near.length === 0 ? t("This passage is no longer available (the document may have been reprocessed).") : "",
        });
      })
      .catch(() => active && setLoaded({ key, passages: [], error: t("Unable to load the cited passage.") }));
    return () => {
      active = false;
    };
  }, [token, documentId, chunkIndex, key, t]);

  useEffect(() => {
    if (passages) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [passages]);

  if (chunkIndex === null) return null;

  return (
    <div className="cited-passage" ref={ref} role="region" aria-label={t("Cited passage")}>
      <h3 style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Quote size={15} /> {t("Cited passage {{number}}", { number: chunkIndex + 1 })}
        <button
          type="button"
          className="button"
          style={{ marginLeft: "auto" }}
          aria-label={t("Close cited passage")}
          onClick={() =>
            setParams((previous) => {
              const next = new URLSearchParams(previous);
              next.delete("chunk");
              return next;
            })
          }
        >
          <X size={14} />
        </button>
      </h3>
      {error ? <p role="alert">{error}</p> : null}
      {!passages && !error ? <p className="ai-muted">{t("Loading passage…")}</p> : null}
      {passages?.map((chunk) => (
        <pre key={chunk.chunkIndex} className={chunk.chunkIndex === chunkIndex ? "" : "passage-context"}>
          {chunk.chunkIndex === chunkIndex ? <mark>{chunk.content}</mark> : chunk.content}
        </pre>
      ))}
    </div>
  );
}
