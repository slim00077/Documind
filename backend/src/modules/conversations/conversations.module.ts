import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AssistantModule } from "../assistant/assistant.module";
import { ConversationController } from "./conversation.controller";
import { ConversationService } from "./conversation.service";

@Module({
  imports: [AuthModule, AssistantModule],
  controllers: [ConversationController],
  providers: [ConversationService],
})
export class ConversationsModule {}
