import { Module } from "@nestjs/common";
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
import { AdminModule } from "./modules/admin/admin.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
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
  ],
})
export class AppModule {}
