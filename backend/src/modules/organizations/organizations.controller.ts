import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, unlink } from "node:fs";
import { extname, join } from "node:path";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import type { Request, Response } from "express";
import { JwtAuthGuard, type AuthTokenPayload } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Role } from "../../../generated/prisma/client";
import { extractIp } from "../audit-log/audit-log.service";
import { OrganizationsService } from "./organizations.service";
import { InvitationsService } from "./invitations.service";
import { GroupsService } from "./groups.service";
import { FileStorageService, StoredFileNotFoundError } from "../storage/file-storage.service";
import { UPLOAD_STAGING_ROOT } from "../storage/storage.config";
import {
  AddMemberDto,
  AddOrgAdminDto,
  CreateGroupDto,
  CreateInvitationDto,
  CreateOrganizationDto,
  GroupQueryDto,
  JoinByCodeDto,
  MemberQueryDto,
  OrgJoinRequestDto,
  PageQueryDto,
  RequestQueryDto,
  SetOrganizationStatusDto,
  ShareDocumentDto,
  UpdateMemberDto,
  UpdateOrganizationDto,
} from "./organizations.dto";

const LOGO_DIR = join(UPLOAD_STAGING_ROOT, "org-logos");
if (!existsSync(LOGO_DIR)) mkdirSync(LOGO_DIR, { recursive: true });
const LOGO_TYPES: Record<string, string[]> = { "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"], "image/webp": [".webp"] };

