export type AppNotification = {
  id: number;
  type: string;
  title: string;
  message: string;
  documentId: number | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationsResponse = {
  items: AppNotification[];
  unreadCount: number;
};
