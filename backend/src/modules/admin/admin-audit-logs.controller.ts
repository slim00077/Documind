import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { Role } from "../../../generated/prisma/client";
import { AuditLogService } from "../audit-log/audit-log.service";
import { QueryAuditLogsDto } from "./dto/query-audit-logs.dto";

@Controller("admin/audit-logs")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminAuditLogsController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  findAll(@Query() query: QueryAuditLogsDto) {
    return this.auditLogService.findMany({
      action: query.action,
      actorId: query.actorId,
      targetType: query.targetType,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      page: query.page,
      pageSize: query.pageSize,
    });
  }
}
