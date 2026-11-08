import { Link } from "react-router-dom";
import { FolderOpen, Layers, MessageSquare, Star, Trash2, Users } from "lucide-react";
import type { Document } from "../../types/document";
import { formatFileSize } from "../../utils/formatFileSize";
import { formatRelativeTime } from "../../utils/formatRelativeTime";
import StatusBadge from "./StatusBadge";

type DocumentCardProps = {
  document: Document;
  onDelete: (id: number) => void;
  sharedBy?: string;
  onToggleFavorite?: (document: Document) => void;
};

const fileKind = (document: Document): { label: string; tone: string } => {
  const mime = document.mimeType ?? "";
  const ext = document.originalName?.split(".").pop()?.toUpperCase() ?? "";
  if (mime.includes("pdf") || ext === "PDF") return { label: "PDF", tone: "pdf" };
  if (mime.startsWith("image/")) return { label: ext || "IMG", tone: "img" };
  if (mime.startsWith("text/") || ext === "TXT" || ext === "MD") return { label: ext || "TXT", tone: "txt" };
  return { label: ext.slice(0, 4) || "DOC", tone: "doc" };
};

export default function DocumentCard({ document, onDelete, sharedBy, onToggleFavorite }: DocumentCardProps) {
  const kind = fileKind(document);
  const isReady = document.status === "READY" || document.status === "COMPLETED";

  return (
    <li className="doc-card">
      <div className="doc-card-head">
        <span className={`doc-type type-${kind.tone}`} aria-hidden="true">
          {kind.label}
        </span>
        <Link to={`/app/documents/${document.id}`} className="doc-card-title" title="Open document">
          <strong>{document.name}</strong>
          <span>
            {document.size !== null ? formatFileSize(document.size) : "Unknown size"} &middot; {formatRelativeTime(document.createdAt)}
          </span>
        </Link>
        <StatusBadge status={document.status} />
      </div>
      <p className="doc-card-desc">{document.description || "No description yet."}</p>
      <div className="doc-card-tags">
        {document.category ? (
          <span className="doc-tag">
            <FolderOpen /> {document.category.name}
          </span>
        ) : null}
        {document.chunkCount > 0 ? (
          <span className="doc-tag">
            <Layers /> {document.chunkCount} passage{document.chunkCount === 1 ? "" : "s"}
          </span>
        ) : null}
        {sharedBy ? (
          <span className="doc-tag">
            <Users /> {sharedBy} &middot; {document.accessRole === "EDITOR" ? "Can edit" : "View only"}
          </span>
        ) : null}
      </div>
      <div className="doc-card-foot">
        <Link className="button button-secondary" style={{ minHeight: 34, padding: "5px 12px" }} to={`/app/documents/${document.id}`}>
          Open
        </Link>
        <div className="doc-card-actions">
          {onToggleFavorite ? (
            <button
              type="button"
              className={`icon-button favorite-button ${document.isFavorite ? "is-favorite" : ""}`}
              aria-label={document.isFavorite ? `Remove ${document.name} from favorites` : `Add ${document.name} to favorites`}
              aria-pressed={Boolean(document.isFavorite)}
              title={document.isFavorite ? "Remove from favorites" : "Add to favorites"}
              onClick={() => onToggleFavorite(document)}
            >
              <Star />
            </button>
          ) : null}
          {isReady ? (
            <Link to={`/app/assistant?document=${document.id}`} className="icon-button" aria-label={`Ask AI about ${document.name}`} title="Ask AI about this document">
              <MessageSquare />
            </Link>
          ) : null}
          {!document.accessRole || document.accessRole === "OWNER" ? (
            <button type="button" className="icon-button" aria-label={`Delete ${document.name}`} onClick={() => onDelete(document.id)}>
              <Trash2 />
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
