import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { OrgRole } from "../../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { OrgAccessService } from "../access/org-access.service";
import { OrgEventsService, type Actor } from "./org-events.service";
import {
  INVITATION_TTL_MS,
  generateToken,
  hashToken,
  inviteUrl,
  isUniqueViolation,
  maskEmail,
  normalizeEmail,
} from "./org-utils";
import type { CreateInvitationDto } from "./organizations.dto";

const INVALID = "This invitation is invalid or has expired";

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OrgAccessService,
    private readonly events: OrgEventsService,
  ) {}

  /**
   * Organization admins invite anyone in any role. Teachers may only invite STUDENTS, and only
   * into a group they manage (the student joins that group on acceptance).
   */
  async create(actor: Actor, organizationId: number, dto: CreateInvitationDto) {
    const { role: actorRole } = await this.access.requireOrg(actor.userId, organizationId, "ADMIN", "TEACHER");
    let groupId: number | null = null;

    if (actorRole !== "ADMIN") {
      if (dto.role !== "STUDENT") throw new ForbiddenException("Teachers can only invite students");
      if (!dto.groupId) throw new BadRequestException("Choose the group the student is invited to");
    }
    if (dto.groupId) {
      const ctx = await this.access.requireGroupManager(actor.userId, dto.groupId);
      if (ctx.group.organizationId !== organizationId) throw new NotFoundException("Group not found");
      this.access.assertGroupOpen(ctx.group);
      if (dto.role !== "STUDENT") throw new BadRequestException("Only students can be invited to a group");
      groupId = ctx.group.id;
    }

    const email = normalizeEmail(dto.email);
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      const membership = await this.prisma.organizationMembership.findUnique({ where: { organizationId_userId: { organizationId, userId: existing.id } } });
      if (membership?.status === "ACTIVE" && !groupId) throw new ConflictException("This person is already a member of the organization");
      if (membership?.status === "ACTIVE" && groupId) {
        throw new ConflictException("This person is already in the organization: add them to the group directly");
      }
    }
    return this.issue(actor, organizationId, email, dto.role, groupId, existing?.id ?? null);
  }

  /** Used when a platform administrator seats the first administrator of a new organization. */
  createForPlatform(actor: Actor, organizationId: number, email: string, role: OrgRole) {
    return this.issue(actor, organizationId, normalizeEmail(email), role, null, null);
  }

  private async issue(actor: Actor, organizationId: number, email: string, role: OrgRole, groupId: number | null, existingUserId: number | null) {
    const duplicate = await this.prisma.organizationInvitation.findFirst({
      where: { organizationId, email, intendedRole: role, groupId, status: "PENDING", expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException("An active invitation for this person already exists. Revoke it to send a new one.");
    // An expired-but-PENDING row would still collide with the partial unique index.
    await this.prisma.organizationInvitation.updateMany({
      where: { organizationId, email, intendedRole: role, groupId, status: "PENDING", expiresAt: { lte: new Date() } },
      data: { status: "EXPIRED" },
    });

    const { token, tokenHash } = generateToken();
    let invitation;
    try {
      invitation = await this.prisma.organizationInvitation.create({
        data: { organizationId, email, intendedRole: role, groupId, tokenHash, expiresAt: new Date(Date.now() + INVITATION_TTL_MS), invitedById: actor.userId },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException("An active invitation for this person already exists");
      throw error;
    }

    await this.events.record(actor, "ORG_INVITE_CREATE", organizationId, { type: "OrganizationInvitation", id: invitation.id, metadata: { role, groupId, email } });

    if (existingUserId) {
      const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } });
      await this.events.notify(
        existingUserId,
        groupId ? "GROUP_INVITATION" : "ORG_INVITATION",
        `Invitation from ${org.name}`,
        `You were invited to join ${org.name} as ${role.toLowerCase()}. Open your invitation link to accept.`,
      );
    }

    // No email service is configured, so the link is returned once for the inviter to share.
    return { id: invitation.id, email, role, groupId, expiresAt: invitation.expiresAt, token, url: inviteUrl(token), emailSent: false };
  }

  async list(userId: number, organizationId: number, status?: string) {
    const { role } = await this.access.requireOrg(userId, organizationId, "ADMIN", "TEACHER");
    const now = new Date();
    const rows = await this.prisma.organizationInvitation.findMany({
      where: {
        organizationId,
        ...(role === "ADMIN" ? {} : { invitedById: userId }),
        ...(status === "PENDING" ? { status: "PENDING", expiresAt: { gt: now } } : status ? { status: status as never } : {}),
      },
      orderBy: { createdAt: "desc" }, take: 200,
    });
    const groupIds = [...new Set(rows.map((r) => r.groupId).filter((id): id is number => id !== null))];
    const groups = await this.prisma.group.findMany({ where: { id: { in: groupIds }, organizationId }, select: { id: true, name: true } });
    const groupName = new Map(groups.map((g) => [g.id, g.name]));
    return rows.map((r) => ({
      id: r.id, email: r.email, role: r.intendedRole, groupId: r.groupId, groupName: r.groupId ? groupName.get(r.groupId) ?? null : null,
      status: r.status === "PENDING" && r.expiresAt <= now ? "EXPIRED" : r.status,
      expiresAt: r.expiresAt, createdAt: r.createdAt, acceptedAt: r.acceptedAt,
    }));
  }

  async revoke(actor: Actor, organizationId: number, invitationId: number) {
    const { role } = await this.access.requireOrg(actor.userId, organizationId, "ADMIN", "TEACHER");
    const result = await this.prisma.organizationInvitation.updateMany({
      where: { id: invitationId, organizationId, status: "PENDING", ...(role === "ADMIN" ? {} : { invitedById: actor.userId }) },
      data: { status: "REVOKED" },
    });
    if (!result.count) throw new NotFoundException("Pending invitation not found");
    await this.events.record(actor, "ORG_INVITE_REVOKE", organizationId, { type: "OrganizationInvitation", id: invitationId });
    return { id: invitationId, status: "REVOKED" };
  }

  /** Revokes and re-issues with a fresh link (links cannot be recovered: only their hash is stored). */
  async resend(actor: Actor, organizationId: number, invitationId: number) {
    const { role } = await this.access.requireOrg(actor.userId, organizationId, "ADMIN", "TEACHER");
    const old = await this.prisma.organizationInvitation.findFirst({
      where: { id: invitationId, organizationId, status: "PENDING", ...(role === "ADMIN" ? {} : { invitedById: actor.userId }) },
    });
    if (!old) throw new NotFoundException("Pending invitation not found");
    await this.prisma.organizationInvitation.update({ where: { id: old.id }, data: { status: "REVOKED" } });
    const existing = await this.prisma.user.findUnique({ where: { email: old.email }, select: { id: true } });
    return this.issue(actor, organizationId, old.email, old.intendedRole, old.groupId, existing?.id ?? null);
  }

  /** Public preview for the accept page. Reveals no more than the link holder needs. */
  async preview(token: string) {
    const invitation = await this.findUsable(token);
    const [org, group] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: invitation.organizationId }, select: { name: true } }),
      invitation.groupId ? this.prisma.group.findUnique({ where: { id: invitation.groupId }, select: { name: true } }) : null,
    ]);
    return { organizationName: org.name, role: invitation.intendedRole, groupName: group?.name ?? null, emailHint: maskEmail(invitation.email), expiresAt: invitation.expiresAt };
  }

  /**
   * The role comes only from the stored invitation, never from the request, and the signed-in
   * account's email must match the invited address, so a link cannot be used to elevate or hijack.
   */
  async accept(actor: Actor, token: string) {
    const invitation = await this.findUsable(token);
    const user = await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { email: true, name: true } });
    if (!user || normalizeEmail(user.email) !== invitation.email) {
      throw new ForbiddenException("This invitation was sent to a different email address");
    }
    const org = await this.prisma.organization.findUnique({ where: { id: invitation.organizationId } });
    if (!org || org.status !== "ACTIVE") throw new BadRequestException(INVALID);

    const current = await this.prisma.organizationMembership.findUnique({ where: { organizationId_userId: { organizationId: org.id, userId: actor.userId } } });
    if (current?.status === "SUSPENDED") throw new ForbiddenException("Your membership of this organization is suspended");

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.organizationInvitation.updateMany({
        where: { id: invitation.id, status: "PENDING", expiresAt: { gt: new Date() } },
        data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedById: actor.userId },
      });
      if (!claimed.count) throw new BadRequestException(INVALID);

      // An active member keeps the (possibly higher) role they already hold.
      if (current?.status !== "ACTIVE") {
        await tx.organizationMembership.upsert({
          where: { organizationId_userId: { organizationId: org.id, userId: actor.userId } },
          create: { organizationId: org.id, userId: actor.userId, role: invitation.intendedRole, status: "ACTIVE", joinedAt: new Date() },
          update: { role: invitation.intendedRole, status: "ACTIVE", joinedAt: new Date() },
        });
      }
      if (invitation.groupId && invitation.intendedRole === "STUDENT") {
        const group = await tx.group.findFirst({ where: { id: invitation.groupId, organizationId: org.id, status: "ACTIVE" } });
        if (group) {
          await tx.groupStudent.upsert({
            where: { groupId_studentId: { groupId: group.id, studentId: actor.userId } },
            create: { groupId: group.id, studentId: actor.userId, addedById: invitation.invitedById },
            update: { status: "ACTIVE", joinedAt: new Date(), addedById: invitation.invitedById },
          });
        }
      }
    });

    await this.events.record(actor, "ORG_INVITE_ACCEPT", org.id, { type: "OrganizationInvitation", id: invitation.id, metadata: { role: invitation.intendedRole, groupId: invitation.groupId } });
    await this.events.notify(invitation.invitedById, "ORG_MEMBERSHIP_CHANGED", "Invitation accepted", `${user.name} accepted the invitation to ${org.name}.`);
    return { organizationId: org.id, role: invitation.intendedRole, groupId: invitation.groupId };
  }

  private async findUsable(token: string) {
    if (!token || token.length > 200) throw new NotFoundException(INVALID);
    const invitation = await this.prisma.organizationInvitation.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!invitation || invitation.status !== "PENDING") throw new NotFoundException(INVALID);
    if (invitation.expiresAt <= new Date()) {
      await this.prisma.organizationInvitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
      throw new NotFoundException(INVALID);
    }
    return invitation;
  }
}
