import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import {
  deleteNotificationRequest,
  listNotificationsRequest,
  markAllNotificationsReadRequest,
  markNotificationReadRequest,
} from "../../services/notifications.api";
import type { AppNotification } from "../../types/notification";
import { formatRelativeTime } from "../../utils/formatRelativeTime";

const POLL_INTERVAL_MS = 30_000;

export default function NotificationBell() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const result = await listNotificationsRequest(token);
      setItems(result.items);
      setUnreadCount(result.unreadCount);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [token]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [isOpen]);

  const toggle = () => {
    setIsOpen((previous) => !previous);
    if (!isOpen) void load();
  };

  const onOpenItem = async (item: AppNotification) => {
    if (!token) return;
    if (!item.readAt) {
      setItems((previous) =>
        previous.map((entry) => (entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry))
      );
      setUnreadCount((previous) => Math.max(previous - 1, 0));
      void markNotificationReadRequest(token, item.id).catch(() => undefined);
    }
    if (item.documentId) {
      setIsOpen(false);
      navigate(`/app/documents/${item.documentId}`);
    }
  };

  const onMarkAll = async () => {
    if (!token) return;
    setItems((previous) => previous.map((entry) => ({ ...entry, readAt: entry.readAt ?? new Date().toISOString() })));
    setUnreadCount(0);
    void markAllNotificationsReadRequest(token).catch(() => undefined);
  };

  const onDismiss = (item: AppNotification) => {
    if (!token) return;
    setItems((previous) => previous.filter((entry) => entry.id !== item.id));
    if (!item.readAt) setUnreadCount((previous) => Math.max(previous - 1, 0));
    void deleteNotificationRequest(token, item.id).catch(() => undefined);
  };

  return (
    <div className="notification-bell" ref={containerRef}>
      <button
        className="icon-button notification-bell-button"
        type="button"
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
        aria-expanded={isOpen}
        onClick={toggle}
      >
        <Bell />
        {unreadCount > 0 ? (
          <span className="notification-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="notification-panel" role="dialog" aria-label="Notifications">
          <div className="notification-panel-header">
            <strong>Notifications</strong>
            <button
              className="text-link notification-mark-all"
              type="button"
              disabled={unreadCount === 0}
              onClick={onMarkAll}
            >
              <CheckCheck /> Mark all read
            </button>
          </div>

          {loadFailed && items.length === 0 ? (
            <p className="notification-empty">Couldn&apos;t load notifications right now.</p>
          ) : items.length === 0 ? (
            <p className="notification-empty">You&apos;re all caught up.</p>
          ) : (
            <ul className="notification-list">
              {items.map((item) => (
                <li key={item.id} className={`notification-item ${item.readAt ? "" : "is-unread"}`}>
                  <button className="notification-item-main" type="button" onClick={() => void onOpenItem(item)}>
                    <strong>{item.title}</strong>
                    <span>{item.message}</span>
                    <small>{formatRelativeTime(item.createdAt)}</small>
                  </button>
                  <button
                    className="icon-button notification-dismiss"
                    type="button"
                    aria-label="Dismiss notification"
                    onClick={() => onDismiss(item)}
                  >
                    <X />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
