import { Link } from "react-router-dom";
import { FileText, FolderOpen, Layers, MessageSquare, Paperclip, Star, Trash2, Users } from "lucide-react";
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

export default function DocumentCard({ document, onDelete, sharedBy, onToggleFavorite }: DocumentCardProps) {
  return (
    <li className="document-row">
      <Link to={`/app/documents/${document.id}`} className="document-row-main">
        <div className="document-row-icon">
          <FileText />
        </div>
        <div className="document-row-info">
          <strong>{document.name}</strong>
          <span>{document.description || "No description yet."}</span>
          <span className="document-row-meta">
            {document.originalName ? (
              <span className="document-row-file">
                <Paperclip /> {document.originalName}
                {document.size !== null ? ` (${formatFileSize(document.size)})` : ""}
              </span>
            ) : null}
            {document.category ? (
              <span className="document-row-tag">
                <FolderOpen /> {document.category.name}
              </span>
            ) : null}
            {document.chunkCount > 0 ? (
              <span className="document-row-tag">
                <Layers /> {document.chunkCount} chunk{document.chunkCount === 1 ? "" : "s"}
              </span>
            ) : null}
            {sharedBy ? (
              <span className="document-row-tag">
                <Users /> Shared by {sharedBy} &middot; {document.accessRole === "EDITOR" ? "Can edit" : "View only"}
              </span>
            ) : null}
            <span className="document-row-tag document-row-tag-muted">
              Updated {formatRelativeTime(document.updatedAt)}
            </span>
          </span>
        </div>
        <StatusBadge status={document.status} />
      </Link>
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
      {document.status === "READY" || document.status === "COMPLETED" ? (
        <Link
          to={`/app/assistant?document=${document.id}`}
          className="icon-button"
          aria-label={`Ask AI about ${document.name}`}
          title="Ask AI about this document"
        >
          <MessageSquare />
        </Link>
      ) : null}
      {!document.accessRole || document.accessRole === "OWNER" ? (
        <button
          type="button"
          className="icon-button"
          aria-label={`Delete ${document.name}`}
          onClick={() => onDelete(document.id)}
        >
          <Trash2 />
        </button>
      ) : null}
    </li>
  );
}
