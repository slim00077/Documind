import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DocumentsModule } from "../documents/documents.module";
import { LlmModule } from "../llm/llm.module";
import { AssistantController } from "./assistant.controller";
import { AssistantService } from "./assistant.service";

@Module({
  imports: [AuthModule, DocumentsModule, LlmModule],
  controllers: [AssistantController],
  providers: [AssistantService],
  exports: [AssistantService],
})
export class AssistantModule {}
