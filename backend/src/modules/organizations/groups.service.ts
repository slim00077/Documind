import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { OrgAccessService, type GroupContext } from "../access/org-access.service";
import { OrgEventsService, type Actor } from "./org-events.service";
import { generateCode, isUniqueViolation, normalizeCode, pageParams } from "./org-utils";
import type {
  AssignTeacherDto,
  CreateGroupDto,
  GroupQueryDto,
  UpdateGroupDto,
} from "./organizations.dto";

const USER_BRIEF = { id: true, name: true, email: true } as const;

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OrgAccessService,
    private readonly events: OrgEventsService,
  ) {}

  // ---------------------------------------------------------------- lifecycle

  /** Admins and teachers create groups inside their own organization. A teacher becomes the lead. */
  async create(actor: Actor, organizationId: number, dto: CreateGroupDto) {
    const { role } = await this.access.requireOrg(actor.userId, organizationId, "ADMIN", "TEACHER");
    let leadId: number | null = role === "TEACHER" ? actor.userId : null;

    if (role === "ADMIN" && dto.leadTeacherId) {
      await this.assertAssignableTeacher(organizationId, dto.leadTeacherId);
      leadId = dto.leadTeacherId;
    }

    const group = await this.createWithUniqueCode({
      organizationId, name: dto.name.trim(), createdById: actor.userId,
      description: dto.description?.trim() || null, subject: dto.subject?.trim() || null, academicYear: dto.academicYear?.trim() || null,
    });
    if (leadId) {
      await this.prisma.groupTeacher.create({ data: { groupId: group.id, teacherId: leadId, role: "LEAD_TEACHER" } });
      if (leadId !== actor.userId) {
        await this.events.notify(leadId, "GROUP_TEACHER_ASSIGNED", "New group assigned", `You are the lead teacher of ${group.name}.`);
      }
    }
    await this.events.record(actor, "GROUP_CREATE", organizationId, { type: "Group", id: group.id, metadata: { groupId: group.id, name: group.name, leadId } });
    return this.toSummary(group);
  }

  /** Admins see every group; teachers the ones they are assigned to. */
  async listForManager(userId: number, organizationId: number, query: GroupQueryDto) {
    const { role } = await this.access.requireOrg(userId, organizationId, "ADMIN", "TEACHER");
    const { page, pageSize, skip, take } = pageParams(query.page, query.pageSize);
    const term = query.search?.trim();
    const where: Prisma.GroupWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(role === "TEACHER" ? { teachers: { some: { teacherId: userId } } } : {}),
      ...(term ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { subject: { contains: term, mode: "insensitive" } }] } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.group.count({ where }),
      this.prisma.group.findMany({
        where, skip, take, orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        include: {
          teachers: { include: { teacher: { select: { id: true, name: true } } } },
          _count: { select: { students: { where: { status: "ACTIVE" } }, joinRequests: { where: { status: "PENDING" } } } },
        },
      }),
    ]);
    return {
      items: rows.map((g) => ({
        ...this.toSummary(g),
        teachers: g.teachers.map((t) => ({ id: t.teacher.id, name: t.teacher.name, role: t.role })),
        studentCount: g._count.students, pendingRequests: g._count.joinRequests,
      })),
      page, pageSize, total, totalPages: Math.max(Math.ceil(total / pageSize), 1),
    };
  }

  /** Detail as seen by the caller: managers get the roster and code, students only what they may know. */
  async get(userId: number, groupId: number) {
    const ctx = await this.access.requireGroupMember(userId, groupId);
    const { group } = ctx;
    const teachers = await this.prisma.groupTeacher.findMany({
      where: { groupId },
      include: { teacher: { select: { id: true, name: true, email: true } } },
    });
    const base = {
      ...this.toSummary(group),
      myAccess: { canManage: ctx.canManage, canAdminister: ctx.canAdminister, teacherRole: ctx.teacherRole, isStudent: ctx.isStudent },
      teachers: teachers.map((t) => ({ id: t.teacher.id, name: t.teacher.name, role: t.role, ...(ctx.canManage ? { email: t.teacher.email } : {}) })),
    };
    if (!ctx.canManage) return base;

    const [students, pendingRequests] = await Promise.all([
      this.prisma.groupStudent.findMany({
        where: { groupId, status: "ACTIVE" }, orderBy: { joinedAt: "desc" },
        include: { student: { select: USER_BRIEF } },
      }),
      this.prisma.groupJoinRequest.count({ where: { groupId, status: "PENDING" } }),
    ]);
    return {
      ...base, joinCode: group.joinCode, pendingRequests,
      students: students.map((s) => ({ id: s.student.id, name: s.student.name, email: s.student.email, joinedAt: s.joinedAt })),
    };
  }

  async update(actor: Actor, groupId: number, dto: UpdateGroupDto) {
    const ctx = await this.access.requireGroupManager(actor.userId, groupId, { administer: true });
    this.access.assertGroupOpen(ctx.group);
    const group = await this.prisma.group.update({
      where: { id: groupId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
        ...(dto.subject !== undefined ? { subject: dto.subject.trim() || null } : {}),
        ...(dto.academicYear !== undefined ? { academicYear: dto.academicYear.trim() || null } : {}),
      },
    });
    await this.events.record(actor, "GROUP_UPDATE", group.organizationId, { type: "Group", id: group.id, metadata: { groupId: group.id, fields: Object.keys(dto) } });
    return this.toSummary(group);
  }

  /** Archived groups are read-only: members keep reading shared documents, nothing new can be added. */
  async setArchived(actor: Actor, groupId: number, archived: boolean) {
    const ctx = await this.access.requireGroupManager(actor.userId, groupId, { administer: true });
    const group = await this.prisma.group.update({ where: { id: groupId }, data: { status: archived ? "ARCHIVED" : "ACTIVE" } });
    if (archived) {
      // An archived group accepts nothing new, so waiting requests are closed.
      await this.prisma.groupJoinRequest.updateMany({ where: { groupId, status: "PENDING" }, data: { status: "CANCELLED" } });
    }
    await this.events.record(actor, "GROUP_ARCHIVE", ctx.group.organizationId, { type: "Group", id: groupId, metadata: { groupId, archived } });
    return this.toSummary(group);
  }

  async rotateCode(actor: Actor, groupId: number) {
    const ctx = await this.access.requireGroupManager(actor.userId, groupId, { administer: true });
    this.access.assertGroupOpen(ctx.group);
    const joinCode = await this.uniqueGroupCode();
    await this.prisma.group.update({ where: { id: groupId }, data: { joinCode } });
    await this.events.record(actor, "GROUP_CODE_ROTATE", ctx.group.organizationId, { type: "Group", id: groupId, metadata: { groupId } });
    return { joinCode };
  }

  // ----------------------------------------------------------------- teachers

  async assignTeacher(actor: Actor, groupId: number, dto: AssignTeacherDto) {
    const ctx = await this.access.requireGroupManager(actor.userId, groupId, { administer: true });
    this.access.assertGroupOpen(ctx.group);
    const role = dto.role ?? "CO_TEACHER";
    // Only an organization administrator hands out the lead role.
    if (role === "LEAD_TEACHER" && !ctx.isOrgAdmin) throw new ForbiddenException("Only an organization administrator can assign a lead teacher");
    await this.assertAssignableTeacher(ctx.group.organizationId, dto.teacherId);

    await this.prisma.groupTeacher.upsert({
      where: { groupId_teacherId: { groupId, teacherId: dto.teacherId } },
      create: { groupId, teacherId: dto.teacherId, role },
      update: { role },
    });
    await this.events.record(actor, "GROUP_TEACHER_ASSIGN", ctx.group.organizationId, { type: "User", id: dto.teacherId, metadata: { groupId, role } });
    await this.events.notify(dto.teacherId, "GROUP_TEACHER_ASSIGNED", "Group assignment", `You were assigned to ${ctx.group.name} as ${role === "LEAD_TEACHER" ? "lead teacher" : "co-teacher"}.`);
    return { groupId, teacherId: dto.teacherId, role };
  }

  async removeTeacher(actor: Actor, groupId: number, teacherId: number) {
    const ctx = await this.access.requireGroupManager(actor.userId, groupId, { administer: true });
    const link = await this.prisma.groupTeacher.findUnique({ where: { groupId_teacherId: { groupId, teacherId } } });
    if (!link) throw new NotFoundException("Teacher is not assigned to this group");
    if (link.role === "LEAD_TEACHER" && !ctx.isOrgAdmin) throw new ForbiddenException("Only an organization administrator can remove a lead teacher");
    await this.prisma.groupTeacher.delete({ where: { groupId_teacherId: { groupId, teacherId } } });
    await this.events.record(actor, "GROUP_TEACHER_REMOVE", ctx.group.organizationId, { type: "User", id: teacherId, metadata: { groupId } });
    await this.events.notify(teacherId, "GROUP_TEACHER_ASSIGNED", "Group assignment removed", `You are no longer assigned to ${ctx.group.name}.`);
    return { groupId, teacherId };
  }

  private async assertAssignableTeacher(organizationId: number, userId: number) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { organizationId, userId, status: "ACTIVE", role: { in: ["TEACHER", "ADMIN"] } },
      select: { id: true },
    });
    if (!membership) throw new BadRequestException("That person is not an active teacher of this organization");
  }

  // ----------------------------------------------------------------- students

  async addStudent(actor: Actor, groupId: number, studentId: number) {
    const ctx = await this.access.requireGroupManager(actor.userId, groupId);
    this.access.assertGroupOpen(ctx.group);
    // A student can only be added to groups of an organization they actively belong to as a student.
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { organizationId: ctx.group.organizationId, userId: studentId, status: "ACTIVE", role: "STUDENT" },
      select: { id: true },
    });
    if (!membership) throw new BadRequestException("That person is not a student of this organization");

    await this.prisma.$transaction(async (tx) => {
      await tx.groupStudent.upsert({
        where: { groupId_studentId: { groupId, studentId } },
        create: { groupId, studentId, addedById: actor.userId },
        update: { status: "ACTIVE", joinedAt: new Date(), addedById: actor.userId },
      });
      await tx.groupJoinRequest.updateMany({
        where: { groupId, studentId, status: "PENDING" },
        data: { status: "APPROVED", reviewedById: actor.userId, reviewedAt: new Date() },
      });
    });
    await this.events.record(actor, "GROUP_STUDENT_ADD", ctx.group.organizationId, { type: "User", id: studentId, metadata: { groupId } });
    await this.events.notify(studentId, "GROUP_STUDENT_ADDED", "Added to a group", `You were added to ${ctx.group.name}.`);
    return { groupId, studentId };
  }

  async removeStudent(actor: Actor, groupId: number, studentId: number) {
    const ctx = await this.access.requireGroupManager(actor.userId, groupId);
    const result = await this.prisma.groupStudent.updateMany({ where: { groupId, studentId, status: "ACTIVE" }, data: { status: "REMOVED" } });
    if (!result.count) throw new NotFoundException("Student is not in this group");
    await this.events.record(actor, "GROUP_STUDENT_REMOVE", ctx.group.organizationId, { type: "User", id: studentId, metadata: { groupId } });
    await this.events.notify(studentId, "GROUP_STUDENT_REMOVED", "Removed from a group", `You were removed from ${ctx.group.name}.`);
    return { groupId, studentId };
  }

  /** A student leaves a group on their own. */
  async leaveGroup(actor: Actor, groupId: number) {
    const ctx = await this.access.requireGroup(actor.userId, groupId);
    const result = await this.prisma.groupStudent.updateMany({ where: { groupId, studentId: actor.userId, status: "ACTIVE" }, data: { status: "LEFT" } });
    if (!result.count) throw new NotFoundException("You are not in this group");
    await this.events.record(actor, "GROUP_STUDENT_REMOVE", ctx.group.organizationId, { type: "User", id: actor.userId, metadata: { groupId, left: true } });
    return { groupId };
  }

  // --------------------------------------------------------- student: discover

  /** Groups of the caller's own organization they can ask to join (never other organizations'). */
  async discover(userId: number, organizationId: number, search?: string) {
    await this.access.requireOrg(userId, organizationId, "STUDENT");
    const term = search?.trim();
    const [groups, mine, pending] = await Promise.all([
      this.prisma.group.findMany({
        where: {
          organizationId, status: "ACTIVE",
          ...(term ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { subject: { contains: term, mode: "insensitive" } }] } : {}),
        },
        include: { teachers: { include: { teacher: { select: { id: true, name: true } } } }, _count: { select: { students: { where: { status: "ACTIVE" } } } } },
        orderBy: { name: "asc" }, take: 100,
      }),
      this.prisma.groupStudent.findMany({ where: { studentId: userId, status: "ACTIVE", group: { organizationId } }, select: { groupId: true } }),
      this.prisma.groupJoinRequest.findMany({ where: { studentId: userId, status: "PENDING", group: { organizationId } }, select: { groupId: true, id: true } }),
    ]);
    const joined = new Set(mine.map((m) => m.groupId));
    const pendingByGroup = new Map(pending.map((p) => [p.groupId, p.id]));
    return groups.map((g) => ({
      id: g.id, name: g.name, description: g.description, subject: g.subject, academicYear: g.academicYear,
      studentCount: g._count.students, teachers: g.teachers.map((t) => ({ id: t.teacher.id, name: t.teacher.name })),
      joined: joined.has(g.id), pendingRequestId: pendingByGroup.get(g.id) ?? null,
    }));
  }

  async listMine(userId: number, organizationId: number) {
    const { role } = await this.access.requireOrg(userId, organizationId);
    const where: Prisma.GroupWhereInput =
      role === "STUDENT"
        ? { organizationId, students: { some: { studentId: userId, status: "ACTIVE" } } }
        : role === "TEACHER"
          ? { organizationId, teachers: { some: { teacherId: userId } } }
          : { organizationId };
    const rows = await this.prisma.group.findMany({
      where, orderBy: { name: "asc" },
      include: {
        teachers: { include: { teacher: { select: { id: true, name: true } } } },
        _count: { select: { students: { where: { status: "ACTIVE" } }, documentShares: true } },
      },
    });
    return rows.map((g) => ({
      ...this.toSummary(g), teachers: g.teachers.map((t) => ({ id: t.teacher.id, name: t.teacher.name, role: t.role })),
      studentCount: g._count.students, documentCount: g._count.documentShares,
    }));
  }

  // ----------------------------------------------------------- join requests

  /** Student asks to join a group of their own organization. Approval is required. */
  async requestJoinById(actor: Actor, groupId: number, message?: string) {
    const group = await this.prisma.group.findUnique({ where: { id: groupId } });
    // Same answer whether the group does not exist or belongs to another organization.
    if (!group) throw new NotFoundException("Group not found");
    return this.requestJoin(actor, group, message);
  }

  async requestJoinByCode(actor: Actor, code: string, message?: string) {
    const group = await this.prisma.group.findUnique({ where: { joinCode: normalizeCode(code) } });
    if (!group) throw new NotFoundException("No group matches that code");
    return this.requestJoin(actor, group, message);
  }

  private async requestJoin(actor: Actor, group: { id: number; organizationId: number; name: string; status: string }, message?: string) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { organizationId: group.organizationId, userId: actor.userId, status: "ACTIVE", organization: { status: "ACTIVE" } },
    });
    if (!membership) {
      throw new ForbiddenException("Join this group's organization first, then request access to the group");
    }
    if (membership.role !== "STUDENT") throw new ForbiddenException("Only students can request to join a group");
    if (group.status !== "ACTIVE") throw new ForbiddenException("This group is archived and not accepting members");

    const already = await this.prisma.groupStudent.findUnique({ where: { groupId_studentId: { groupId: group.id, studentId: actor.userId } } });
    if (already?.status === "ACTIVE") throw new ConflictException("You are already in this group");
    const pending = await this.prisma.groupJoinRequest.findFirst({ where: { groupId: group.id, studentId: actor.userId, status: "PENDING" }, select: { id: true } });
    if (pending) throw new ConflictException("You already have a pending request for this group");

    let request;
    try {
      request = await this.prisma.groupJoinRequest.create({ data: { groupId: group.id, studentId: actor.userId, message: message?.trim() || null } });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException("You already have a pending request for this group");
      throw error;
    }
    await this.events.record(actor, "GROUP_JOIN_REQUEST", group.organizationId, { type: "GroupJoinRequest", id: request.id, metadata: { groupId: group.id } });
    const [student, teachers, admins] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { name: true } }),
      this.prisma.groupTeacher.findMany({ where: { groupId: group.id }, select: { teacherId: true } }),
      this.events.adminIds(group.organizationId),
    ]);
    await this.events.notifyMany([...teachers.map((t) => t.teacherId), ...admins], actor.userId, "GROUP_JOIN_REQUEST", "New join request", `${student.name} asked to join ${group.name}.`);
    return { id: request.id, status: request.status, groupId: group.id };
  }

  async myRequests(userId: number, organizationId?: number) {
    const rows = await this.prisma.groupJoinRequest.findMany({
      where: { studentId: userId, ...(organizationId ? { group: { organizationId } } : {}) },
      orderBy: { createdAt: "desc" }, take: 50,
      select: { id: true, status: true, message: true, createdAt: true, reviewedAt: true, group: { select: { id: true, name: true, organizationId: true } } },
    });
    return rows;
  }

  async cancelRequest(actor: Actor, requestId: number) {
    const result = await this.prisma.groupJoinRequest.updateMany({ where: { id: requestId, studentId: actor.userId, status: "PENDING" }, data: { status: "CANCELLED" } });
    if (!result.count) throw new NotFoundException("Pending request not found");
    return { id: requestId, status: "CANCELLED" };
  }

  async listRequests(userId: number, groupId: number, status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" = "PENDING") {
    await this.access.requireGroupManager(userId, groupId);
    return this.prisma.groupJoinRequest.findMany({
      where: { groupId, status }, orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, status: true, message: true, createdAt: true, reviewedAt: true, reviewedById: true, student: { select: USER_BRIEF } },
    });
  }

  /** Pending requests across every group the caller manages (the "Requests" inbox). */
  async inbox(userId: number, organizationId: number) {
    const { role } = await this.access.requireOrg(userId, organizationId, "ADMIN", "TEACHER");
    return this.prisma.groupJoinRequest.findMany({
      where: { status: "PENDING", group: { organizationId, status: "ACTIVE", ...(role === "TEACHER" ? { teachers: { some: { teacherId: userId } } } : {}) } },
      orderBy: { createdAt: "asc" }, take: 100,
      select: { id: true, message: true, createdAt: true, group: { select: { id: true, name: true } }, student: { select: USER_BRIEF } },
    });
  }

  async reviewRequest(actor: Actor, groupId: number, requestId: number, approve: boolean) {
    const ctx = await this.access.requireGroupManager(actor.userId, groupId);
    // Looked up inside this group: a request id from another group is "not found", whatever its owner.
    const request = await this.prisma.groupJoinRequest.findFirst({ where: { id: requestId, groupId } });
    if (!request) throw new NotFoundException("Request not found");
    if (request.status !== "PENDING") throw new ConflictException("This request has already been reviewed");
    this.access.assertGroupOpen(ctx.group);

    if (approve) {
      const stillStudent = await this.prisma.organizationMembership.findFirst({
        where: { organizationId: ctx.group.organizationId, userId: request.studentId, status: "ACTIVE", role: "STUDENT" }, select: { id: true },
      });
      if (!stillStudent) throw new BadRequestException("This person is no longer an active student of the organization");
    }

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.groupJoinRequest.updateMany({
        where: { id: request.id, status: "PENDING" },
        data: { status: approve ? "APPROVED" : "REJECTED", reviewedById: actor.userId, reviewedAt: new Date() },
      });
      if (!claimed.count) throw new ConflictException("This request has already been reviewed");
      if (approve) {
        await tx.groupStudent.upsert({
          where: { groupId_studentId: { groupId, studentId: request.studentId } },
          create: { groupId, studentId: request.studentId, addedById: actor.userId },
          update: { status: "ACTIVE", joinedAt: new Date(), addedById: actor.userId },
        });
      }
    });
    await this.events.record(actor, "GROUP_JOIN_REVIEW", ctx.group.organizationId, { type: "User", id: request.studentId, metadata: { groupId, approved: approve, requestId: request.id } });
    await this.events.notify(request.studentId, "GROUP_REQUEST_REVIEWED", approve ? "Request approved" : "Request declined",
      approve ? `You can now access ${ctx.group.name}.` : `Your request to join ${ctx.group.name} was declined.`);
    return { id: request.id, status: approve ? "APPROVED" : "REJECTED" };
  }

  // --------------------------------------------------------------- documents

  /** Only a document's owner shares it, and only into groups of the organization they belong to. */
  async shareDocument(actor: Actor, groupId: number, documentId: number) {
    const ctx = await this.access.requireGroupManager(actor.userId, groupId);
    this.access.assertGroupOpen(ctx.group);
    const document = await this.prisma.document.findFirst({ where: { id: documentId, userId: actor.userId, deletedAt: null }, select: { id: true, name: true, scope: true, organizationId: true } });
    if (!document) throw new NotFoundException("Document not found");
    if (document.scope === "ORGANIZATION") throw new ConflictException("This document is already shared with the whole organization");
    if (document.organizationId && document.organizationId !== ctx.group.organizationId) {
      throw new ConflictException("This document is shared in another organization. Stop sharing it there first.");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.documentGroupShare.upsert({
        where: { documentId_groupId: { documentId, groupId } },
        create: { documentId, groupId, sharedById: actor.userId }, update: {},
      });
      await tx.document.update({ where: { id: documentId }, data: { scope: "GROUP", organizationId: ctx.group.organizationId } });
    });
    await this.events.record(actor, "DOCUMENT_SHARE_GROUP", ctx.group.organizationId, { type: "Document", id: documentId, metadata: { groupId } });
    const students = await this.prisma.groupStudent.findMany({ where: { groupId, status: "ACTIVE" }, select: { studentId: true } });
    await this.events.notifyMany(students.map((s) => s.studentId), actor.userId, "DOCUMENT_SHARED", "New shared document", `"${document.name}" was shared with ${ctx.group.name}.`);
    return { groupId, documentId };
  }

  async unshareDocument(actor: Actor, groupId: number, documentId: number) {
    const ctx = await this.access.requireGroupManager(actor.userId, groupId);
    const share = await this.prisma.documentGroupShare.findUnique({ where: { documentId_groupId: { documentId, groupId } } });
    if (!share) throw new NotFoundException("This document is not shared with the group");
    if (share.sharedById !== actor.userId && !ctx.isOrgAdmin) throw new ForbiddenException("Only the person who shared it (or an administrator) can stop sharing");

    await this.prisma.$transaction(async (tx) => {
      await tx.documentGroupShare.delete({ where: { documentId_groupId: { documentId, groupId } } });
      const remaining = await tx.documentGroupShare.count({ where: { documentId } });
      if (remaining === 0) {
        await tx.document.updateMany({ where: { id: documentId, scope: "GROUP" }, data: { scope: "PERSONAL", organizationId: null } });
      }
    });
    await this.events.record(actor, "DOCUMENT_UNSHARE_GROUP", ctx.group.organizationId, { type: "Document", id: documentId, metadata: { groupId } });
    return { groupId, documentId };
  }

  async listDocuments(userId: number, groupId: number) {
    await this.access.requireGroupMember(userId, groupId);
    const shares = await this.prisma.documentGroupShare.findMany({
      where: { groupId, document: { deletedAt: null } }, orderBy: { createdAt: "desc" },
      select: { createdAt: true, sharedById: true, document: { select: { id: true, name: true, mimeType: true, size: true, status: true, user: { select: { id: true, name: true } } } } },
    });
    return shares.map((s) => ({ ...s.document, owner: s.document.user, user: undefined, sharedAt: s.createdAt, sharedById: s.sharedById }));
  }

  // ----------------------------------------------------- directories & dashboards

  /** Students the caller can see: admins see the organization's, teachers the students of their groups. */
  async listStudents(userId: number, organizationId: number, query: { page?: number; pageSize?: number; search?: string; groupId?: number }) {
    const { role } = await this.access.requireOrg(userId, organizationId, "ADMIN", "TEACHER");
    const { page, pageSize, skip, take } = pageParams(query.page, query.pageSize);
    const term = query.search?.trim();
    const userFilter: Prisma.UserWhereInput = term ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { email: { contains: term, mode: "insensitive" } }] } : {};
    const groupScope: Prisma.GroupStudentWhereInput = {
      status: "ACTIVE",
      group: { organizationId, ...(role === "TEACHER" ? { teachers: { some: { teacherId: userId } } } : {}), ...(query.groupId ? { id: query.groupId } : {}) },
    };

    let where: Prisma.OrganizationMembershipWhereInput;
    if (role === "TEACHER" || query.groupId) {
      where = { organizationId, role: "STUDENT", status: "ACTIVE", user: { AND: [userFilter, { groupStudentLinks: { some: groupScope } }] } };
    } else {
      where = { organizationId, role: "STUDENT", status: { in: ["ACTIVE", "SUSPENDED"] }, user: userFilter };
    }
    const [total, rows] = await Promise.all([
      this.prisma.organizationMembership.count({ where }),
      this.prisma.organizationMembership.findMany({ where, skip, take, orderBy: { createdAt: "desc" }, include: { user: { select: USER_BRIEF } } }),
    ]);
    const ids = rows.map((r) => r.userId);
    const links = await this.prisma.groupStudent.findMany({
      where: { studentId: { in: ids }, ...groupScope }, select: { studentId: true, joinedAt: true, group: { select: { id: true, name: true } } },
    });
    const byStudent = new Map<number, { id: number; name: string; joinedAt: Date }[]>();
    for (const link of links) byStudent.set(link.studentId, [...(byStudent.get(link.studentId) ?? []), { ...link.group, joinedAt: link.joinedAt }]);
    return {
      items: rows.map((m) => ({ userId: m.userId, name: m.user.name, email: m.user.email, status: m.status, joinedAt: m.joinedAt, groups: byStudent.get(m.userId) ?? [] })),
      page, pageSize, total, totalPages: Math.max(Math.ceil(total / pageSize), 1),
    };
  }

  async teacherOverview(userId: number, organizationId: number) {
    await this.access.requireOrg(userId, organizationId, "TEACHER", "ADMIN");
    const mine = { organizationId, teachers: { some: { teacherId: userId } } };
    const groups = await this.prisma.group.findMany({ where: mine, select: { id: true, name: true, status: true, _count: { select: { students: { where: { status: "ACTIVE" } } } } } });
    const groupIds = groups.map((g) => g.id);
    const [students, pendingRequests, recentShares, activity] = await Promise.all([
      this.prisma.groupStudent.findMany({ where: { groupId: { in: groupIds }, status: "ACTIVE" }, distinct: ["studentId"], select: { studentId: true } }),
      this.prisma.groupJoinRequest.count({ where: { groupId: { in: groupIds }, status: "PENDING" } }),
      this.prisma.documentGroupShare.findMany({
        where: { groupId: { in: groupIds }, document: { deletedAt: null } }, orderBy: { createdAt: "desc" }, take: 6,
        select: { createdAt: true, group: { select: { id: true, name: true } }, document: { select: { id: true, name: true, mimeType: true } } },
      }),
      this.prisma.auditLog.findMany({
        where: { organizationId, OR: groupIds.map((id) => ({ metadata: { path: ["groupId"], equals: id } })) },
        orderBy: { createdAt: "desc" }, take: 8, select: { id: true, action: true, actorName: true, createdAt: true, metadata: true },
      }),
    ]);
    return {
      totals: { groups: groups.length, activeGroups: groups.filter((g) => g.status === "ACTIVE").length, students: students.length, pendingRequests },
      groups: groups.map((g) => ({ id: g.id, name: g.name, status: g.status, studentCount: g._count.students })),
      recentDocuments: recentShares.map((s) => ({ ...s.document, group: s.group, sharedAt: s.createdAt })),
      recentActivity: groupIds.length ? activity : [],
    };
  }

  async studentOverview(userId: number, organizationId: number) {
    await this.access.requireOrg(userId, organizationId, "STUDENT");
    const [org, groups, requests, shares] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { id: true, name: true, organizationType: true, description: true } }),
      this.listMine(userId, organizationId),
      this.prisma.groupJoinRequest.findMany({ where: { studentId: userId, status: "PENDING", group: { organizationId } }, select: { id: true, createdAt: true, group: { select: { id: true, name: true } } } }),
      this.prisma.documentGroupShare.findMany({
        where: { document: { deletedAt: null }, group: { organizationId, status: { in: ["ACTIVE", "ARCHIVED"] }, students: { some: { studentId: userId, status: "ACTIVE" } } } },
        orderBy: { createdAt: "desc" }, take: 6,
        select: { createdAt: true, group: { select: { id: true, name: true } }, document: { select: { id: true, name: true, mimeType: true } } },
      }),
    ]);
    const teacherMap = new Map<number, { id: number; name: string }>();
    for (const g of groups) for (const t of g.teachers) teacherMap.set(t.id, { id: t.id, name: t.name });
    return {
      organization: org, groups, teachers: [...teacherMap.values()], pendingRequests: requests,
      recentDocuments: shares.map((s) => ({ ...s.document, group: s.group, sharedAt: s.createdAt })),
    };
  }

  // ------------------------------------------------------------------ helpers

  private toSummary(g: { id: number; organizationId: number; name: string; description: string | null; subject: string | null; academicYear: string | null; status: string; createdAt: Date }) {
    return { id: g.id, organizationId: g.organizationId, name: g.name, description: g.description, subject: g.subject, academicYear: g.academicYear, status: g.status, createdAt: g.createdAt };
  }

  private async uniqueGroupCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = generateCode(8);
      if (!(await this.prisma.group.findUnique({ where: { joinCode: code }, select: { id: true } }))) return code;
    }
    throw new ConflictException("Could not generate a unique code, try again");
  }

  private async createWithUniqueCode(data: Omit<Prisma.GroupUncheckedCreateInput, "joinCode">) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await this.prisma.group.create({ data: { ...data, joinCode: generateCode(8) } });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    throw new ConflictException("Could not generate a unique code, try again");
  }
}

export type { GroupContext };
