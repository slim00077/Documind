import { useCallback, useEffect, useRef, useState } from "react";
import { Download, History, RotateCcw, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import {
  ApiError,
  downloadVersionRequest,
  listVersionsRequest,
  restoreVersionRequest,
  uploadVersionRequest,
} from "../../services/documents.api";
import type { Document, DocumentVersionsResponse } from "../../types/document";
import { formatFileSize } from "../../utils/formatFileSize";
import { formatDateTime } from "../../i18n/format";
import { useToast } from "../ui/ToastProvider";

type Props = {
  doc: Document;
  canEdit: boolean;
  onDocumentChanged: (doc: Document) => void;
};

export default function DocumentVersionsPanel({ doc, canEdit, onDocumentChanged }: Props) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { showToast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<DocumentVersionsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setData(await listVersionsRequest(token, doc.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Unable to load version history."));
    }
  }, [token, doc.id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<Document>, successMessage: string) => {
    setBusy(true);
    setError("");
    try {
      onDocumentChanged(await action());
      await load();
      showToast(successMessage, "success");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("That action failed. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const onFileChosen = (file: File | undefined) => {
    if (!file || !token) return;
    void run(() => uploadVersionRequest(token, doc.id, file), t("New version uploaded and reprocessed."));
    if (fileInput.current) fileInput.current.value = "";
  };

  const onDownload = async (versionId: number, name: string | null) => {
    if (!token) return;
    try {
      const blob = await downloadVersionRequest(token, doc.id, versionId);
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = name ?? `version-${versionId}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Unable to download this version."));
    }
  };

  return (
    <div className="extracted-text-section">
      <div className="panel-heading">
        <h3>
          <History /> {t("Version history")}
        </h3>
        {canEdit ? (
          <>
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
              hidden
              onChange={(event) => onFileChosen(event.target.files?.[0])}
            />
            <button
              type="button"
              className="button button-secondary"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              <Upload /> {busy ? t("Working...") : t("Upload new version")}
            </button>
          </>
        ) : null}
      </div>

      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}

      {data && (data.current || data.versions.length > 0) ? (
        <ul className="version-list">
          {data.current ? (
            <li className="version-row">
              <div>
                <strong>{t("v{{version}} · current", { version: data.current.version })}</strong>
                <span>
                  {data.current.originalName ?? t("Unnamed file")}
                  {data.current.size !== null ? ` (${formatFileSize(data.current.size)})` : ""}
                </span>
              </div>
            </li>
          ) : null}
          {data.versions.map((version) => (
            <li key={version.id} className="version-row">
              <div>
                <strong>v{version.version}</strong>
                <span>
                  {version.originalName ?? t("Unnamed file")}
                  {version.size !== null ? ` (${formatFileSize(version.size)})` : ""} ·{" "}
                  {formatDateTime(version.createdAt)}
                </span>
              </div>
              <div className="detail-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => void onDownload(version.id, version.originalName)}
                >
                  <Download /> {t("View")}
                </button>
                {canEdit ? (
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={busy}
                    onClick={() =>
                      token &&
                      void run(
                        () => restoreVersionRequest(token, doc.id, version.id),
                        t("Restored v{{version}}.", { version: version.version })
                      )
                    }
                  >
                    <RotateCcw /> {t("Restore")}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="insights-meta">
          {data ? t("No previous versions yet. Uploading a new file keeps the old one here.") : t("Loading...")}
        </p>
      )}
    </div>
  );
}
