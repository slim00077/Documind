import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { LlmModule } from "../llm/llm.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AdminStatsController } from "./admin-stats.controller";
import { AdminUsersController } from "./admin-users.controller";
import { AdminDocumentsController } from "./admin-documents.controller";
import { AdminAuditLogsController } from "./admin-audit-logs.controller";
import { AdminAiMonitoringController } from "./admin-ai-monitoring.controller";
import { AdminStatsService } from "./admin-stats.service";
import { AdminUsersService } from "./admin-users.service";
import { AdminDocumentsService } from "./admin-documents.service";
import { AdminAiMonitoringService } from "./admin-ai-monitoring.service";

@Module({
  imports: [AuthModule, AuditLogModule, LlmModule, NotificationsModule],
  controllers: [
    AdminStatsController,
    AdminUsersController,
    AdminDocumentsController,
    AdminAuditLogsController,
    AdminAiMonitoringController,
  ],
  providers: [
    AdminStatsService,
    AdminUsersService,
    AdminDocumentsService,
    AdminAiMonitoringService,
  ],
})
export class AdminModule {}
