import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { AuthTokenPayload } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthTokenPayload) {
    return this.notifications.list(user.userId);
  }

  @Post("read-all")
  markAllRead(@CurrentUser() user: AuthTokenPayload) {
    return this.notifications.markAllRead(user.userId);
  }

  @Post(":id/read")
  markRead(
    @CurrentUser() user: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.notifications.markRead(user.userId, id);
  }

  @Delete(":id")
  remove(
    @CurrentUser() user: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.notifications.remove(user.userId, id);
  }
}
