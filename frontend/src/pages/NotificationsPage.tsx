import { Bell, Check, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { deleteNotificationRequest, listNotificationsRequest, markAllNotificationsReadRequest, markNotificationReadRequest } from "../services/notifications.api";
import { PageState } from "../components/ui/PageState";
import { ErrorNote, useAsync } from "../components/org/OrgUi";
import { formatRelativeTime } from "../utils/formatRelativeTime";

export default function NotificationsPage() {
  const { t, i18n } = useTranslation();
  const { token } = useAuth();
  // Notification texts are localized by the server: reload them when the language changes.
  const { data, error, isLoading, reload } = useAsync(() => listNotificationsRequest(token!), [token, i18n.resolvedLanguage]);

  const act = async (fn: () => Promise<unknown>) => { try { await fn(); } finally { void reload(); } };

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div><p className="section-kicker">{t("Notifications")}</p><h1>{t("Notifications")}</h1><p>{t("Invitations, requests and sharing updates.")}</p></div>
        {data && data.unreadCount > 0 ? <button className="button button-secondary" onClick={() => void act(() => markAllNotificationsReadRequest(token!))}><Check /> {t("Mark all as read")}</button> : null}
      </div>
      {error ? <ErrorNote message={error} onRetry={() => void reload()} /> : isLoading && !data ? <p className="auth-hint">{t("Loading...")}</p> : !data || data.items.length === 0 ? (
        <PageState icon={Bell} title={t("Nothing new")} message={t("You'll see invitations, request decisions and shared documents here.")} />
      ) : (
        <article className="workspace-panel">
          <ul className="org-list notif-list">
            {data.items.map((n) => (
              <li key={n.id} className={n.readAt ? "" : "unread"}>
                <span>
                  <strong>{n.title}</strong>
                  <span className="meta"> {n.message}</span>
                  {n.documentId ? <> <Link to={`/app/documents/${n.documentId}`}>{t("Open document")}</Link></> : null}
                </span>
                <span className="org-row-actions">
                  <span className="meta">{formatRelativeTime(n.createdAt)}</span>
                  {!n.readAt ? <button className="icon-button" aria-label={t("Mark as read")} onClick={() => void act(() => markNotificationReadRequest(token!, n.id))}><Check /></button> : null}
                  <button className="icon-button" aria-label={t("Delete notification")} onClick={() => void act(() => deleteNotificationRequest(token!, n.id))}><Trash2 /></button>
                </span>
              </li>
            ))}
          </ul>
        </article>
      )}
    </section>
  );
}
