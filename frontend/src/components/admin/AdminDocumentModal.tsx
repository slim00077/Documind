import { useEffect, useState } from "react";
import { RotateCcw, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import {
  ApiError,
  getAdminDocumentRequest,
  grantAdminDocumentAccessRequest,
  listAdminUsersRequest,
  restoreAdminDocumentRequest,
  revokeAdminDocumentAccessRequest,
  trashAdminDocumentRequest,
  updateAdminDocumentAccessRequest,
  updateAdminDocumentRequest,
} from "../../services/admin.api";
import { listCategoriesRequest } from "../../services/categories.api";
import type { AdminDocumentDetail, AdminUser, DocumentPermissionRole } from "../../types/admin";
import type { Category } from "../../types/category";
import { formatFileSize } from "../../utils/formatFileSize";
import { formatRelativeTime } from "../../utils/formatRelativeTime";
import StatusBadge from "../documents/StatusBadge";
import { useToast } from "../ui/ToastProvider";
import { PERMISSION_ROLE_LABEL } from "../../config/documents";
import { translateStoredText } from "../../i18n/serverText";

const ROLE_OPTIONS: DocumentPermissionRole[] = ["VIEWER", "EDITOR"];

type AdminDocumentModalProps = {
  documentId: number;
  onClose: () => void;
  /** Called whenever the document changed so the list behind the modal can refresh. */
  onChanged: () => void;
};

export default function AdminDocumentModal({ documentId, onClose, onChanged }: AdminDocumentModalProps) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { showToast } = useToast();

  const [detail, setDetail] = useState<AdminDocumentDetail | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [grantUserId, setGrantUserId] = useState("");
  const [grantRole, setGrantRole] = useState<DocumentPermissionRole>("VIEWER");
  const [isBusy, setIsBusy] = useState(false);

  const applyDetail = (next: AdminDocumentDetail) => {
    setDetail(next);
    setName(next.name);
    setDescription(next.description ?? "");
    setCategoryId(next.categoryId ? String(next.categoryId) : "");
  };

  useEffect(() => {
    if (!token) return;
    Promise.all([
      getAdminDocumentRequest(token, documentId),
      listCategoriesRequest(token),
      listAdminUsersRequest(token, { pageSize: 100 }),
    ])
      .then(([documentResult, categoriesResult, usersResult]) => {
        applyDetail(documentResult);
        setCategories(categoriesResult);
        setUsers(usersResult.items);
      })
      .catch((loadError) =>
        setError(loadError instanceof ApiError ? loadError.message : t("Unable to load this document right now."))
      );
  }, [token, documentId, t]);

  const run = async (action: () => Promise<AdminDocumentDetail>, successMessage: string) => {
    setIsBusy(true);
    try {
      applyDetail(await action());
      onChanged();
      showToast(successMessage, "success");
    } catch (actionError) {
      showToast(actionError instanceof ApiError ? actionError.message : t("That action failed. Please try again."), "error");
    } finally {
      setIsBusy(false);
    }
  };

  const onSave = async () => {
    if (!token || !detail) return;
    setIsSaving(true);
    await run(
      () =>
        updateAdminDocumentRequest(token, detail.id, {
          name: name.trim(),
          description: description.trim(),
          categoryId: categoryId ? Number(categoryId) : null,
        }),
      t("Document updated.")
    );
    setIsSaving(false);
  };

  const grantableUsers = detail
    ? users.filter(
        (user) => user.id !== detail.userId && !detail.permissions.some((permission) => permission.userId === user.id)
      )
    : [];

  const isDirty =
    detail !== null &&
    (name.trim() !== detail.name ||
      description.trim() !== (detail.description ?? "") ||
      categoryId !== (detail.categoryId ? String(detail.categoryId) : ""));

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={t("Manage document")}
        onClick={(event) => event.stopPropagation()}
        style={{ width: "min(100%, 640px)" }}
      >
        <div className="page-heading" style={{ marginBottom: 4 }}>
          <div>
            <h2>{t("Manage document")}</h2>
            <p className="modal-message">{t("Edit metadata, control access, or move this document to Trash.")}</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label={t("Close")}>
            <X />
          </button>
        </div>

        {error ? <p className="auth-error">{error}</p> : null}
        {!detail && !error ? <p className="auth-hint">{t("Loading document...")}</p> : null}

        {detail ? (
          <div className="admin-doc-modal">
            <dl className="insights-list">
              <div>
                <dt>{t("Owner")}</dt>
                <dd>
                  {detail.user.name} ({detail.user.email})
                </dd>
              </div>
              <div>
                <dt>{t("Status")}</dt>
                <dd>
                  <StatusBadge status={detail.status} />
                </dd>
              </div>
              <div>
                <dt>{t("File")}</dt>
                <dd>
                  {detail.originalName ?? t("No file")}
                  {detail.size !== null ? ` (${formatFileSize(detail.size)})` : ""}
                </dd>
              </div>
              <div>
                <dt>{t("Processed")}</dt>
                <dd>
                  {t("{{count}} chunks", { count: detail.chunkCount })} · {t("{{count}} older versions", { count: detail.versionCount })}
                </dd>
              </div>
              <div>
                <dt>{t("Updated")}</dt>
                <dd>{formatRelativeTime(detail.updatedAt)}</dd>
              </div>
              {detail.deletedAt ? (
                <div>
                  <dt>{t("In Trash since")}</dt>
                  <dd>{formatRelativeTime(detail.deletedAt)}</dd>
                </div>
              ) : null}
            </dl>
            {detail.processingError ? <p className="auth-error">{translateStoredText(detail.processingError, t)}</p> : null}

            <h3>{t("Metadata")}</h3>
            <div className="auth-form">
              <label>
                <span>{t("Name")}</span>
                <input className="auth-input" value={name} maxLength={200} onChange={(event) => setName(event.target.value)} />
              </label>
              <label>
                <span>{t("Description")}</span>
                <textarea
                  className="auth-input"
                  rows={3}
                  maxLength={2000}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
              <label>
                <span>{t("Category")}</span>
                <select className="auth-input" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                  <option value="">{t("Uncategorized")}</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-actions" style={{ marginTop: 0 }}>
                <button
                  className="button button-primary"
                  type="button"
                  disabled={!isDirty || !name.trim() || isSaving || isBusy}
                  onClick={onSave}
                >
                  {isSaving ? t("Saving...") : t("Save changes")}
                </button>
              </div>
            </div>

            <h3>{t("Access")}</h3>
            <p className="auth-hint">{t("The owner always has full access. Everyone below was explicitly granted access.")}</p>
            {detail.permissions.length === 0 ? (
              <p className="auth-hint">{t("This document isn't shared with anyone.")}</p>
            ) : (
              <ul className="category-list">
                {detail.permissions.map((permission) => (
                  <li key={permission.id} className="category-row">
                    <div className="category-row-info">
                      <strong>{permission.user.name}</strong>
                      <span>{permission.user.email}</span>
                    </div>
                    <select
                      className="auth-input filter-select"
                      value={permission.role}
                      disabled={isBusy}
                      aria-label={t("Access level for {{name}}", { name: permission.user.name })}
                      onChange={(event) =>
                        token &&
                        run(
                          () =>
                            updateAdminDocumentAccessRequest(
                              token,
                              detail.id,
                              permission.id,
                              event.target.value as DocumentPermissionRole
                            ),
                          t("Access updated.")
                        )
                      }
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>
                          {t(PERMISSION_ROLE_LABEL[role])}
                        </option>
                      ))}
                    </select>
                    <div className="category-row-actions">
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={t("Revoke access for {{name}}", { name: permission.user.name })}
                        disabled={isBusy}
                        onClick={() =>
                          token &&
                          run(() => revokeAdminDocumentAccessRequest(token, detail.id, permission.id), t("Access revoked."))
                        }
                      >
                        <Trash2 />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="category-create-row">
              <select
                className="auth-input"
                aria-label={t("User to share with")}
                value={grantUserId}
                onChange={(event) => setGrantUserId(event.target.value)}
              >
                <option value="">{t("Share with a user...")}</option>
                {grantableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.email})
                  </option>
                ))}
              </select>
              <select
                className="auth-input filter-select"
                aria-label={t("Access level")}
                value={grantRole}
                onChange={(event) => setGrantRole(event.target.value as DocumentPermissionRole)}
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {t(PERMISSION_ROLE_LABEL[role])}
                  </option>
                ))}
              </select>
              <button
                className="button button-primary"
                type="button"
                disabled={!grantUserId || isBusy}
                onClick={() =>
                  token &&
                  run(
                    () => grantAdminDocumentAccessRequest(token, detail.id, Number(grantUserId), grantRole),
                    t("Access granted.")
                  ).then(() => setGrantUserId(""))
                }
              >
                {t("Share")}
              </button>
            </div>

            <div className="form-actions">
              {detail.deletedAt ? (
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={isBusy}
                  onClick={() => token && run(() => restoreAdminDocumentRequest(token, detail.id), t("Document restored."))}
                >
                  <RotateCcw /> {t("Restore from Trash")}
                </button>
              ) : (
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={isBusy}
                  onClick={() => token && run(() => trashAdminDocumentRequest(token, detail.id), t("Document moved to Trash."))}
                >
                  <Trash2 /> {t("Move to Trash")}
                </button>
              )}
              <button className="button button-primary" type="button" onClick={onClose}>
                {t("Done")}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
