import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { Role } from "../../../generated/prisma/client";
import { AdminAiMonitoringService } from "./admin-ai-monitoring.service";

@Controller("admin/ai-monitoring")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminAiMonitoringController {
  constructor(private readonly monitoring: AdminAiMonitoringService) {}

  @Get()
  getSnapshot() {
    return this.monitoring.getSnapshot();
  }
}
