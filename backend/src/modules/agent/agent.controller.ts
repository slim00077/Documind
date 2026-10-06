import { Body, Controller, HttpException, Post, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { AgentService } from "./agent.service";
import { AnalyzeDocumentsDto } from "./dto/analyze-documents.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { AuthTokenPayload } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("agent")
@UseGuards(JwtAuthGuard)
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  /**
   * Server-sent events: "step" (a tool the agent ran), "delta" (report text),
   * "done" (final report + sources), "error". Closing cancels the run.
   */
  @Post("analyze")
  async analyze(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: AnalyzeDocumentsDto,
    @Res() res: Response,
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
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      for await (const event of this.agentService.analyze(
        user.userId,
        dto.task,
        dto.documentIds,
        abort.signal,
        dto.conversationId,
      )) {
        send(event.type, event);
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        const status = error instanceof HttpException ? error.getStatus() : 500;
        const message =
          error instanceof HttpException ? error.message : "Something went wrong. Please try again.";
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
