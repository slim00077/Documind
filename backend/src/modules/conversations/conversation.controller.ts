import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { ConversationService } from "./conversation.service";
import { CreateConversationDto } from "./dto/create-conversation.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { AuthTokenPayload } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequestLanguage, type AppLanguage } from "../../common/i18n/language";
import { translateMessage } from "../../common/i18n/translate";

@Controller("conversations")
@UseGuards(JwtAuthGuard)
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: CreateConversationDto,
    @RequestLanguage() language: AppLanguage,
  ) {
    return this.conversationService.create(user.userId, dto.documentId, language);
  }

  @Get()
  findAll(@CurrentUser() user: AuthTokenPayload) {
    return this.conversationService.findAll(user.userId);
  }

  @Get(":id")
  findOne(
    @CurrentUser() user: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.conversationService.findOne(user.userId, id);
  }

  @Delete(":id")
  remove(
    @CurrentUser() user: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.conversationService.remove(user.userId, id);
  }

  @Post(":id/messages")
  sendMessage(
    @CurrentUser() user: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: SendMessageDto,
    @RequestLanguage() language: AppLanguage,
  ) {
    return this.conversationService.sendMessage(user.userId, id, dto.content, language);
  }

  /**
   * Server-sent events over POST: "delta" events carry text as it is
   * generated, "done" carries the saved message, "error" a safe message.
   * Closing the connection cancels the in-flight provider request.
   */
  @Post(":id/messages/stream")
  async streamMessage(
    @CurrentUser() user: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: SendMessageDto,
    @Res() res: Response,
    @RequestLanguage() language: AppLanguage,
  ) {
    const abort = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) abort.abort();
    });

    let started = false;
    const send = (event: string, data: unknown) => {
      if (!started) {
        started = true;
        res.status(200).set({
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
        res.flushHeaders();
      }
      res.write(`event: ${event}
data: ${JSON.stringify(data)}

`);
    };

    try {
      for await (const event of this.conversationService.streamMessage(
        user.userId,
        id,
        dto.content,
        abort.signal,
        language,
      )) {
        send(event.type, event);
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        const status = error instanceof HttpException ? error.getStatus() : 500;
        // @Res() bypasses the global exception filter, so the message is localized here.
        const message = translateMessage(
          error instanceof HttpException ? error.message : "Something went wrong. Please try again.",
          language,
        );
        if (started) {
          send("error", { message, statusCode: status });
        } else {
          res.status(status).json({ statusCode: status, message });
          return;
        }
      }
    }

    if (!res.writableEnded) res.end();
  }
}