const logoInterceptor = FileInterceptor("logo", {
  storage: diskStorage({ destination: LOGO_DIR, filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`) }),
  limits: { fileSize: 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = LOGO_TYPES[file.mimetype]?.includes(extname(file.originalname).toLowerCase());
    cb(ok ? null : new BadRequestException("Logo must be a PNG, JPG or WebP image under 1 MB"), Boolean(ok));
  },
});

type Actor = { userId: number; ipAddress: string | null };
const actorOf = (user: AuthTokenPayload, req: Request): Actor => ({ userId: user.userId, ipAddress: extractIp(req) });

/**
 * Organization-scoped API. The organization id in the URL is never trusted: every handler resolves
 * it through the caller's own active membership (OrgAccessService) before touching data.
 */
@Controller("organizations")
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(
    private readonly orgs: OrganizationsService,
    private readonly invitations: InvitationsService,
    private readonly groups: GroupsService,
    private readonly storage: FileStorageService,
  ) {}

  // --- the caller's own context (declared before :orgId routes) -----------
  @Get("mine") mine(@CurrentUser() u: AuthTokenPayload) { return this.orgs.listMine(u.userId); }
  @Get("discover") discover(@CurrentUser() u: AuthTokenPayload, @Query("search") search?: string) { return this.orgs.discover(u.userId, search); }
  @Post("lookup") lookup(@Body() dto: JoinByCodeDto) { return this.orgs.lookupByCode(dto.code); }
  @Post("join-requests") requestJoin(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Body() dto: OrgJoinRequestDto) { return this.orgs.requestJoin(actorOf(u, r), dto); }
  @Get("join-requests/mine") myRequests(@CurrentUser() u: AuthTokenPayload) { return this.orgs.myJoinRequests(u.userId); }
  @Delete("join-requests/:id") cancelRequest(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("id", ParseIntPipe) id: number) { return this.orgs.cancelJoinRequest(actorOf(u, r), id); }

  // --- organization profile ------------------------------------------------
  @Get(":orgId") get(@CurrentUser() u: AuthTokenPayload, @Param("orgId", ParseIntPipe) orgId: number) { return this.orgs.get(u.userId, orgId); }
  @Patch(":orgId") update(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("orgId", ParseIntPipe) orgId: number, @Body() dto: UpdateOrganizationDto) { return this.orgs.update(actorOf(u, r), orgId, dto); }
  @Post(":orgId/join-code") rotateCode(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("orgId", ParseIntPipe) orgId: number) { return this.orgs.rotateJoinCode(actorOf(u, r), orgId); }
  @Post(":orgId/leave") leave(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("orgId", ParseIntPipe) orgId: number) { return this.orgs.leave(actorOf(u, r), orgId); }
  @Get(":orgId/stats") stats(@CurrentUser() u: AuthTokenPayload, @Param("orgId", ParseIntPipe) orgId: number) { return this.orgs.stats(u.userId, orgId); }
  @Get(":orgId/audit-logs") audit(@CurrentUser() u: AuthTokenPayload, @Param("orgId", ParseIntPipe) orgId: number, @Query() q: PageQueryDto) { return this.orgs.auditLogs(u.userId, orgId, q); }

  @Post(":orgId/logo")
  @UseInterceptors(logoInterceptor)
  async uploadLogo(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("orgId", ParseIntPipe) orgId: number, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("A logo image is required");
    const key = `org-logos/${file.filename}`;
    try {
      // The permission check (ORG ADMIN) runs inside setLogo; the file is only kept if it passes.
      await this.orgs.requireAdmin(u.userId, orgId);
      await this.storage.put(key, file.path, file.mimetype);
      const { previous } = await this.orgs.setLogo(actorOf(u, r), orgId, file.filename);
      if (previous) await this.storage.remove(`org-logos/${previous}`);
      return { hasLogo: true };
    } catch (error) {
      unlink(file.path, () => undefined);
      await this.storage.remove(key);
      throw error;
    }
  }

  @Get(":orgId/logo")
  async logo(@CurrentUser() u: AuthTokenPayload, @Param("orgId", ParseIntPipe) orgId: number, @Res() res: Response) {
    const file = (await this.orgs.getLogoPath(u.userId, orgId)).replace(/[^\w.-]/g, "");
    let buffer: Buffer;
    try {
      buffer = await this.storage.read(`org-logos/${file}`);
    } catch (error) {
      if (error instanceof StoredFileNotFoundError) throw new NotFoundException("No logo");
      throw error;
    }
    res.type(extname(file));
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(buffer);
  }

  // --- members ---------------------------------------------------------------
  @Get(":orgId/members") members(@CurrentUser() u: AuthTokenPayload, @Param("orgId", ParseIntPipe) orgId: number, @Query() q: MemberQueryDto) { return this.orgs.listMembers(u.userId, orgId, q); }
  @Post(":orgId/members") addMember(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("orgId", ParseIntPipe) orgId: number, @Body() dto: AddMemberDto) { return this.orgs.addMember(actorOf(u, r), orgId, dto); }
  @Patch(":orgId/members/:membershipId") updateMember(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("orgId", ParseIntPipe) orgId: number, @Param("membershipId", ParseIntPipe) mid: number, @Body() dto: UpdateMemberDto) { return this.orgs.updateMember(actorOf(u, r), orgId, mid, dto); }
  @Delete(":orgId/members/:membershipId") removeMember(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("orgId", ParseIntPipe) orgId: number, @Param("membershipId", ParseIntPipe) mid: number) { return this.orgs.updateMember(actorOf(u, r), orgId, mid, { status: "REMOVED" }); }

  // --- organization join requests (people asking to join) -------------------
  @Get(":orgId/join-requests") joinRequests(@CurrentUser() u: AuthTokenPayload, @Param("orgId", ParseIntPipe) orgId: number, @Query() q: RequestQueryDto) { return this.orgs.listJoinRequests(u.userId, orgId, q.status as never); }
  @Post(":orgId/join-requests/:id/approve") approveJoin(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("orgId", ParseIntPipe) orgId: number, @Param("id", ParseIntPipe) id: number) { return this.orgs.reviewJoinRequest(actorOf(u, r), orgId, id, true); }
  @Post(":orgId/join-requests/:id/reject") rejectJoin(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("orgId", ParseIntPipe) orgId: number, @Param("id", ParseIntPipe) id: number) { return this.orgs.reviewJoinRequest(actorOf(u, r), orgId, id, false); }

  // --- invitations ------------------------------------------------------------
  @Get(":orgId/invitations") listInvitations(@CurrentUser() u: AuthTokenPayload, @Param("orgId", ParseIntPipe) orgId: number, @Query("status") status?: string) { return this.invitations.list(u.userId, orgId, status); }
  @Post(":orgId/invitations") invite(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("orgId", ParseIntPipe) orgId: number, @Body() dto: CreateInvitationDto) { return this.invitations.create(actorOf(u, r), orgId, dto); }
  @Post(":orgId/invitations/:id/resend") resend(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("orgId", ParseIntPipe) orgId: number, @Param("id", ParseIntPipe) id: number) { return this.invitations.resend(actorOf(u, r), orgId, id); }
  @Delete(":orgId/invitations/:id") revokeInvitation(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("orgId", ParseIntPipe) orgId: number, @Param("id", ParseIntPipe) id: number) { return this.invitations.revoke(actorOf(u, r), orgId, id); }

  // --- groups & directories ------------------------------------------------------
  @Get(":orgId/groups") listGroups(@CurrentUser() u: AuthTokenPayload, @Param("orgId", ParseIntPipe) orgId: number, @Query() q: GroupQueryDto) { return this.groups.listForManager(u.userId, orgId, q); }
  @Post(":orgId/groups") createGroup(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("orgId", ParseIntPipe) orgId: number, @Body() dto: CreateGroupDto) { return this.groups.create(actorOf(u, r), orgId, dto); }
  @Get(":orgId/my-groups") myGroups(@CurrentUser() u: AuthTokenPayload, @Param("orgId", ParseIntPipe) orgId: number) { return this.groups.listMine(u.userId, orgId); }
  @Get(":orgId/groups-discover") discoverGroups(@CurrentUser() u: AuthTokenPayload, @Param("orgId", ParseIntPipe) orgId: number, @Query("search") search?: string) { return this.groups.discover(u.userId, orgId, search); }
  @Get(":orgId/students") students(@CurrentUser() u: AuthTokenPayload, @Param("orgId", ParseIntPipe) orgId: number, @Query() q: PageQueryDto & { groupId?: string }) { return this.groups.listStudents(u.userId, orgId, { ...q, groupId: q.groupId ? Number(q.groupId) : undefined }); }
  @Get(":orgId/requests") requestInbox(@CurrentUser() u: AuthTokenPayload, @Param("orgId", ParseIntPipe) orgId: number) { return this.groups.inbox(u.userId, orgId); }
  @Get(":orgId/overview/teacher") teacherOverview(@CurrentUser() u: AuthTokenPayload, @Param("orgId", ParseIntPipe) orgId: number) { return this.groups.teacherOverview(u.userId, orgId); }
  @Get(":orgId/overview/student") studentOverview(@CurrentUser() u: AuthTokenPayload, @Param("orgId", ParseIntPipe) orgId: number) { return this.groups.studentOverview(u.userId, orgId); }

  // --- organization-wide documents ----------------------------------------------------
  @Get(":orgId/documents") documents(@CurrentUser() u: AuthTokenPayload, @Param("orgId", ParseIntPipe) orgId: number) { return this.orgs.listDocuments(u.userId, orgId); }
  @Post(":orgId/documents") shareDoc(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("orgId", ParseIntPipe) orgId: number, @Body() dto: ShareDocumentDto) { return this.orgs.shareDocument(actorOf(u, r), orgId, dto.documentId); }
  @Delete(":orgId/documents/:documentId") unshareDoc(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("orgId", ParseIntPipe) orgId: number, @Param("documentId", ParseIntPipe) documentId: number) { return this.orgs.unshareDocument(actorOf(u, r), orgId, documentId); }
}

/** Public preview + authenticated acceptance of an invitation link. */
@Controller("invitations")
export class InvitationLinksController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get(":token") preview(@Param("token") token: string) { return this.invitations.preview(token); }

  @Post(":token/accept")
  @UseGuards(JwtAuthGuard)
  accept(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("token") token: string) { return this.invitations.accept(actorOf(u, r), token); }
}

/** Platform administration of organizations (global ADMIN only; grants no access to tenant content). */
@Controller("admin/organizations")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminOrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Get() list(@Query() q: PageQueryDto) { return this.orgs.platformList(q); }
  @Post() create(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Body() dto: CreateOrganizationDto) { return this.orgs.platformCreate(actorOf(u, r), dto); }
  @Patch(":orgId/status") setStatus(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("orgId", ParseIntPipe) orgId: number, @Body() dto: SetOrganizationStatusDto) { return this.orgs.platformSetStatus(actorOf(u, r), orgId, dto); }
  @Post(":orgId/admins") addAdmin(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("orgId", ParseIntPipe) orgId: number, @Body() dto: AddOrgAdminDto) {
    return this.orgs.platformAddAdmin(actorOf(u, r), orgId, dto.email);
  }
}
