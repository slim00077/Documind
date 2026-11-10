import { API_URL } from "../config/api";
import type { NotificationsResponse } from "../types/notification";
import i18n from "../i18n";

const NOTIFICATIONS_API_URL = `${API_URL}/api/notifications`;

const request = async <T>(
  path: string,
  method: "GET" | "POST" | "DELETE",
  token: string
): Promise<T> => {
  const response = await fetch(`${NOTIFICATIONS_API_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(i18n.t("Notification request failed"));
  }

  return (await response.json().catch(() => ({}))) as T;
};

export const listNotificationsRequest = (token: string): Promise<NotificationsResponse> =>
  request<NotificationsResponse>("", "GET", token);

export const markNotificationReadRequest = (token: string, id: number): Promise<{ id: number }> =>
  request<{ id: number }>(`/${id}/read`, "POST", token);

export const markAllNotificationsReadRequest = (token: string): Promise<{ updated: number }> =>
  request<{ updated: number }>("/read-all", "POST", token);

export const deleteNotificationRequest = (token: string, id: number): Promise<{ id: number }> =>
  request<{ id: number }>(`/${id}`, "DELETE", token);
