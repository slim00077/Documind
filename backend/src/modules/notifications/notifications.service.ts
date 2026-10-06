import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export type NotificationType =
  | "DOCUMENT_SHARED"
  | "PERMISSION_CHANGED"
  | "PERMISSION_REVOKED"
  | "PROCESSING_COMPLETED"
  | "PROCESSING_FAILED"
  | "DOCUMENT_TRASHED"
  | "DOCUMENT_RESTORED";

export type CreateNotificationInput = {
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  documentId?: number | null;
};

const LIST_LIMIT = 30;

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

  async list(userId: number) {
    const [items, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: LIST_LIMIT,
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

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
