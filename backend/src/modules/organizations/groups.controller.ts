import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard, type AuthTokenPayload } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { extractIp } from "../audit-log/audit-log.service";
import { GroupsService } from "./groups.service";
import {
  AddStudentDto,
  AssignTeacherDto,
  GroupJoinByCodeDto,
  GroupJoinRequestDto,
  RequestQueryDto,
  ShareDocumentDto,
  UpdateGroupDto,
} from "./organizations.dto";

const actorOf = (user: AuthTokenPayload, req: Request) => ({ userId: user.userId, ipAddress: extractIp(req) });

/** Group-scoped API; every handler re-derives the caller's authority over the group from the database. */
@Controller("groups")
@UseGuards(JwtAuthGuard)
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  // static routes first
  @Post("join") joinByCode(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Body() dto: GroupJoinByCodeDto) { return this.groups.requestJoinByCode(actorOf(u, r), dto.code, dto.message); }
  @Get("requests/mine") myRequests(@CurrentUser() u: AuthTokenPayload, @Query("organizationId") orgId?: string) { return this.groups.myRequests(u.userId, orgId ? Number(orgId) : undefined); }
  @Delete("requests/:requestId") cancel(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("requestId", ParseIntPipe) id: number) { return this.groups.cancelRequest(actorOf(u, r), id); }

  @Get(":id") get(@CurrentUser() u: AuthTokenPayload, @Param("id", ParseIntPipe) id: number) { return this.groups.get(u.userId, id); }
  @Patch(":id") update(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("id", ParseIntPipe) id: number, @Body() dto: UpdateGroupDto) { return this.groups.update(actorOf(u, r), id, dto); }
  @Post(":id/archive") archive(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("id", ParseIntPipe) id: number) { return this.groups.setArchived(actorOf(u, r), id, true); }
  @Post(":id/unarchive") unarchive(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("id", ParseIntPipe) id: number) { return this.groups.setArchived(actorOf(u, r), id, false); }
  @Post(":id/join-code") rotate(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("id", ParseIntPipe) id: number) { return this.groups.rotateCode(actorOf(u, r), id); }
  @Post(":id/leave") leave(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("id", ParseIntPipe) id: number) { return this.groups.leaveGroup(actorOf(u, r), id); }

  @Post(":id/teachers") assign(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("id", ParseIntPipe) id: number, @Body() dto: AssignTeacherDto) { return this.groups.assignTeacher(actorOf(u, r), id, dto); }
  @Delete(":id/teachers/:teacherId") unassign(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("id", ParseIntPipe) id: number, @Param("teacherId", ParseIntPipe) teacherId: number) { return this.groups.removeTeacher(actorOf(u, r), id, teacherId); }

  @Post(":id/students") addStudent(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("id", ParseIntPipe) id: number, @Body() dto: AddStudentDto) { return this.groups.addStudent(actorOf(u, r), id, dto.studentId); }
  @Delete(":id/students/:studentId") removeStudent(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("id", ParseIntPipe) id: number, @Param("studentId", ParseIntPipe) studentId: number) { return this.groups.removeStudent(actorOf(u, r), id, studentId); }

  @Post(":id/requests") requestJoin(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("id", ParseIntPipe) id: number, @Body() dto: GroupJoinRequestDto) { return this.groups.requestJoinById(actorOf(u, r), id, dto.message); }
  @Get(":id/requests") requests(@CurrentUser() u: AuthTokenPayload, @Param("id", ParseIntPipe) id: number, @Query() q: RequestQueryDto) { return this.groups.listRequests(u.userId, id, q.status as never); }
  @Post(":id/requests/:requestId/approve") approve(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("id", ParseIntPipe) id: number, @Param("requestId", ParseIntPipe) rid: number) { return this.groups.reviewRequest(actorOf(u, r), id, rid, true); }
  @Post(":id/requests/:requestId/reject") reject(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("id", ParseIntPipe) id: number, @Param("requestId", ParseIntPipe) rid: number) { return this.groups.reviewRequest(actorOf(u, r), id, rid, false); }

  @Get(":id/documents") documents(@CurrentUser() u: AuthTokenPayload, @Param("id", ParseIntPipe) id: number) { return this.groups.listDocuments(u.userId, id); }
  @Post(":id/documents") share(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("id", ParseIntPipe) id: number, @Body() dto: ShareDocumentDto) { return this.groups.shareDocument(actorOf(u, r), id, dto.documentId); }
  @Delete(":id/documents/:documentId") unshare(@CurrentUser() u: AuthTokenPayload, @Req() r: Request, @Param("id", ParseIntPipe) id: number, @Param("documentId", ParseIntPipe) documentId: number) { return this.groups.unshareDocument(actorOf(u, r), id, documentId); }
}
