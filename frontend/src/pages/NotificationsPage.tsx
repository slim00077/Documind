import { Bell, Check, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { deleteNotificationRequest, listNotificationsRequest, markAllNotificationsReadRequest, markNotificationReadRequest } from "../services/notifications.api";
import { PageState } from "../components/ui/PageState";
import { ErrorNote, useAsync } from "../components/org/OrgUi";
import { formatRelativeTime } from "../utils/formatRelativeTime";

export default function NotificationsPage() {
  const { token } = useAuth();
  const { data, error, isLoading, reload } = useAsync(() => listNotificationsRequest(token!), [token]);

  const act = async (fn: () => Promise<unknown>) => { try { await fn(); } finally { void reload(); } };

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div><p className="section-kicker">Notifications</p><h1>Notifications</h1><p>Invitations, requests and sharing updates.</p></div>
        {data && data.unreadCount > 0 ? <button className="button button-secondary" onClick={() => void act(() => markAllNotificationsReadRequest(token!))}><Check /> Mark all as read</button> : null}
      </div>
      {error ? <ErrorNote message={error} onRetry={() => void reload()} /> : isLoading && !data ? <p className="auth-hint">Loading...</p> : !data || data.items.length === 0 ? (
        <PageState icon={Bell} title="Nothing new" message="You'll see invitations, request decisions and shared documents here." />
      ) : (
        <article className="workspace-panel">
          <ul className="org-list notif-list">
            {data.items.map((n) => (
              <li key={n.id} className={n.readAt ? "" : "unread"}>
                <span>
                  <strong>{n.title}</strong>
                  <span className="meta"> {n.message}</span>
                  {n.documentId ? <> <Link to={`/app/documents/${n.documentId}`}>Open document</Link></> : null}
                </span>
                <span className="org-row-actions">
                  <span className="meta">{formatRelativeTime(n.createdAt)}</span>
                  {!n.readAt ? <button className="icon-button" aria-label="Mark as read" onClick={() => void act(() => markNotificationReadRequest(token!, n.id))}><Check /></button> : null}
                  <button className="icon-button" aria-label="Delete notification" onClick={() => void act(() => deleteNotificationRequest(token!, n.id))}><Trash2 /></button>
                </span>
              </li>
            ))}
          </ul>
        </article>
      )}
    </section>
  );
}
