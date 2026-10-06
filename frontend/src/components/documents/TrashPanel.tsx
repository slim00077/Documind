import { useEffect, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import {
  ApiError,
  listTrashRequest,
  permanentDeleteDocumentRequest,
  restoreDocumentRequest,
} from "../../services/documents.api";
import type { Document } from "../../types/document";
import { formatRelativeTime } from "../../utils/formatRelativeTime";
import { PageState } from "../ui/PageState";
import { useToast } from "../ui/ToastProvider";
import ConfirmDialog from "./ConfirmDialog";

export default function TrashPanel({ onRestored }: { onRestored: (doc: Document) => void }) {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState<Document[] | null>(null);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Document | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    listTrashRequest(token)
      .then(setItems)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Unable to load Trash."));
  }, [token]);

  const restore = async (doc: Document) => {
    if (!token) return;
    try {
      const restored = await restoreDocumentRequest(token, doc.id);
      setItems((previous) => previous?.filter((item) => item.id !== doc.id) ?? null);
      onRestored(restored);
      showToast(`"${doc.name}" was restored.`, "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Unable to restore this document.", "error");
    }
  };

  const deleteForever = async () => {
    if (!token || !pendingDelete) return;
    setIsBusy(true);
    try {
      await permanentDeleteDocumentRequest(token, pendingDelete.id);
      setItems((previous) => previous?.filter((item) => item.id !== pendingDelete.id) ?? null);
      showToast("Document permanently deleted.", "success");
      setPendingDelete(null);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Unable to delete this document.", "error");
    } finally {
      setIsBusy(false);
    }
  };

  if (error) return <PageState icon={Trash2} title="Unable to load Trash" message={error} tone="error" compact />;
  if (items === null) return <PageState icon={Trash2} title="Loading Trash..." compact />;
  if (items.length === 0) {
    return (
      <PageState
        icon={Trash2}
        title="Trash is empty"
        message="Deleted documents appear here until you remove them for good."
        compact
      />
    );
  }

  return (
    <>
      <ul className="document-list">
        {items.map((doc) => (
          <li key={doc.id} className="document-row">
            <div className="document-row-main">
              <div className="document-row-info">
                <strong>{doc.name}</strong>
                <span>Deleted {doc.deletedAt ? formatRelativeTime(doc.deletedAt) : ""}</span>
              </div>
            </div>
            <div className="detail-actions">
              <button type="button" className="button button-secondary" onClick={() => void restore(doc)}>
                <RotateCcw /> Restore
              </button>
              <button type="button" className="button button-danger" onClick={() => setPendingDelete(doc)}>
                <Trash2 /> Delete forever
              </button>
            </div>
          </li>
        ))}
      </ul>

      {pendingDelete ? (
        <ConfirmDialog
          title="Delete permanently"
          message={`"${pendingDelete.name}" and all its versions will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete forever"
          isBusy={isBusy}
          onConfirm={() => void deleteForever()}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}
    </>
  );
}
