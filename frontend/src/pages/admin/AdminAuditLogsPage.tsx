import { useEffect, useState } from "react";
import { AlertTriangle, ClipboardList } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { ApiError, listAuditLogsRequest } from "../../services/admin.api";
import type { AuditLogEntry } from "../../types/admin";
import { PageState } from "../../components/ui/PageState";
import { formatRelativeTime } from "../../utils/formatRelativeTime";
import { AUDIT_TARGET_TYPES, auditActionName, auditTargetLabel } from "../../config/auditActions";

// The filter keeps its original platform-level actions; entries of any action are labelled.
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

export default function AdminAuditLogsPage() {
  const { t } = useTranslation();
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
        loadError instanceof ApiError ? loadError.message : t("Unable to load audit logs right now.")
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
          <p className="section-kicker">{t("Admin")}</p>
          <h1>{t("System monitoring & audit logs")}</h1>
          <p>{t("A record of logins, uploads, edits, deletions, and admin actions.")}</p>
        </div>
      </div>

      <div className="admin-table-toolbar">
        <select
          className="auth-input filter-select"
          aria-label={t("Filter by action")}
          value={actionFilter}
          onChange={(event) => {
            setPage(1);
            setActionFilter(event.target.value);
          }}
        >
          <option value="">{t("All actions")}</option>
          {ACTIONS.map((action) => (
            <option key={action} value={action}>
              {auditActionName(action, t)}
            </option>
          ))}
        </select>
        <select
          className="auth-input filter-select"
          aria-label={t("Filter by target type")}
          value={targetTypeFilter}
          onChange={(event) => {
            setPage(1);
            setTargetTypeFilter(event.target.value);
          }}
        >
          <option value="">{t("All target types")}</option>
          {AUDIT_TARGET_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {t(type.label)}
            </option>
          ))}
        </select>
        <input
          type="date"
          className="auth-input filter-select"
          aria-label={t("From date")}
          value={fromDate}
          onChange={(event) => {
            setPage(1);
            setFromDate(event.target.value);
          }}
        />
        <input
          type="date"
          className="auth-input filter-select"
          aria-label={t("To date")}
          value={toDate}
          onChange={(event) => {
            setPage(1);
            setToDate(event.target.value);
          }}
        />
      </div>

      {isLoading ? (
        <p className="auth-hint">{t("Loading audit logs...")}</p>
      ) : error ? (
        <PageState
          icon={AlertTriangle}
          title={t("Couldn't load audit logs")}
          message={error}
          tone="error"
          action={
            <button className="button button-secondary" type="button" onClick={() => token && void load(token)}>
              {t("Try again")}
            </button>
          }
        />
      ) : logs.length === 0 ? (
        <PageState icon={ClipboardList} title={t("No audit log entries match your filters.")} />
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("When")}</th>
                <th>{t("Actor")}</th>
                <th>{t("Action")}</th>
                <th>{t("Target")}</th>
                <th>{t("IP")}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatRelativeTime(log.createdAt)}</td>
                  <td>{log.actorName ?? log.actor?.name ?? t("System")}</td>
                  <td>
                    <span className="audit-action-chip">{auditActionName(log.action, t)}</span>
                  </td>
                  <td>
                    {log.targetType ? `${auditTargetLabel(log.targetType, t)} #${log.targetId ?? "-"}` : "--"}
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
            {t("Showing {{shown}} of {{count}} entries", { shown: logs.length, count: total })}
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
    </section>
  );
}
