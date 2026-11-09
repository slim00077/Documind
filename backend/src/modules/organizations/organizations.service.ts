import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type MembershipStatus, type OrgRole } from "../../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { OrgAccessService } from "../access/org-access.service";
import { InvitationsService } from "./invitations.service";
import { OrgEventsService, type Actor } from "./org-events.service";
import {
  generateCode,
  isUniqueViolation,
  normalizeCode,
  normalizeEmail,
  pageParams,
  slugify,
} from "./org-utils";
import type {
  AddMemberDto,
  CreateOrganizationDto,
  MemberQueryDto,
  OrgJoinRequestDto,
  SetOrganizationStatusDto,
  UpdateMemberDto,
  UpdateOrganizationDto,
} from "./organizations.dto";

const ORG_PUBLIC = { id: true, name: true, slug: true, description: true, organizationType: true } as const;

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OrgAccessService,
    private readonly events: OrgEventsService,
    private readonly invitations: InvitationsService,
  ) {}

  // ------------------------------------------------------------ own workspaces

  /** Organizations the caller actively belongs to (feeds the workspace switcher). */
  async listMine(userId: number) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId, status: "ACTIVE", organization: { status: "ACTIVE" } },
      include: { organization: { select: { ...ORG_PUBLIC, logo: true } } },
      orderBy: { createdAt: "asc" },
    });
    return memberships.map((m) => ({
      membershipId: m.id,
      role: m.role,
      joinedAt: m.joinedAt,
      organization: { ...m.organization, hasLogo: Boolean(m.organization.logo), logo: undefined },
    }));
  }

  async get(userId: number, organizationId: number) {
    const { role } = await this.access.requireOrg(userId, organizationId);
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      description: org.description,
      organizationType: org.organizationType,
      status: org.status,
      hasLogo: Boolean(org.logo),
      createdAt: org.createdAt,
      myRole: role,
      // Codes and discoverability are administration details.
      ...(role === "ADMIN" ? { joinCode: org.joinCode, isDiscoverable: org.isDiscoverable } : {}),
    };
  }

  async update(actor: Actor, organizationId: number, dto: UpdateOrganizationDto) {
    await this.access.requireOrg(actor.userId, organizationId, "ADMIN");
    const org = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
        ...(dto.organizationType ? { organizationType: dto.organizationType } : {}),
        ...(dto.isDiscoverable !== undefined ? { isDiscoverable: dto.isDiscoverable } : {}),
      },
    });
    await this.events.record(actor, "ORG_UPDATE", organizationId, { type: "Organization", id: organizationId, metadata: { fields: Object.keys(dto) } });
    return this.get(actor.userId, org.id);
  }

  async rotateJoinCode(actor: Actor, organizationId: number) {
    await this.access.requireOrg(actor.userId, organizationId, "ADMIN");
    const org = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { joinCode: await this.uniqueOrgCode() },
      select: { joinCode: true },
    });
    await this.events.record(actor, "ORG_UPDATE", organizationId, { type: "Organization", id: organizationId, metadata: { fields: ["joinCode"] } });
    return org;
  }

  /** Throws unless the caller is an ACTIVE ORG ADMIN; used before a logo file is stored. */
  async requireAdmin(userId: number, organizationId: number): Promise<void> {
    await this.access.requireOrg(userId, organizationId, "ADMIN");
  }

  async setLogo(actor: Actor, organizationId: number, filePath: string) {
    await this.access.requireOrg(actor.userId, organizationId, "ADMIN");
    const current = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { logo: true } });
    await this.prisma.organization.update({ where: { id: organizationId }, data: { logo: filePath } });
    await this.events.record(actor, "ORG_UPDATE", organizationId, { type: "Organization", id: organizationId, metadata: { fields: ["logo"] } });
    return { previous: current.logo };
  }

  async getLogoPath(userId: number, organizationId: number): Promise<string> {
    await this.access.requireOrg(userId, organizationId);
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { logo: true } });
    if (!org.logo) throw new NotFoundException("No logo");
    return org.logo;
  }

  // ------------------------------------------------------------------ stats

  /** Real counts, scoped to one organization the caller administers. */
  async stats(userId: number, organizationId: number) {
    await this.access.requireOrg(userId, organizationId, "ADMIN");
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const member = (role: OrgRole, status: MembershipStatus = "ACTIVE") =>
      this.prisma.organizationMembership.count({ where: { organizationId, role, status } });

    const [
      teachers, students, admins, activeMemberships, suspendedMemberships, groupsActive, groupsArchived,
      pendingInvitations, pendingGroupRequests, pendingOrgRequests, orgDocuments, groupDocuments, sharedLast7d,
    ] = await Promise.all([
      member("TEACHER"),
      member("STUDENT"),
      member("ADMIN"),
      this.prisma.organizationMembership.count({ where: { organizationId, status: "ACTIVE" } }),
      this.prisma.organizationMembership.count({ where: { organizationId, status: "SUSPENDED" } }),
      this.prisma.group.count({ where: { organizationId, status: "ACTIVE" } }),
      this.prisma.group.count({ where: { organizationId, status: "ARCHIVED" } }),
      this.prisma.organizationInvitation.count({ where: { organizationId, status: "PENDING", expiresAt: { gt: new Date() } } }),
      this.prisma.groupJoinRequest.count({ where: { status: "PENDING", group: { organizationId } } }),
      this.prisma.organizationJoinRequest.count({ where: { organizationId, status: "PENDING" } }),
      this.prisma.document.count({ where: { organizationId, scope: "ORGANIZATION", deletedAt: null } }),
      this.prisma.document.count({ where: { organizationId, scope: "GROUP", deletedAt: null } }),
      this.prisma.documentGroupShare.count({ where: { group: { organizationId }, createdAt: { gte: sevenDaysAgo } } }),
    ]);

    return {
      teachers, students, admins, activeMemberships, suspendedMemberships,
      groups: { active: groupsActive, archived: groupsArchived, total: groupsActive + groupsArchived },
      pendingInvitations, pendingGroupRequests, pendingOrgRequests,
      documents: { organizationShared: orgDocuments, groupShared: groupDocuments, sharedToGroupsLast7Days: sharedLast7d },
    };
  }

  async auditLogs(userId: number, organizationId: number, query: { page?: number; pageSize?: number }) {
    await this.access.requireOrg(userId, organizationId, "ADMIN");
    const { page, pageSize, skip, take } = pageParams(query.page, query.pageSize);
    const where = { organizationId };
    const [total, items] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where, orderBy: { createdAt: "desc" }, skip, take,
        select: { id: true, action: true, actorName: true, actorEmail: true, targetType: true, targetId: true, metadata: true, createdAt: true },
      }),
    ]);
    return { items, page, pageSize, total, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
  }

  // ---------------------------------------------------------------- members

  async listMembers(userId: number, organizationId: number, query: MemberQueryDto) {
    await this.access.requireOrg(userId, organizationId, "ADMIN");
    const { page, pageSize, skip, take } = pageParams(query.page, query.pageSize);
    const search = query.search?.trim();
    const where: Prisma.OrganizationMembershipWhereInput = {
      organizationId,
      status: query.status ?? { in: ["ACTIVE", "SUSPENDED", "PENDING"] },
      ...(query.role ? { role: query.role } : {}),
      ...(search ? { user: { OR: [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.organizationMembership.count({ where }),
      this.prisma.organizationMembership.findMany({
        where, skip, take, orderBy: [{ role: "asc" }, { createdAt: "desc" }],
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
    ]);
    const ids = rows.map((r) => r.userId);
    const [teaching, studying] = await Promise.all([
      this.prisma.groupTeacher.groupBy({ by: ["teacherId"], where: { teacherId: { in: ids }, group: { organizationId } }, _count: true }),
      this.prisma.groupStudent.groupBy({ by: ["studentId"], where: { studentId: { in: ids }, status: "ACTIVE", group: { organizationId } }, _count: true }),
    ]);
    const teachCount = new Map(teaching.map((t) => [t.teacherId, t._count]));
    const studyCount = new Map(studying.map((s) => [s.studentId, s._count]));
    return {
      items: rows.map((m) => ({
        membershipId: m.id, userId: m.userId, name: m.user.name, email: m.user.email,
        role: m.role, status: m.status, joinedAt: m.joinedAt,
        groupCount: m.role === "STUDENT" ? studyCount.get(m.userId) ?? 0 : teachCount.get(m.userId) ?? 0,
      })),
      page, pageSize, total, totalPages: Math.max(Math.ceil(total / pageSize), 1),
    };
  }

  /** Adds an existing account. Unknown emails must go through an invitation instead. */
  async addMember(actor: Actor, organizationId: number, dto: AddMemberDto) {
    await this.access.requireOrg(actor.userId, organizationId, "ADMIN");
    const user = await this.prisma.user.findUnique({ where: { email: normalizeEmail(dto.email) }, select: { id: true, name: true, isActive: true } });
    if (!user || !user.isActive) {
      throw new NotFoundException("No active account with that email. Send an invitation instead.");
    }
    const existing = await this.prisma.organizationMembership.findUnique({ where: { organizationId_userId: { organizationId, userId: user.id } } });
    if (existing?.status === "ACTIVE") throw new ConflictException("This account is already a member of the organization");

    const data = { role: dto.role, status: "ACTIVE" as const, joinedAt: new Date() };
    const membership = existing
      ? await this.prisma.organizationMembership.update({ where: { id: existing.id }, data })
      : await this.prisma.organizationMembership.create({ data: { organizationId, userId: user.id, ...data } });

    await this.events.record(actor, "ORG_MEMBER_ADD", organizationId, { type: "User", id: user.id, metadata: { role: dto.role } });
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } });
    await this.events.notify(user.id, "ORG_MEMBERSHIP_CHANGED", `Added to ${org.name}`, `You are now a ${dto.role.toLowerCase()} of ${org.name}.`);
    return { membershipId: membership.id };
  }

  async updateMember(actor: Actor, organizationId: number, membershipId: number, dto: UpdateMemberDto) {
    await this.access.requireOrg(actor.userId, organizationId, "ADMIN");
    // Look the membership up *inside* this organization: a foreign id is simply not found.
    const target = await this.prisma.organizationMembership.findFirst({ where: { id: membershipId, organizationId } });
    if (!target) throw new NotFoundException("Member not found");
    if (target.userId === actor.userId && (dto.role || (dto.status && dto.status !== "ACTIVE"))) {
      throw new ForbiddenException("You cannot change your own role or suspend yourself");
    }
    const nextRole = dto.role ?? target.role;
    const nextStatus = dto.status ?? target.status;
    if (target.role === "ADMIN" && target.status === "ACTIVE" && (nextRole !== "ADMIN" || nextStatus !== "ACTIVE")) {
      await this.assertNotLastAdmin(organizationId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.organizationMembership.update({
        where: { id: target.id },
        data: { role: nextRole, status: nextStatus, ...(nextStatus === "ACTIVE" && !target.joinedAt ? { joinedAt: new Date() } : {}) },
      });
      await this.cascadeMembershipChange(tx, organizationId, target.userId, target.role, nextRole, nextStatus);
    });

    await this.events.record(actor, nextStatus === "REMOVED" ? "ORG_MEMBER_REMOVE" : "ORG_MEMBER_UPDATE", organizationId, {
      type: "User", id: target.userId, metadata: { role: nextRole, status: nextStatus, previousRole: target.role, previousStatus: target.status },
    });
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } });
    await this.events.notify(target.userId, "ORG_MEMBERSHIP_CHANGED", `Membership updated: ${org.name}`,
      nextStatus === "ACTIVE" ? `Your role in ${org.name} is now ${nextRole.toLowerCase()}.` : `Your membership in ${org.name} is now ${nextStatus.toLowerCase()}.`);
    return { membershipId: target.id, role: nextRole, status: nextStatus };
  }

  /** The caller leaves an organization; their personal workspace is untouched. */
  async leave(actor: Actor, organizationId: number) {
    const { membership } = await this.access.requireOrg(actor.userId, organizationId);
    if (membership.role === "ADMIN") await this.assertNotLastAdmin(organizationId);
    await this.prisma.$transaction(async (tx) => {
      await tx.organizationMembership.update({ where: { id: membership.id }, data: { status: "REMOVED" } });
      await this.cascadeMembershipChange(tx, organizationId, actor.userId, membership.role, membership.role, "REMOVED");
    });
    await this.events.record(actor, "ORG_MEMBER_REMOVE", organizationId, { type: "User", id: actor.userId, metadata: { left: true } });
    return { left: true };
  }

  private async assertNotLastAdmin(organizationId: number) {
    const admins = await this.prisma.organizationMembership.count({ where: { organizationId, role: "ADMIN", status: "ACTIVE" } });
    if (admins <= 1) throw new BadRequestException("An organization must keep at least one active administrator");
  }

  /**
   * Keeps group links and shared documents consistent with a membership change. Personal data
   * (documents, conversations, embeddings) is never touched: shared documents are detached back
   * to PERSONAL, not deleted.
   */
  private async cascadeMembershipChange(
    tx: Prisma.TransactionClient,
    organizationId: number,
    userId: number,
    previousRole: OrgRole,
    nextRole: OrgRole,
    nextStatus: MembershipStatus,
  ) {
    const losesAccess = nextStatus === "REMOVED" || nextStatus === "SUSPENDED";
    const groupFilter = { group: { organizationId } };

    if (nextStatus === "REMOVED" || (previousRole !== nextRole && nextRole === "STUDENT")) {
      await tx.groupTeacher.deleteMany({ where: { teacherId: userId, ...groupFilter } });
    }
    if (nextStatus === "REMOVED") {
      await tx.groupStudent.updateMany({ where: { studentId: userId, status: "ACTIVE", ...groupFilter }, data: { status: "LEFT" } });
      await tx.groupJoinRequest.updateMany({ where: { studentId: userId, status: "PENDING", ...groupFilter }, data: { status: "CANCELLED" } });
    }
    if (previousRole !== nextRole && nextRole !== "STUDENT" && previousRole === "STUDENT") {
      await tx.groupStudent.updateMany({ where: { studentId: userId, status: "ACTIVE", ...groupFilter }, data: { status: "LEFT" } });
    }
    if (losesAccess) {
      // Their shared documents stop being shared; ownership and content stay with them.
      await tx.documentGroupShare.deleteMany({ where: { sharedById: userId, ...groupFilter } });
      await tx.document.updateMany({ where: { userId, organizationId, scope: "ORGANIZATION" }, data: { scope: "PERSONAL", organizationId: null } });
      await this.resetOrphanedGroupDocuments(tx, userId, organizationId);
    }
  }

  private async resetOrphanedGroupDocuments(tx: Prisma.TransactionClient, userId: number, organizationId: number) {
    await tx.document.updateMany({
      where: { userId, organizationId, scope: "GROUP", groupShares: { none: {} } },
      data: { scope: "PERSONAL", organizationId: null },
    });
  }

  // -------------------------------------------------------- discovery & joining

  /** Organizations a signed-in user can ask to join (opt-in by the organization). */
  async discover(userId: number, search?: string) {
    const memberOf = await this.prisma.organizationMembership.findMany({ where: { userId, status: { in: ["ACTIVE", "PENDING"] } }, select: { organizationId: true } });
    const term = search?.trim();
    const orgs = await this.prisma.organization.findMany({
      where: {
        status: "ACTIVE", isDiscoverable: true, id: { notIn: memberOf.map((m) => m.organizationId) },
        ...(term ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { description: { contains: term, mode: "insensitive" } }] } : {}),
      },
      select: ORG_PUBLIC, orderBy: { name: "asc" }, take: 50,
    });
    return orgs;
  }

  async lookupByCode(code: string) {
    const org = await this.prisma.organization.findFirst({ where: { joinCode: normalizeCode(code), status: "ACTIVE" }, select: ORG_PUBLIC });
    if (!org) throw new NotFoundException("No organization matches that code");
    return org;
  }

  /** A join request always asks for the STUDENT role; roles above that are only ever granted by an administrator. */
  async requestJoin(actor: Actor, dto: OrgJoinRequestDto) {
    const org = dto.code
      ? await this.prisma.organization.findFirst({ where: { joinCode: normalizeCode(dto.code), status: "ACTIVE" } })
      : dto.organizationId
        ? await this.prisma.organization.findFirst({ where: { id: dto.organizationId, status: "ACTIVE", isDiscoverable: true } })
        : null;
    if (!org) throw new NotFoundException("Organization not found");

    const membership = await this.prisma.organizationMembership.findUnique({ where: { organizationId_userId: { organizationId: org.id, userId: actor.userId } } });
    if (membership?.status === "ACTIVE") throw new ConflictException("You are already a member of this organization");
    if (membership?.status === "SUSPENDED") throw new ForbiddenException("Your membership of this organization is suspended");

    const pending = await this.prisma.organizationJoinRequest.findFirst({ where: { organizationId: org.id, userId: actor.userId, status: "PENDING" }, select: { id: true } });
    if (pending) throw new ConflictException("You already have a pending request for this organization");

    try {
      const request = await this.prisma.organizationJoinRequest.create({
        data: { organizationId: org.id, userId: actor.userId, message: dto.message?.trim() || null },
      });
      await this.events.record(actor, "ORG_JOIN_REQUEST", org.id, { type: "OrganizationJoinRequest", id: request.id });
      const requester = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { name: true } });
      await this.events.notifyMany(await this.events.adminIds(org.id), actor.userId, "ORG_JOIN_REQUEST", "New request to join", `${requester.name} asked to join ${org.name}.`);
      return { id: request.id, status: request.status, organization: { id: org.id, name: org.name } };
    } catch (error) {
      if (isUniqueViolation(error) || (error as { code?: string }).code === "23505") {
        throw new ConflictException("You already have a pending request for this organization");
      }
      throw error;
    }
  }

  async myJoinRequests(userId: number) {
    return this.prisma.organizationJoinRequest.findMany({
      where: { userId }, orderBy: { createdAt: "desc" }, take: 50,
      select: { id: true, status: true, message: true, createdAt: true, reviewedAt: true, organization: { select: { id: true, name: true } } },
    });
  }

  async cancelJoinRequest(actor: Actor, requestId: number) {
    const result = await this.prisma.organizationJoinRequest.updateMany({ where: { id: requestId, userId: actor.userId, status: "PENDING" }, data: { status: "CANCELLED" } });
    if (!result.count) throw new NotFoundException("Pending request not found");
    return { id: requestId, status: "CANCELLED" };
  }

  async listJoinRequests(userId: number, organizationId: number, status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" = "PENDING") {
    await this.access.requireOrg(userId, organizationId, "ADMIN");
    return this.prisma.organizationJoinRequest.findMany({
      where: { organizationId, status }, orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, status: true, message: true, createdAt: true, reviewedAt: true, user: { select: { id: true, name: true, email: true } } },
    });
  }

  async reviewJoinRequest(actor: Actor, organizationId: number, requestId: number, approve: boolean) {
    await this.access.requireOrg(actor.userId, organizationId, "ADMIN");
    const request = await this.prisma.organizationJoinRequest.findFirst({ where: { id: requestId, organizationId }, include: { organization: { select: { name: true } } } });
    if (!request) throw new NotFoundException("Request not found");
    if (request.status !== "PENDING") throw new ConflictException("This request has already been reviewed");

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.organizationJoinRequest.updateMany({
        where: { id: request.id, status: "PENDING" },
        data: { status: approve ? "APPROVED" : "REJECTED", reviewedById: actor.userId, reviewedAt: new Date() },
      });
      if (!claimed.count) throw new ConflictException("This request has already been reviewed");
      if (approve) {
        await tx.organizationMembership.upsert({
          where: { organizationId_userId: { organizationId, userId: request.userId } },
          create: { organizationId, userId: request.userId, role: "STUDENT", status: "ACTIVE", joinedAt: new Date() },
          update: { role: "STUDENT", status: "ACTIVE", joinedAt: new Date() },
        });
      }
    });

    await this.events.record(actor, "ORG_JOIN_REVIEW", organizationId, { type: "User", id: request.userId, metadata: { approved: approve } });
    await this.events.notify(request.userId, "ORG_JOIN_REVIEWED", approve ? `Welcome to ${request.organization.name}` : "Join request declined",
      approve ? `Your request to join ${request.organization.name} was approved.` : `Your request to join ${request.organization.name} was declined.`);
    return { id: request.id, status: approve ? "APPROVED" : "REJECTED" };
  }

  // ------------------------------------------------- organization documents

  /** Organization administrators publish one of their own documents to every active member (read-only). */
  async shareDocument(actor: Actor, organizationId: number, documentId: number) {
    await this.access.requireOrg(actor.userId, organizationId, "ADMIN");
    const document = await this.prisma.document.findFirst({ where: { id: documentId, userId: actor.userId, deletedAt: null }, select: { id: true, name: true, organizationId: true } });
    if (!document) throw new NotFoundException("Document not found");
    if (document.organizationId && document.organizationId !== organizationId) {
      throw new ConflictException("This document is shared in another organization. Stop sharing it there first.");
    }
    await this.prisma.document.update({ where: { id: documentId }, data: { scope: "ORGANIZATION", organizationId } });
    await this.events.record(actor, "DOCUMENT_SHARE_ORG", organizationId, { type: "Document", id: documentId });
    return { documentId, scope: "ORGANIZATION" };
  }

  async unshareDocument(actor: Actor, organizationId: number, documentId: number) {
    await this.access.requireOrg(actor.userId, organizationId, "ADMIN");
    const document = await this.prisma.document.findFirst({ where: { id: documentId, userId: actor.userId, organizationId, scope: "ORGANIZATION" }, select: { id: true } });
    if (!document) throw new NotFoundException("Document not found");
    const groupShares = await this.prisma.documentGroupShare.count({ where: { documentId } });
    await this.prisma.document.update({
      where: { id: documentId },
      data: groupShares > 0 ? { scope: "GROUP" } : { scope: "PERSONAL", organizationId: null },
    });
    await this.events.record(actor, "DOCUMENT_SHARE_ORG", organizationId, { type: "Document", id: documentId, metadata: { unshared: true } });
    return { documentId };
  }

  /** Documents shared with the whole organization, visible to any active member. */
  async listDocuments(userId: number, organizationId: number) {
    await this.access.requireOrg(userId, organizationId);
    return this.prisma.document.findMany({
      where: { organizationId, scope: "ORGANIZATION", deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 100,
      select: { id: true, name: true, mimeType: true, size: true, status: true, updatedAt: true, user: { select: { id: true, name: true } } },
    });
  }

  // -------------------------------------------------- platform administration

  async platformList(query: { page?: number; pageSize?: number; search?: string }) {
    const { page, pageSize, skip, take } = pageParams(query.page, query.pageSize);
    const term = query.search?.trim();
    const where: Prisma.OrganizationWhereInput = term ? { name: { contains: term, mode: "insensitive" } } : {};
    const [total, rows] = await Promise.all([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({
        where, skip, take, orderBy: { createdAt: "desc" },
        include: { _count: { select: { groups: true } }, memberships: { where: { status: "ACTIVE" }, select: { role: true } } },
      }),
    ]);
    return {
      items: rows.map((o) => ({
        id: o.id, name: o.name, slug: o.slug, organizationType: o.organizationType, status: o.status, createdAt: o.createdAt,
        groups: o._count.groups,
        admins: o.memberships.filter((m) => m.role === "ADMIN").length,
        teachers: o.memberships.filter((m) => m.role === "TEACHER").length,
        students: o.memberships.filter((m) => m.role === "STUDENT").length,
      })),
      page, pageSize, total, totalPages: Math.max(Math.ceil(total / pageSize), 1),
    };
  }

  /** Platform administrators create organizations and name their first administrator. */
  async platformCreate(actor: Actor, dto: CreateOrganizationDto) {
    const name = dto.name.trim();
    const org = await this.createWithUniqueSlug({
      name, description: dto.description?.trim() || null,
      organizationType: dto.organizationType ?? "OTHER",
      isDiscoverable: dto.isDiscoverable ?? false,
      joinCode: await this.uniqueOrgCode(),
    });
    await this.events.record(actor, "ORG_CREATE", org.id, { type: "Organization", id: org.id, metadata: { name } });

    let invitation: Awaited<ReturnType<InvitationsService["createForPlatform"]>> | null = null;
    let adminAdded = false;
    if (dto.adminEmail) {
      const email = normalizeEmail(dto.adminEmail);
      const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (user) {
        await this.prisma.organizationMembership.create({ data: { organizationId: org.id, userId: user.id, role: "ADMIN", status: "ACTIVE", joinedAt: new Date() } });
        await this.events.record(actor, "ORG_MEMBER_ADD", org.id, { type: "User", id: user.id, metadata: { role: "ADMIN" } });
        await this.events.notify(user.id, "ORG_MEMBERSHIP_CHANGED", `You administer ${name}`, `You were made an administrator of ${name}.`);
        adminAdded = true;
      } else {
        invitation = await this.invitations.createForPlatform(actor, org.id, email, "ADMIN");
      }
    }
    return { id: org.id, slug: org.slug, joinCode: org.joinCode, adminAdded, invitation };
  }

  async platformSetStatus(actor: Actor, organizationId: number, dto: SetOrganizationStatusDto) {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, status: true } });
    if (!org) throw new NotFoundException("Organization not found");
    await this.prisma.organization.update({ where: { id: organizationId }, data: { status: dto.status } });
    await this.events.record(actor, "ORG_STATUS_CHANGE", organizationId, { type: "Organization", id: organizationId, metadata: { from: org.status, to: dto.status } });
    return { id: organizationId, status: dto.status };
  }

  /** Platform administrators may seat an administrator in an organization (explicit, audited). */
  async platformAddAdmin(actor: Actor, organizationId: number, email: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true } });
    if (!org) throw new NotFoundException("Organization not found");
    const user = await this.prisma.user.findUnique({ where: { email: normalizeEmail(email) }, select: { id: true } });
    if (!user) return { adminAdded: false, invitation: await this.invitations.createForPlatform(actor, organizationId, normalizeEmail(email), "ADMIN") };
    await this.prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId, userId: user.id } },
      create: { organizationId, userId: user.id, role: "ADMIN", status: "ACTIVE", joinedAt: new Date() },
      update: { role: "ADMIN", status: "ACTIVE" },
    });
    await this.events.record(actor, "ORG_MEMBER_ADD", organizationId, { type: "User", id: user.id, metadata: { role: "ADMIN", byPlatformAdmin: true } });
    await this.events.notify(user.id, "ORG_MEMBERSHIP_CHANGED", `You administer ${org.name}`, `You were made an administrator of ${org.name}.`);
    return { adminAdded: true, invitation: null };
  }

  // ---------------------------------------------------------------- helpers

  private async uniqueOrgCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = generateCode(8);
      const taken = await this.prisma.organization.findUnique({ where: { joinCode: code }, select: { id: true } });
      if (!taken) return code;
    }
    throw new ConflictException("Could not generate a unique code, try again");
  }

  private async createWithUniqueSlug(data: Omit<Prisma.OrganizationCreateInput, "slug">) {
    const base = slugify(data.name);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const slug = attempt === 0 ? base : `${base}-${generateCode(4).toLowerCase()}`;
      try {
        return await this.prisma.organization.create({ data: { ...data, slug } });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    throw new ConflictException("Could not create a unique organization address");
  }
}
