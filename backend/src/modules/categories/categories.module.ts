import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { CategoriesController } from "./categories.controller";
import { CategoriesService } from "./categories.service";

@Module({
  imports: [AuthModule, AuditLogModule],
  controllers: [CategoriesController],
  providers: [CategoriesService],
})
export class CategoriesModule {}
