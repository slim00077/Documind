import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { runWithWorkspace } from "./modules/access/workspace-context";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { DocumentsModule } from "./modules/documents/documents.module";
import { LlmModule } from "./modules/llm/llm.module";
import { AssistantModule } from "./modules/assistant/assistant.module";
import { ConversationsModule } from "./modules/conversations/conversations.module";
import { AgentModule } from "./modules/agent/agent.module";
import { CategoriesModule } from "./modules/categories/categories.module";
import { AuditLogModule } from "./modules/audit-log/audit-log.module";
import { AccessModule } from "./modules/access/access.module";
import { AdminModule } from "./modules/admin/admin.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { OrganizationsModule } from "./modules/organizations/organizations.module";
import { HealthModule } from "./modules/health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AccessModule,
    AuthModule,
    DocumentsModule,
    LlmModule,
    AssistantModule,
    ConversationsModule,
    AgentModule,
    CategoriesModule,
    AuditLogModule,
    AdminModule,
    NotificationsModule,
    OrganizationsModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Every request runs inside a workspace context that JwtAuthGuard fills in after verification.
    consumer
      .apply((_req: Request, _res: Response, next: NextFunction) => runWithWorkspace(next))
      .forRoutes("*");
  }
}
