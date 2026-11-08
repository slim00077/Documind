import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ApiError, updateAdminUserRequest } from "../../services/admin.api";
import type { AdminUser } from "../../types/admin";
import { normalizeRole, type AppRole } from "../../config/roles";

type AssignableRole = AppRole;

type EditUserModalProps = {
  user: AdminUser;
  onClose: () => void;
  onUpdated: (user: AdminUser) => void;
};

export default function EditUserModal({ user, onClose, onUpdated }: EditUserModalProps) {
  const { token, user: currentUser } = useAuth();

  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<AssignableRole>(normalizeRole(user.role));
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const isSelf = currentUser?.id === user.id;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;

    setIsSaving(true);
    setError("");

    try {
      const updated = await updateAdminUserRequest(token, user.id, { name, email, role });
      onUpdated(updated);
      onClose();
    } catch (updateError) {
      setError(
        updateError instanceof ApiError ? updateError.message : "Unable to update this user right now."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="page-heading" style={{ marginBottom: 4 }}>
          <h2>Edit user</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <label className="auth-label" htmlFor="edit-user-name">Name</label>
          <input
            id="edit-user-name"
            className="auth-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />

          <label className="auth-label" htmlFor="edit-user-email">Email</label>
          <input
            id="edit-user-email"
            type="email"
            className="auth-input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label className="auth-label" htmlFor="edit-user-role">Role</label>
          <select
            id="edit-user-role"
            className="auth-input"
            value={role}
            onChange={(event) => setRole(event.target.value as AssignableRole)}
            disabled={isSelf}
          >
            <option value="STUDENT">Student</option>
            <option value="TEACHER">Teacher</option>
            <option value="ADMIN">Admin</option>
          </select>
          {isSelf ? <p className="auth-hint">You cannot change your own role.</p> : null}

          {error ? <p className="auth-error">{error}</p> : null}

          <div className="form-actions">
            <button className="button button-secondary" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="button button-primary" type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
