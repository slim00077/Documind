import { Injectable } from "@nestjs/common";
import type { AuditAction } from "../../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { NotificationsService, type NotificationType } from "../notifications/notifications.service";

export type Actor = { userId: number; ipAddress?: string | null };

/** One place for the audit + notification side effects of organization actions. */
@Injectable()
export class OrgEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly notifications: NotificationsService,
  ) {}

  async record(
    actor: Actor,
    action: AuditAction,
    organizationId: number,
    target: { type: string; id?: number; metadata?: Record<string, unknown> },
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { name: true, email: true },
    });
    await this.audit.log({
      actorId: actor.userId,
      actorName: user?.name ?? null,
      actorEmail: user?.email ?? null,
      action,
      targetType: target.type,
      targetId: target.id,
      metadata: target.metadata,
      ipAddress: actor.ipAddress ?? null,
      organizationId,
    });
  }

  notify(userId: number, type: NotificationType, title: string, message: string, documentId?: number) {
    return this.notifications.notify({ userId, type, title, message, documentId });
  }

  /** Notifies every given user except the person who caused the event. */
  async notifyMany(userIds: number[], exceptUserId: number, type: NotificationType, title: string, message: string) {
    const unique = [...new Set(userIds)].filter((id) => id !== exceptUserId);
    await Promise.all(unique.map((id) => this.notify(id, type, title, message)));
  }

  /** Active administrators of an organization. */
  async adminIds(organizationId: number): Promise<number[]> {
    const rows = await this.prisma.organizationMembership.findMany({
      where: { organizationId, role: "ADMIN", status: "ACTIVE" },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }
}
