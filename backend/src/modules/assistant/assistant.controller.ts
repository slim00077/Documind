import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { AssistantService } from "./assistant.service";
import { AskQuestionDto } from "./dto/ask-question.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { AuthTokenPayload } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("assistant")
@UseGuards(JwtAuthGuard)
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Post("ask")
  ask(@CurrentUser() user: AuthTokenPayload, @Body() dto: AskQuestionDto) {
    return this.assistantService.ask(user.userId, dto.question);
  }
}
