import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
        updateError instanceof ApiError ? updateError.message : t("Unable to update this user right now.")
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-label={t("Edit user")} onClick={(event) => event.stopPropagation()}>
        <div className="page-heading" style={{ marginBottom: 4 }}>
          <h2>{t("Edit user")}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label={t("Close")}>
            <X />
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <label className="auth-label" htmlFor="edit-user-name">{t("Name")}</label>
          <input
            id="edit-user-name"
            className="auth-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />

          <label className="auth-label" htmlFor="edit-user-email">{t("Email")}</label>
          <input
            id="edit-user-email"
            type="email"
            className="auth-input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label className="auth-label" htmlFor="edit-user-role">{t("Role")}</label>
          <select
            id="edit-user-role"
            className="auth-input"
            value={role}
            onChange={(event) => setRole(event.target.value as AssignableRole)}
            disabled={isSelf}
          >
            <option value="STUDENT">{t("Student")}</option>
            <option value="TEACHER">{t("Teacher")}</option>
            <option value="ADMIN">{t("Admin")}</option>
          </select>
          {isSelf ? <p className="auth-hint">{t("You cannot change your own role.")}</p> : null}

          {error ? <p className="auth-error">{error}</p> : null}

          <div className="form-actions">
            <button className="button button-secondary" type="button" onClick={onClose}>
              {t("Cancel")}
            </button>
            <button className="button button-primary" type="submit" disabled={isSaving}>
              {isSaving ? t("Saving...") : t("Save changes")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
