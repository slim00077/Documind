import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { Role } from "../../../generated/prisma/client";
import { AdminStatsService } from "./admin-stats.service";

@Controller("admin/stats")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminStatsController {
  constructor(private readonly statsService: AdminStatsService) {}

  @Get()
  getOverview() {
    return this.statsService.getOverview();
  }
}
