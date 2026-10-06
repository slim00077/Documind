import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { UpdatePreferencesDto } from "./dto/update-preferences.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import type { AuthTokenPayload } from "./guards/jwt-auth.guard";
import { CurrentUser } from "./decorators/current-user.decorator";
import { extractIp } from "../audit-log/audit-log.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, extractIp(req));
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, extractIp(req));
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async me(@CurrentUser() currentUser: AuthTokenPayload) {
    const user = await this.authService.getCurrentUser(currentUser.userId);
    return { user };
  }

  @Patch("me")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @CurrentUser() currentUser: AuthTokenPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    const user = await this.authService.updateProfile(currentUser.userId, dto);
    return { user };
  }

  @Patch("me/password")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() currentUser: AuthTokenPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.authService.changePassword(currentUser.userId, dto);
    return { message: "Password updated successfully" };
  }

  @Patch("me/preferences")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async updatePreferences(
    @CurrentUser() currentUser: AuthTokenPayload,
    @Body() dto: UpdatePreferencesDto,
  ) {
    const user = await this.authService.updatePreferences(
      currentUser.userId,
      dto,
    );
    return { user };
  }
}
