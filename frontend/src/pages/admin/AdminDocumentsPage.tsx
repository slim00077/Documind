import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, FileText, RotateCcw, Search, Settings2, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import {
  ApiError,
  listAdminDocumentRowsRequest,
  restoreAdminDocumentRequest,
  trashAdminDocumentRequest,
} from "../../services/admin.api";
import type { AdminDocumentRow } from "../../types/admin";
import { PageState } from "../../components/ui/PageState";
import { useToast } from "../../components/ui/ToastProvider";
import ConfirmDialog from "../../components/documents/ConfirmDialog";
import StatusBadge from "../../components/documents/StatusBadge";
import AdminDocumentModal from "../../components/admin/AdminDocumentModal";
import { formatFileSize } from "../../utils/formatFileSize";
import { formatRelativeTime } from "../../utils/formatRelativeTime";
import { DOCUMENT_STATUS_LABEL } from "../../config/documents";
import { formatNumber } from "../../i18n/format";
import type { DocumentStatus } from "../../types/document";

const STATUSES: DocumentStatus[] = ["PENDING", "UPLOADED", "PROCESSING", "READY", "COMPLETED", "FAILED"];

type StateFilter = "active" | "trashed" | "all";

export default function AdminDocumentsPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { showToast } = useToast();

  const [documents, setDocuments] = useState<AdminDocumentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("active");
  const [statusFilter, setStatusFilter] = useState("all");

  const [managingId, setManagingId] = useState<number | null>(null);
  const [pendingTrash, setPendingTrash] = useState<AdminDocumentRow | null>(null);
  const [isTrashing, setIsTrashing] = useState(false);
  const [trashError, setTrashError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError("");
    try {
      setDocuments(
        await listAdminDocumentRowsRequest(token, {
          search: appliedSearch.trim() || undefined,
          state: stateFilter,
          status: statusFilter === "all" ? undefined : statusFilter,
        })
      );
    } catch (loadError) {
      setError(loadError instanceof ApiError ? loadError.message : t("Unable to load documents right now."));
    } finally {
      setIsLoading(false);
    }
  }, [token, appliedSearch, stateFilter, statusFilter, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRestore = async (document: AdminDocumentRow) => {
    if (!token) return;
    try {
      await restoreAdminDocumentRequest(token, document.id);
      showToast(t("\"{{name}}\" was restored.", { name: document.name }), "success");
      void load();
    } catch (restoreError) {
      showToast(restoreError instanceof ApiError ? restoreError.message : t("Unable to restore this document."), "error");
    }
  };

  const onConfirmTrash = async () => {
    if (!token || !pendingTrash) return;
    setIsTrashing(true);
    setTrashError("");
    try {
      await trashAdminDocumentRequest(token, pendingTrash.id);
      showToast(t("Document moved to Trash."), "success");
      setPendingTrash(null);
      void load();
    } catch (trashErr) {
      setTrashError(trashErr instanceof ApiError ? trashErr.message : t("Unable to move this document to Trash."));
    } finally {
      setIsTrashing(false);
    }
  };

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="section-kicker">{t("Admin")}</p>
          <h1>{t("Documents")}</h1>
          <p>{t("View every document on the platform, edit its metadata, manage who can access it, and delete or restore it.")}</p>
        </div>
      </div>

      <form
        className="admin-table-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setAppliedSearch(search);
        }}
      >
        <label className="search-field" style={{ flex: "1 1 260px" }}>
          <Search />
          <input
            type="search"
            placeholder={t("Search by name, file, or owner")}
            aria-label={t("Search documents")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <select
          className="auth-input filter-select"
          aria-label={t("Filter by state")}
          value={stateFilter}
          onChange={(event) => setStateFilter(event.target.value as StateFilter)}
        >
          <option value="active">{t("Active")}</option>
          <option value="trashed">{t("In Trash")}</option>
          <option value="all">{t("All")}</option>
        </select>
        <select
          className="auth-input filter-select"
          aria-label={t("Filter by status")}
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">{t("All statuses")}</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(DOCUMENT_STATUS_LABEL[status])}
            </option>
          ))}
        </select>
        <button className="button button-secondary" type="submit">
          {t("Search")}
        </button>
      </form>

      {isLoading ? (
        <PageState icon={FileText} title={t("Loading documents...")} compact />
      ) : error ? (
        <PageState
          icon={AlertTriangle}
          title={t("Couldn't load documents")}
          message={error}
          tone="error"
          action={
            <button className="button button-secondary" type="button" onClick={() => void load()}>
              {t("Try again")}
            </button>
          }
        />
      ) : documents.length === 0 ? (
        <PageState icon={FileText} title={t("No documents match these filters.")} compact />
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("Document")}</th>
                <th>{t("Owner")}</th>
                <th>{t("Status")}</th>
                <th>{t("Size")}</th>
                <th>{t("Shared")}</th>
                <th>{t("Created")}</th>
                <th aria-label={t("Actions")} />
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <tr key={document.id}>
                  <td>
                    <strong>{document.name}</strong>
                    {document.deletedAt ? <span className="audit-action-chip" style={{ marginLeft: 8 }}>{t("In Trash")}</span> : null}
                    {document.category ? <div className="admin-table-sub">{document.category.name}</div> : null}
                  </td>
                  <td>
                    {document.user.name}
                    <div className="admin-table-sub">{document.user.email}</div>
                  </td>
                  <td>
                    <StatusBadge status={document.status} />
                  </td>
                  <td>{document.size !== null ? formatFileSize(document.size) : "—"}</td>
                  <td>{formatNumber(document.sharedWithCount)}</td>
                  <td>{formatRelativeTime(document.createdAt)}</td>
                  <td>
                    <div className="admin-row-actions">
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={t("Manage {{name}}", { name: document.name })}
                        onClick={() => setManagingId(document.id)}
                      >
                        <Settings2 />
                      </button>
                      {document.deletedAt ? (
                        <button
                          className="icon-button"
                          type="button"
                          aria-label={t("Restore {{name}}", { name: document.name })}
                          onClick={() => void onRestore(document)}
                        >
                          <RotateCcw />
                        </button>
                      ) : (
                        <button
                          className="icon-button"
                          type="button"
                          aria-label={t("Move {{name}} to Trash", { name: document.name })}
                          onClick={() => setPendingTrash(document)}
                        >
                          <Trash2 />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && !error && documents.length === 100 ? (
        <p className="auth-hint">{t("Showing the 100 most recent matches. Narrow the search to see others.")}</p>
      ) : null}

      {managingId !== null ? (
        <AdminDocumentModal documentId={managingId} onClose={() => setManagingId(null)} onChanged={() => void load()} />
      ) : null}

      {pendingTrash ? (
        <ConfirmDialog
          title={t("Move to Trash")}
          message={t("\"{{name}}\" belongs to {{owner}}. It will be moved to Trash and the owner will be notified. You can restore it at any time.", { name: pendingTrash.name, owner: pendingTrash.user.name })}
          confirmLabel={t("Move to Trash")}
          isBusy={isTrashing}
          error={trashError}
          onConfirm={onConfirmTrash}
          onCancel={() => {
            setPendingTrash(null);
            setTrashError("");
          }}
        />
      ) : null}
    </section>
  );
}
