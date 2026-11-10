import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { DEFAULT_LANGUAGE, type AppLanguage } from "../../common/i18n/language";
import { translateMessage } from "../../common/i18n/translate";

export type NotificationType =
  | "DOCUMENT_SHARED"
  | "PERMISSION_CHANGED"
  | "PERMISSION_REVOKED"
  | "PROCESSING_COMPLETED"
  | "PROCESSING_FAILED"
  | "DOCUMENT_TRASHED"
  | "DOCUMENT_RESTORED"
  | "ORG_INVITATION"
  | "ORG_MEMBERSHIP_CHANGED"
  | "ORG_JOIN_REQUEST"
  | "ORG_JOIN_REVIEWED"
  | "GROUP_INVITATION"
  | "GROUP_JOIN_REQUEST"
  | "GROUP_REQUEST_REVIEWED"
  | "GROUP_STUDENT_ADDED"
  | "GROUP_STUDENT_REMOVED"
  | "GROUP_TEACHER_ASSIGNED";

export type CreateNotificationInput = {
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  documentId?: number | null;
};

const LIST_LIMIT = 30;
// An identical unread notification inside this window is not repeated.
const DEDUPE_WINDOW_MS = 10 * 60 * 1000;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Best-effort: a notification failing to save must never break the action
   * (upload, share, ...) that triggered it.
   */
  async notify(input: CreateNotificationInput): Promise<void> {
    try {
      const duplicate = await this.prisma.notification.findFirst({
        where: {
          userId: input.userId,
          type: input.type,
          title: input.title,
          message: input.message,
          documentId: input.documentId ?? null,
          readAt: null,
          createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
        },
        select: { id: true },
      });
      if (duplicate) return;

      await this.prisma.notification.create({
        data: {
          userId: input.userId,
          type: input.type,
          title: input.title,
          message: input.message,
          documentId: input.documentId ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create ${input.type} notification for user ${input.userId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Titles and messages are stored in English and translated for the reader (names stay as written). */
  async list(userId: number, language: AppLanguage = DEFAULT_LANGUAGE) {
    const [rows, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: LIST_LIMIT,
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    const items = rows.map((row) => ({
      ...row,
      title: translateMessage(row.title, language),
      message: translateMessage(row.message, language),
    }));
    return { items, unreadCount };
  }

  async markRead(userId: number, id: number) {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { id };
  }

  async markAllRead(userId: number) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async remove(userId: number, id: number) {
    await this.prisma.notification.deleteMany({ where: { id, userId } });
    return { id };
  }
}
