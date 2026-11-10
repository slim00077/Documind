import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
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
import { StorageModule } from "./modules/storage/storage.module";
import { I18nExceptionFilter } from "./common/i18n/i18n-exception.filter";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    StorageModule,
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
  // Error messages follow the caller's Accept-Language (English by default).
  providers: [{ provide: APP_FILTER, useClass: I18nExceptionFilter }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Every request runs inside a workspace context that JwtAuthGuard fills in after verification.
    consumer
      .apply((_req: Request, _res: Response, next: NextFunction) => runWithWorkspace(next))
      .forRoutes("*");
  }
}
