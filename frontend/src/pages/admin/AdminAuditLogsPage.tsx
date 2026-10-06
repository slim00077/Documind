import { useEffect, useState } from "react";
import { AlertTriangle, ClipboardList } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ApiError, listAuditLogsRequest } from "../../services/admin.api";
import type { AuditLogEntry } from "../../types/admin";
import { PageState } from "../../components/ui/PageState";
import { formatRelativeTime } from "../../utils/formatRelativeTime";

const ACTIONS = [
  "LOGIN",
  "REGISTER",
  "DOCUMENT_UPLOAD",
  "DOCUMENT_UPDATE",
  "DOCUMENT_DELETE",
  "PERMISSION_GRANT",
  "PERMISSION_UPDATE",
  "PERMISSION_REVOKE",
  "USER_UPDATE",
  "USER_DISABLE",
  "USER_ENABLE",
  "USER_DELETE",
  "USER_ROLE_CHANGE",
  "CATEGORY_CREATE",
  "CATEGORY_UPDATE",
  "CATEGORY_DELETE",
];

const TARGET_TYPES = ["User", "Document", "Category"];

export default function AdminAuditLogsPage() {
  const { token } = useAuth();

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [actionFilter, setActionFilter] = useState("");
  const [targetTypeFilter, setTargetTypeFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const load = async (activeToken: string) => {
    setIsLoading(true);
    setError("");

    try {
      const result = await listAuditLogsRequest(activeToken, {
        action: actionFilter || undefined,
        targetType: targetTypeFilter || undefined,
        from: fromDate ? new Date(fromDate).toISOString() : undefined,
        to: toDate ? new Date(toDate).toISOString() : undefined,
        page,
        pageSize: 25,
      });
      setLogs(result.items);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (loadError) {
      setError(
        loadError instanceof ApiError ? loadError.message : "Unable to load audit logs right now."
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    void load(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, page, actionFilter, targetTypeFilter, fromDate, toDate]);

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="section-kicker">Admin</p>
          <h1>Audit logs</h1>
          <p>A record of logins, uploads, edits, deletions, and admin actions.</p>
        </div>
      </div>

      <div className="admin-table-toolbar">
        <select
          className="auth-input filter-select"
          aria-label="Filter by action"
          value={actionFilter}
          onChange={(event) => {
            setPage(1);
            setActionFilter(event.target.value);
          }}
        >
          <option value="">All actions</option>
          {ACTIONS.map((action) => (
            <option key={action} value={action}>
              {action.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <select
          className="auth-input filter-select"
          aria-label="Filter by target type"
          value={targetTypeFilter}
          onChange={(event) => {
            setPage(1);
            setTargetTypeFilter(event.target.value);
          }}
        >
          <option value="">All target types</option>
          {TARGET_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <input
          type="date"
          className="auth-input filter-select"
          aria-label="From date"
          value={fromDate}
          onChange={(event) => {
            setPage(1);
            setFromDate(event.target.value);
          }}
        />
        <input
          type="date"
          className="auth-input filter-select"
          aria-label="To date"
          value={toDate}
          onChange={(event) => {
            setPage(1);
            setToDate(event.target.value);
          }}
        />
      </div>

      {isLoading ? (
        <p className="auth-hint">Loading audit logs...</p>
      ) : error ? (
        <PageState
          icon={AlertTriangle}
          title="Couldn't load audit logs"
          message={error}
          tone="error"
          action={
            <button className="button button-secondary" type="button" onClick={() => token && void load(token)}>
              Try again
            </button>
          }
        />
      ) : logs.length === 0 ? (
        <PageState icon={ClipboardList} title="No audit log entries match your filters." />
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatRelativeTime(log.createdAt)}</td>
                  <td>{log.actorName ?? log.actor?.name ?? "System"}</td>
                  <td>
                    <span className="audit-action-chip">{log.action.replaceAll("_", " ")}</span>
                  </td>
                  <td>
                    {log.targetType ? `${log.targetType} #${log.targetId ?? "-"}` : "--"}
                  </td>
                  <td>{log.ipAddress ?? "--"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && !error && logs.length > 0 ? (
        <div className="pagination-bar">
          <span>
            Showing {logs.length} of {total} entries
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
    </section>
  );
}
