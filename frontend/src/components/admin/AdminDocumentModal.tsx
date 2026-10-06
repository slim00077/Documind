import { useEffect, useState } from "react";
import { RotateCcw, Trash2, X } from "lucide-react";
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

const ROLE_OPTIONS: DocumentPermissionRole[] = ["VIEWER", "EDITOR"];

type AdminDocumentModalProps = {
  documentId: number;
  onClose: () => void;
  /** Called whenever the document changed so the list behind the modal can refresh. */
  onChanged: () => void;
};

export default function AdminDocumentModal({ documentId, onClose, onChanged }: AdminDocumentModalProps) {
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
        setError(loadError instanceof ApiError ? loadError.message : "Unable to load this document right now.")
      );
  }, [token, documentId]);

  const run = async (action: () => Promise<AdminDocumentDetail>, successMessage: string) => {
    setIsBusy(true);
    try {
      applyDetail(await action());
      onChanged();
      showToast(successMessage, "success");
    } catch (actionError) {
      showToast(actionError instanceof ApiError ? actionError.message : "That action failed. Please try again.", "error");
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
      "Document updated."
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
        onClick={(event) => event.stopPropagation()}
        style={{ width: "min(100%, 640px)" }}
      >
        <div className="page-heading" style={{ marginBottom: 4 }}>
          <div>
            <h2>Manage document</h2>
            <p className="modal-message">Edit metadata, control access, or move this document to Trash.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>

        {error ? <p className="auth-error">{error}</p> : null}
        {!detail && !error ? <p className="auth-hint">Loading document...</p> : null}

        {detail ? (
          <div className="admin-doc-modal">
            <dl className="insights-list">
              <div>
                <dt>Owner</dt>
                <dd>
                  {detail.user.name} ({detail.user.email})
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <StatusBadge status={detail.status} />
                </dd>
              </div>
              <div>
                <dt>File</dt>
                <dd>
                  {detail.originalName ?? "No file"}
                  {detail.size !== null ? ` (${formatFileSize(detail.size)})` : ""}
                </dd>
              </div>
              <div>
                <dt>Processed</dt>
                <dd>
                  {detail.chunkCount} chunk{detail.chunkCount === 1 ? "" : "s"} · {detail.versionCount} older version
                  {detail.versionCount === 1 ? "" : "s"}
                </dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{formatRelativeTime(detail.updatedAt)}</dd>
              </div>
              {detail.deletedAt ? (
                <div>
                  <dt>In Trash since</dt>
                  <dd>{formatRelativeTime(detail.deletedAt)}</dd>
                </div>
              ) : null}
            </dl>
            {detail.processingError ? <p className="auth-error">{detail.processingError}</p> : null}

            <h3>Metadata</h3>
            <div className="auth-form">
              <label>
                <span>Name</span>
                <input className="auth-input" value={name} maxLength={200} onChange={(event) => setName(event.target.value)} />
              </label>
              <label>
                <span>Description</span>
                <textarea
                  className="auth-input"
                  rows={3}
                  maxLength={2000}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
              <label>
                <span>Category</span>
                <select className="auth-input" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                  <option value="">Uncategorized</option>
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
                  {isSaving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>

            <h3>Access</h3>
            <p className="auth-hint">The owner always has full access. Everyone below was explicitly granted access.</p>
            {detail.permissions.length === 0 ? (
              <p className="auth-hint">This document isn&apos;t shared with anyone.</p>
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
                      aria-label={`Access level for ${permission.user.name}`}
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
                          "Access updated."
                        )
                      }
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    <div className="category-row-actions">
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={`Revoke access for ${permission.user.name}`}
                        disabled={isBusy}
                        onClick={() =>
                          token &&
                          run(() => revokeAdminDocumentAccessRequest(token, detail.id, permission.id), "Access revoked.")
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
                aria-label="User to share with"
                value={grantUserId}
                onChange={(event) => setGrantUserId(event.target.value)}
              >
                <option value="">Share with a user...</option>
                {grantableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.email})
                  </option>
                ))}
              </select>
              <select
                className="auth-input filter-select"
                aria-label="Access level"
                value={grantRole}
                onChange={(event) => setGrantRole(event.target.value as DocumentPermissionRole)}
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {role}
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
                    "Access granted."
                  ).then(() => setGrantUserId(""))
                }
              >
                Share
              </button>
            </div>

            <div className="form-actions">
              {detail.deletedAt ? (
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={isBusy}
                  onClick={() => token && run(() => restoreAdminDocumentRequest(token, detail.id), "Document restored.")}
                >
                  <RotateCcw /> Restore from Trash
                </button>
              ) : (
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={isBusy}
                  onClick={() => token && run(() => trashAdminDocumentRequest(token, detail.id), "Document moved to Trash.")}
                >
                  <Trash2 /> Move to Trash
                </button>
              )}
              <button className="button button-primary" type="button" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
