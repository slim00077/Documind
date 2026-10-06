import { Injectable } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditAction } from "../../../generated/prisma/client";

export type LogAuditEventInput = {
  actorId?: number | null;
  actorName?: string | null;
  actorEmail?: string | null;
  action: AuditAction;
  targetType?: string;
  targetId?: number;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
};

type FindAuditLogsFilters = {
  action?: AuditAction;
  actorId?: number;
  targetType?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
};

export function extractIp(request: Request): string | null {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return request.socket?.remoteAddress ?? null;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: LogAuditEventInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        actorName: input.actorName ?? null,
        actorEmail: input.actorEmail ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.metadata as never,
        ipAddress: input.ipAddress ?? null,
      },
    });
  }

  async findMany(filters: FindAuditLogsFilters) {
    const page = Math.max(filters.page ?? 1, 1);
    const pageSize = Math.min(Math.max(filters.pageSize ?? 25, 1), 100);

    const where = {
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.actorId ? { actorId: filters.actorId } : {}),
      ...(filters.targetType ? { targetType: filters.targetType } : {}),
      ...(filters.from || filters.to
        ? {
            createdAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          actor: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      }),
    ]);

    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
    };
  }
}
