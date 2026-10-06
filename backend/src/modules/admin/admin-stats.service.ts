import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { DocumentStatus, Role } from "../../../generated/prisma/client";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AdminStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS);

    const [
      totalUsers,
      activeUsers,
      adminCount,
      newUsersThisWeek,
      totalDocuments,
      documentsByStatus,
      totalCategories,
      totalConversations,
      totalMessages,
      newDocumentsThisWeek,
      storageAgg,
      recentAuditLogs,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { role: Role.ADMIN } }),
      this.prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      this.prisma.document.count(),
      this.prisma.document.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      this.prisma.category.count(),
      this.prisma.conversation.count(),
      this.prisma.message.count(),
      this.prisma.document.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      this.prisma.document.aggregate({ _sum: { size: true } }),
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { actor: { select: { id: true, name: true, email: true } } },
      }),
    ]);

    const statusCounts = Object.fromEntries(
      Object.values(DocumentStatus).map((status) => [status, 0]),
    ) as Record<DocumentStatus, number>;

    for (const row of documentsByStatus) {
      statusCounts[row.status] = row._count._all;
    }

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        disabled: totalUsers - activeUsers,
        admins: adminCount,
        newThisWeek: newUsersThisWeek,
      },
      documents: {
        total: totalDocuments,
        byStatus: statusCounts,
        newThisWeek: newDocumentsThisWeek,
        totalStorageBytes: storageAgg._sum.size ?? 0,
      },
      categories: { total: totalCategories },
      assistant: {
        conversations: totalConversations,
        messages: totalMessages,
      },
      recentActivity: recentAuditLogs,
    };
  }
}
