import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DocumentsModule } from "../documents/documents.module";
import { LlmModule } from "../llm/llm.module";
import { AssistantModule } from "../assistant/assistant.module";
import { AgentController } from "./agent.controller";
import { AgentService } from "./agent.service";

@Module({
  imports: [AuthModule, DocumentsModule, LlmModule, AssistantModule],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
