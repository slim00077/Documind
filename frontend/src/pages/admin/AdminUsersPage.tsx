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

export default function AdminUsersPage() {
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
        loadError instanceof ApiError ? loadError.message : "Unable to load users right now."
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
      showToast(updated.isActive ? "User enabled." : "User disabled.", "success");
    } catch (toggleError) {
      showToast(
        toggleError instanceof ApiError ? toggleError.message : "Unable to update this user right now.",
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
      showToast("User deleted.", "success");
    } catch (deleteErr) {
      setDeleteError(
        deleteErr instanceof ApiError ? deleteErr.message : "Unable to delete this user right now."
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="section-kicker">Admin</p>
          <h1>Users & permissions</h1>
          <p>View, edit, disable, or delete users, and manage their document access.</p>
        </div>
      </div>

      <form className="admin-table-toolbar" onSubmit={onSearchSubmit}>
        <label className="search-field" style={{ flex: "1 1 260px" }}>
          <Search />
          <input
            type="search"
            placeholder="Search by name or email"
            aria-label="Search users"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <select
          className="auth-input filter-select"
          aria-label="Filter by role"
          value={roleFilter}
          onChange={(event) => {
            setPage(1);
            setRoleFilter(event.target.value as typeof roleFilter);
          }}
        >
          <option value="all">All roles</option>
          <option value="STUDENT">Student</option>
          <option value="TEACHER">Teacher</option>
          <option value="ADMIN">Admin</option>
        </select>
        <select
          className="auth-input filter-select"
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(event) => {
            setPage(1);
            setStatusFilter(event.target.value as typeof statusFilter);
          }}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
        <button className="button button-secondary" type="submit">
          Search
        </button>
      </form>

      {isLoading ? (
        <p className="auth-hint">Loading users...</p>
      ) : error ? (
        <PageState
          icon={AlertTriangle}
          title="Couldn't load users"
          message={error}
          tone="error"
          action={
            <button className="button button-secondary" type="button" onClick={() => token && void load(token)}>
              Try again
            </button>
          }
        />
      ) : users.length === 0 ? (
        <PageState icon={Users} title="No users match your filters." />
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Documents</th>
                <th>Joined</th>
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
                      {ROLE_LABEL[normalizeRole(user.role)]}
                    </span>
                  </td>
                  <td>
                    <span className={`status-dot ${user.isActive ? "status-dot-active" : "status-dot-disabled"}`}>
                      {user.isActive ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td>{user.documentCount}</td>
                  <td>{formatRelativeTime(user.createdAt)}</td>
                  <td>
                    <div className="admin-row-actions">
                      <button
                        className="icon-button"
                        type="button"
                        aria-label="Edit user"
                        onClick={() => setEditingUser(user)}
                      >
                        <Pencil />
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        aria-label="Manage permissions"
                        onClick={() => setPermissionsUser(user)}
                      >
                        <ShieldCheck />
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={user.isActive ? "Disable user" : "Enable user"}
                        onClick={() => onToggleStatus(user)}
                        disabled={user.id === currentUser?.id && user.isActive}
                      >
                        <UserX />
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        aria-label="Delete user"
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
            Showing {users.length} of {total} users
          </span>
          <div className="pagination-buttons">
            <button
              className="button button-secondary"
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((previous) => Math.max(previous - 1, 1))}
            >
              Previous
            </button>
            <button
              className="button button-secondary"
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((previous) => Math.min(previous + 1, totalPages))}
            >
              Next
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
          title="Delete user"
          message={`This will permanently delete ${pendingDeleteUser.name} and all of their documents. This action cannot be undone.`}
          confirmLabel="Delete"
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
