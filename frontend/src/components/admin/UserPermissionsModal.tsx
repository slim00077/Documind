import { useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import {
  ApiError,
  grantPermissionRequest,
  listAdminDocumentsRequest,
  listUserPermissionsRequest,
  revokePermissionRequest,
  updatePermissionRequest,
} from "../../services/admin.api";
import type { AdminDocumentSummary, AdminUser, DocumentPermissionEntry, DocumentPermissionRole } from "../../types/admin";
import { useToast } from "../ui/ToastProvider";

const ROLE_OPTIONS: DocumentPermissionRole[] = ["VIEWER", "EDITOR"];

type UserPermissionsModalProps = {
  user: AdminUser;
  onClose: () => void;
};

export default function UserPermissionsModal({ user, onClose }: UserPermissionsModalProps) {
  const { token } = useAuth();
  const { showToast } = useToast();

  const [permissions, setPermissions] = useState<DocumentPermissionEntry[]>([]);
  const [documents, setDocuments] = useState<AdminDocumentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedDocumentId, setSelectedDocumentId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<DocumentPermissionRole>("VIEWER");
  const [isGranting, setIsGranting] = useState(false);

  const load = async (activeToken: string) => {
    setIsLoading(true);
    setError("");
    try {
      const [permissionsResult, documentsResult] = await Promise.all([
        listUserPermissionsRequest(activeToken, user.id),
        listAdminDocumentsRequest(activeToken),
      ]);
      setPermissions(permissionsResult);
      setDocuments(documentsResult.filter((document) => document.userId !== user.id));
    } catch (loadError) {
      setError(
        loadError instanceof ApiError ? loadError.message : "Unable to load permissions right now."
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    void load(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user.id]);

  const availableDocuments = documents.filter(
    (document) => !permissions.some((permission) => permission.documentId === document.id)
  );

  const onGrant = async () => {
    if (!token || !selectedDocumentId) return;

    setIsGranting(true);
    try {
      const permission = await grantPermissionRequest(
        token,
        user.id,
        Number(selectedDocumentId),
        selectedRole
      );
      setPermissions((previous) => [permission, ...previous]);
      setSelectedDocumentId("");
      showToast("Permission granted.", "success");
    } catch (grantError) {
      showToast(
        grantError instanceof ApiError ? grantError.message : "Unable to grant this permission right now.",
        "error"
      );
    } finally {
      setIsGranting(false);
    }
  };

  const onChangeRole = async (permissionId: number, role: DocumentPermissionRole) => {
    if (!token) return;
    try {
      const updated = await updatePermissionRequest(token, user.id, permissionId, role);
      setPermissions((previous) =>
        previous.map((permission) => (permission.id === permissionId ? updated : permission))
      );
    } catch (updateError) {
      showToast(
        updateError instanceof ApiError ? updateError.message : "Unable to update this permission right now.",
        "error"
      );
    }
  };

  const onRevoke = async (permissionId: number) => {
    if (!token) return;
    try {
      await revokePermissionRequest(token, user.id, permissionId);
      setPermissions((previous) => previous.filter((permission) => permission.id !== permissionId));
      showToast("Permission revoked.", "success");
    } catch (revokeError) {
      showToast(
        revokeError instanceof ApiError ? revokeError.message : "Unable to revoke this permission right now.",
        "error"
      );
    }
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        style={{ width: "min(100%, 560px)" }}
      >
        <div className="page-heading" style={{ marginBottom: 4 }}>
          <div>
            <h2>Document permissions</h2>
            <p className="modal-message">
              Manage which documents {user.name} can access beyond their own uploads.
            </p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>

        {error ? <p className="auth-error">{error}</p> : null}

        {!isLoading ? (
          <div className="category-create-row">
            <select
              className="auth-input"
              value={selectedDocumentId}
              onChange={(event) => setSelectedDocumentId(event.target.value)}
            >
              <option value="">Select a document to share...</option>
              {availableDocuments.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.name} (owner: {document.user.name})
                </option>
              ))}
            </select>
            <select
              className="auth-input filter-select"
              value={selectedRole}
              onChange={(event) => setSelectedRole(event.target.value as DocumentPermissionRole)}
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
              disabled={!selectedDocumentId || isGranting}
              onClick={onGrant}
            >
              {isGranting ? "Sharing..." : "Share"}
            </button>
          </div>
        ) : null}

        {isLoading ? (
          <p className="auth-hint">Loading permissions...</p>
        ) : permissions.length === 0 ? (
          <p className="auth-hint">This user has no shared document permissions yet.</p>
        ) : (
          <ul className="category-list">
            {permissions.map((permission) => (
              <li key={permission.id} className="category-row">
                <div className="category-row-info">
                  <strong>{permission.document.name}</strong>
                  <span>Status: {permission.document.status}</span>
                </div>
                <select
                  className="auth-input filter-select"
                  value={permission.role}
                  onChange={(event) => onChangeRole(permission.id, event.target.value as DocumentPermissionRole)}
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
                    aria-label="Revoke permission"
                    onClick={() => onRevoke(permission.id)}
                  >
                    <Trash2 />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="form-actions">
          <button className="button button-secondary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
