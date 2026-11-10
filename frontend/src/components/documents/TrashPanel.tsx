import { useEffect, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      .catch((err) => setError(err instanceof ApiError ? err.message : t("Unable to load Trash.")));
  }, [token, t]);

  const restore = async (doc: Document) => {
    if (!token) return;
    try {
      const restored = await restoreDocumentRequest(token, doc.id);
      setItems((previous) => previous?.filter((item) => item.id !== doc.id) ?? null);
      onRestored(restored);
      showToast(t("\"{{name}}\" was restored.", { name: doc.name }), "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("Unable to restore this document."), "error");
    }
  };

  const deleteForever = async () => {
    if (!token || !pendingDelete) return;
    setIsBusy(true);
    try {
      await permanentDeleteDocumentRequest(token, pendingDelete.id);
      setItems((previous) => previous?.filter((item) => item.id !== pendingDelete.id) ?? null);
      showToast(t("Document permanently deleted."), "success");
      setPendingDelete(null);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("Unable to delete this document."), "error");
    } finally {
      setIsBusy(false);
    }
  };

  if (error) return <PageState icon={Trash2} title={t("Unable to load Trash")} message={error} tone="error" compact />;
  if (items === null) return <PageState icon={Trash2} title={t("Loading Trash...")} compact />;
  if (items.length === 0) {
    return (
      <PageState
        icon={Trash2}
        title={t("Trash is empty")}
        message={t("Deleted documents appear here until you remove them for good.")}
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
                <span>{doc.deletedAt ? t("Deleted {{when}}", { when: formatRelativeTime(doc.deletedAt) }) : t("Deleted")}</span>
              </div>
            </div>
            <div className="detail-actions">
              <button type="button" className="button button-secondary" onClick={() => void restore(doc)}>
                <RotateCcw /> {t("Restore")}
              </button>
              <button type="button" className="button button-danger" onClick={() => setPendingDelete(doc)}>
                <Trash2 /> {t("Delete forever")}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {pendingDelete ? (
        <ConfirmDialog
          title={t("Delete permanently")}
          message={t("\"{{name}}\" and all its versions will be permanently deleted. This cannot be undone.", { name: pendingDelete.name })}
          confirmLabel={t("Delete forever")}
          isBusy={isBusy}
          onConfirm={() => void deleteForever()}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}
    </>
  );
}
