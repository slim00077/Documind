import { ROLE_LABEL, normalizeRole } from "../../config/roles";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  UserX,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import {
  ApiError,
  deleteAdminUserRequest,
  listAdminUsersRequest,
  setAdminUserStatusRequest,
} from "../../services/admin.api";
import type { AdminUser } from "../../types/admin";
import { PageState } from "../../components/ui/PageState";
import ConfirmDialog from "../../components/documents/ConfirmDialog";
import EditUserModal from "../../components/admin/EditUserModal";
import UserPermissionsModal from "../../components/admin/UserPermissionsModal";
import { useToast } from "../../components/ui/ToastProvider";
import { formatRelativeTime } from "../../utils/formatRelativeTime";
import { formatNumber } from "../../i18n/format";

export default function AdminUsersPage() {
  const { t } = useTranslation();
  const { token, user: currentUser } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "STUDENT" | "TEACHER" | "ADMIN">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "disabled">("all");

  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [permissionsUser, setPermissionsUser] = useState<AdminUser | null>(null);
  const [pendingDeleteUser, setPendingDeleteUser] = useState<AdminUser | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const load = async (activeToken: string) => {
    setIsLoading(true);
    setError("");

    try {
      const result = await listAdminUsersRequest(activeToken, {
        search: search.trim() || undefined,
        role: roleFilter === "all" ? undefined : roleFilter,
        isActive: statusFilter === "all" ? undefined : statusFilter === "active",
        page,
        pageSize: 20,
      });
      setUsers(result.items);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (loadError) {
      setError(
        loadError instanceof ApiError ? loadError.message : t("Unable to load users right now.")
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    void load(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, page, roleFilter, statusFilter]);

  const onSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    if (token) void load(token);
  };

  const onToggleStatus = async (user: AdminUser) => {
    if (!token) return;

    try {
      const updated = await setAdminUserStatusRequest(token, user.id, !user.isActive);
      setUsers((previous) => previous.map((item) => (item.id === user.id ? updated : item)));
      showToast(updated.isActive ? t("User enabled.") : t("User disabled."), "success");
    } catch (toggleError) {
      showToast(
        toggleError instanceof ApiError ? toggleError.message : t("Unable to update this user right now."),
        "error"
      );
    }
  };

  const onConfirmDelete = async () => {
    if (!token || !pendingDeleteUser) return;

    setIsDeleting(true);
    setDeleteError("");

    try {
      await deleteAdminUserRequest(token, pendingDeleteUser.id);
      setUsers((previous) => previous.filter((item) => item.id !== pendingDeleteUser.id));
      setPendingDeleteUser(null);
      showToast(t("User deleted."), "success");
    } catch (deleteErr) {
      setDeleteError(
        deleteErr instanceof ApiError ? deleteErr.message : t("Unable to delete this user right now.")
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="section-kicker">{t("Admin")}</p>
          <h1>{t("Users & permissions")}</h1>
          <p>{t("View, edit, disable, or delete users, and manage their document access.")}</p>
        </div>
      </div>

      <form className="admin-table-toolbar" onSubmit={onSearchSubmit}>
        <label className="search-field" style={{ flex: "1 1 260px" }}>
          <Search />
          <input
            type="search"
            placeholder={t("Search by name or email")}
            aria-label={t("Search users")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <select
          className="auth-input filter-select"
          aria-label={t("Filter by role")}
          value={roleFilter}
          onChange={(event) => {
            setPage(1);
            setRoleFilter(event.target.value as typeof roleFilter);
          }}
        >
          <option value="all">{t("All roles")}</option>
          <option value="STUDENT">{t("Student")}</option>
          <option value="TEACHER">{t("Teacher")}</option>
          <option value="ADMIN">{t("Admin")}</option>
        </select>
        <select
          className="auth-input filter-select"
          aria-label={t("Filter by status")}
          value={statusFilter}
          onChange={(event) => {
            setPage(1);
            setStatusFilter(event.target.value as typeof statusFilter);
          }}
        >
          <option value="all">{t("All statuses")}</option>
          <option value="active">{t("Active")}</option>
          <option value="disabled">{t("Disabled")}</option>
        </select>
        <button className="button button-secondary" type="submit">
          {t("Search")}
        </button>
      </form>

      {isLoading ? (
        <p className="auth-hint">{t("Loading users...")}</p>
      ) : error ? (
        <PageState
          icon={AlertTriangle}
          title={t("Couldn't load users")}
          message={error}
          tone="error"
          action={
            <button className="button button-secondary" type="button" onClick={() => token && void load(token)}>
              {t("Try again")}
            </button>
          }
        />
      ) : users.length === 0 ? (
        <PageState icon={Users} title={t("No users match your filters.")} />
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("Name")}</th>
                <th>{t("Email")}</th>
                <th>{t("Role")}</th>
                <th>{t("Status")}</th>
                <th>{t("Documents")}</th>
                <th>{t("Joined")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>
                    <span className={`role-chip role-${normalizeRole(user.role).toLowerCase()}`}>
                      {t(ROLE_LABEL[normalizeRole(user.role)])}
                    </span>
                  </td>
                  <td>
                    <span className={`status-dot ${user.isActive ? "status-dot-active" : "status-dot-disabled"}`}>
                      {user.isActive ? t("Active") : t("Disabled")}
                    </span>
                  </td>
                  <td>{formatNumber(user.documentCount)}</td>
                  <td>{formatRelativeTime(user.createdAt)}</td>
                  <td>
                    <div className="admin-row-actions">
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={t("Edit user")}
                        onClick={() => setEditingUser(user)}
                      >
                        <Pencil />
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={t("Manage permissions")}
                        onClick={() => setPermissionsUser(user)}
                      >
                        <ShieldCheck />
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={user.isActive ? t("Disable user") : t("Enable user")}
                        onClick={() => onToggleStatus(user)}
                        disabled={user.id === currentUser?.id && user.isActive}
                      >
                        <UserX />
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={t("Delete user")}
                        onClick={() => setPendingDeleteUser(user)}
                        disabled={user.id === currentUser?.id}
                      >
                        <Trash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && !error && users.length > 0 ? (
        <div className="pagination-bar">
          <span>
            {t("Showing {{shown}} of {{count}} users", { shown: users.length, count: total })}
          </span>
          <div className="pagination-buttons">
            <button
              className="button button-secondary"
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((previous) => Math.max(previous - 1, 1))}
            >
              {t("Previous")}
            </button>
            <button
              className="button button-secondary"
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((previous) => Math.min(previous + 1, totalPages))}
            >
              {t("Next")}
            </button>
          </div>
        </div>
      ) : null}

      {editingUser ? (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onUpdated={(updated) =>
            setUsers((previous) => previous.map((item) => (item.id === updated.id ? updated : item)))
          }
        />
      ) : null}

      {permissionsUser ? (
        <UserPermissionsModal user={permissionsUser} onClose={() => setPermissionsUser(null)} />
      ) : null}

      {pendingDeleteUser ? (
        <ConfirmDialog
          title={t("Delete user")}
          message={t("This will permanently delete {{name}} and all of their documents. This action cannot be undone.", { name: pendingDeleteUser.name })}
          confirmLabel={t("Delete")}
          isBusy={isDeleting}
          error={deleteError}
          onConfirm={onConfirmDelete}
          onCancel={() => {
            setPendingDeleteUser(null);
            setDeleteError("");
          }}
        />
      ) : null}
    </section>
  );
}
