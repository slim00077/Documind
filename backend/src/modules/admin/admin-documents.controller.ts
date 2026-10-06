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
import type { AuthTokenPayload } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Role } from "../../../generated/prisma/client";
import { AdminDocumentsService } from "./admin-documents.service";
import { QueryAdminDocumentsDto } from "./dto/query-admin-documents.dto";
import { AdminUpdateDocumentDto } from "./dto/admin-update-document.dto";
import { AdminGrantAccessDto } from "./dto/admin-grant-access.dto";
import { UpdatePermissionDto } from "./dto/update-permission.dto";

@Controller("admin/documents")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminDocumentsController {
  constructor(private readonly documentsService: AdminDocumentsService) {}

  @Get()
  findAll(@Query() query: QueryAdminDocumentsDto) {
    return this.documentsService.findAll(query);
  }

  @Get(":id")
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.documentsService.findOne(id);
  }

  @Patch(":id")
  update(
    @CurrentUser() admin: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: AdminUpdateDocumentDto,
  ) {
    return this.documentsService.update(admin.userId, id, dto);
  }

  @Delete(":id")
  trash(
    @CurrentUser() admin: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.documentsService.trash(admin.userId, id);
  }

  @Post(":id/restore")
  restore(
    @CurrentUser() admin: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.documentsService.restore(admin.userId, id);
  }

  @Post(":id/access")
  grantAccess(
    @CurrentUser() admin: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: AdminGrantAccessDto,
  ) {
    return this.documentsService.grantAccess(admin.userId, id, dto);
  }

  @Patch(":id/access/:permissionId")
  updateAccess(
    @CurrentUser() admin: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
    @Param("permissionId", ParseIntPipe) permissionId: number,
    @Body() dto: UpdatePermissionDto,
  ) {
    return this.documentsService.updateAccess(admin.userId, id, permissionId, dto);
  }

  @Delete(":id/access/:permissionId")
  revokeAccess(
    @CurrentUser() admin: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
    @Param("permissionId", ParseIntPipe) permissionId: number,
  ) {
    return this.documentsService.revokeAccess(admin.userId, id, permissionId);
  }
}
