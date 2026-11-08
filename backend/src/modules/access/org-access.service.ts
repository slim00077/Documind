import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Group, GroupTeacherRole, OrgRole, OrganizationMembership } from "../../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export type OrgContext = {
  membership: OrganizationMembership;
  organizationId: number;
  role: OrgRole;
};

export type GroupContext = OrgContext & {
  group: Group;
  isOrgAdmin: boolean;
  /** Set when the user is an assigned teacher of this group. */
  teacherRole: GroupTeacherRole | null;
  isStudent: boolean;
  /** May manage students/requests/documents (org admin, lead or co-teacher). */
  canManage: boolean;
  /** May edit the group itself, assign teachers, rotate the code, archive (org admin or lead teacher). */
  canAdminister: boolean;
};

/**
 * Tenant isolation lives here. Every organization/group id coming from a client is resolved
 * against the caller's own ACTIVE membership; anything else is answered with the same 404 as a
 * nonexistent id, so ids cannot be probed across organizations. The platform ADMIN role grants
 * no automatic access to tenant data.
 */
@Injectable()
export class OrgAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Caller's ACTIVE membership in an ACTIVE organization, optionally restricted to roles. */
  async requireOrg(userId: number, organizationId: number, ...roles: OrgRole[]): Promise<OrgContext> {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { organizationId, userId, status: "ACTIVE", organization: { status: "ACTIVE" } },
    });
    if (!membership) throw new NotFoundException("Organization not found");
    if (roles.length && !roles.includes(membership.role)) {
      throw new ForbiddenException("Your role in this organization does not allow this action");
    }
    return { membership, organizationId, role: membership.role };
  }

  /** Resolves a group through the caller's membership of the group's own organization. */
  async requireGroup(userId: number, groupId: number): Promise<GroupContext> {
    const group = await this.prisma.group.findUnique({ where: { id: groupId } });
    if (!group) throw new NotFoundException("Group not found");

    let org: OrgContext;
    try {
      org = await this.requireOrg(userId, group.organizationId);
    } catch {
      throw new NotFoundException("Group not found");
    }

    const [teacher, student] = await Promise.all([
      this.prisma.groupTeacher.findUnique({ where: { groupId_teacherId: { groupId, teacherId: userId } } }),
      this.prisma.groupStudent.findUnique({ where: { groupId_studentId: { groupId, studentId: userId } } }),
    ]);

    const isOrgAdmin = org.role === "ADMIN";
    // An assigned teacher only counts while their organization role is still TEACHER/ADMIN.
    const teacherRole = org.role !== "STUDENT" ? teacher?.role ?? null : null;
    const isStudent = student?.status === "ACTIVE";

    return {
      ...org,
      group,
      isOrgAdmin,
      teacherRole,
      isStudent,
      canManage: isOrgAdmin || teacherRole !== null,
      canAdminister: isOrgAdmin || teacherRole === "LEAD_TEACHER",
    };
  }

  /** Group the caller may manage (members, requests, documents). */
  async requireGroupManager(userId: number, groupId: number, opts: { administer?: boolean } = {}): Promise<GroupContext> {
    const ctx = await this.requireGroup(userId, groupId);
    const allowed = opts.administer ? ctx.canAdminister : ctx.canManage;
    if (!allowed) throw new ForbiddenException("You do not manage this group");
    return ctx;
  }

  /** Group the caller can see at all: a manager or an active student of it. */
  async requireGroupMember(userId: number, groupId: number): Promise<GroupContext> {
    const ctx = await this.requireGroup(userId, groupId);
    if (!ctx.canManage && !ctx.isStudent) throw new NotFoundException("Group not found");
    return ctx;
  }

  /** Groups can only receive new members/documents while active (archived = read-only). */
  assertGroupOpen(group: Pick<Group, "status">): void {
    if (group.status !== "ACTIVE") throw new ForbiddenException("This group is archived and read-only");
  }
}
