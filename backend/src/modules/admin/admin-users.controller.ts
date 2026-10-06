import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthTokenPayload } from "../auth/guards/jwt-auth.guard";
import { Role } from "../../../generated/prisma/client";
import { AdminUsersService } from "./admin-users.service";
import { QueryUsersDto } from "./dto/query-users.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UpdateUserStatusDto } from "./dto/update-user-status.dto";
import { GrantPermissionDto } from "./dto/grant-permission.dto";
import { UpdatePermissionDto } from "./dto/update-permission.dto";

@Controller("admin/users")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminUsersController {
  constructor(private readonly usersService: AdminUsersService) {}

  @Get()
  findAll(@Query() query: QueryUsersDto) {
    return this.usersService.findAll(query);
  }

  @Get(":id")
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @Patch(":id")
  update(
    @CurrentUser() admin: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(admin.userId, id, dto);
  }

  @Patch(":id/status")
  setActive(
    @CurrentUser() admin: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.usersService.setActive(admin.userId, id, dto.isActive);
  }

  @Delete(":id")
  remove(
    @CurrentUser() admin: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.usersService.remove(admin.userId, id);
  }

  @Get(":id/permissions")
  listPermissions(@Param("id", ParseIntPipe) id: number) {
    return this.usersService.listPermissions(id);
  }

  @Post(":id/permissions")
  grantPermission(
    @CurrentUser() admin: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: GrantPermissionDto,
  ) {
    return this.usersService.grantPermission(admin.userId, id, dto);
  }

  @Patch(":id/permissions/:permissionId")
  updatePermission(
    @CurrentUser() admin: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
    @Param("permissionId", ParseIntPipe) permissionId: number,
    @Body() dto: UpdatePermissionDto,
  ) {
    return this.usersService.updatePermission(admin.userId, id, permissionId, dto);
  }

  @Delete(":id/permissions/:permissionId")
  revokePermission(
    @CurrentUser() admin: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
    @Param("permissionId", ParseIntPipe) permissionId: number,
  ) {
    return this.usersService.revokePermission(admin.userId, id, permissionId);
  }
}
