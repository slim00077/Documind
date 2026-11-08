import { DocumentRole, Prisma } from "../../../generated/prisma/client";
import { currentWorkspace } from "./workspace-context";

/**
 * Single source of truth for "who may read a document". Every read path (listing, open by id,
 * search SQL, assistant retrieval, agent, insights, comparison, conversations) goes through here,
 * so a permission change takes effect everywhere at once. Nothing is cached.
 *
 * Paths to access:
 *  1. owner
 *  2. a DocumentPermission row (existing, direct sharing)
 *  3. GROUP: shared with a group the user is an active student/teacher of (org membership must be active)
 *  4. ORGANIZATION: org-wide document, user is an active member of that org
 *  5. org administrators can read ORGANIZATION/GROUP documents of their own organization (read-only)
 *
 * Archived groups are READ-ONLY: members keep read access, nothing new can be shared/joined.
 * Suspended/removed members, suspended organizations and removed students lose access immediately.
 */
const GROUP_VISIBLE = ["ACTIVE", "ARCHIVED"] as const;

function groupPath(userId: number, organizationId?: number): Prisma.DocumentWhereInput {
  return {
    scope: "GROUP",
    ...(organizationId ? { organizationId } : {}),
    groupShares: {
      some: {
        group: {
          status: { in: [...GROUP_VISIBLE] },
          organization: { status: "ACTIVE", memberships: { some: { userId, status: "ACTIVE" } } },
          OR: [
            { students: { some: { studentId: userId, status: "ACTIVE" } } },
            { teachers: { some: { teacherId: userId } } },
          ],
        },
      },
    },
  };
}

function orgPath(userId: number, organizationId?: number): Prisma.DocumentWhereInput {
  return {
    scope: "ORGANIZATION",
    ...(organizationId ? { organizationId } : {}),
    organization: { status: "ACTIVE", memberships: { some: { userId, status: "ACTIVE" } } },
  };
}

function adminPath(userId: number, organizationId?: number): Prisma.DocumentWhereInput {
  return {
    scope: { in: ["ORGANIZATION", "GROUP"] },
    ...(organizationId ? { organizationId } : {}),
    organization: { status: "ACTIVE", memberships: { some: { userId, status: "ACTIVE", role: "ADMIN" } } },
  };
}

/** Full permission check: any path. Use for opening a specific document by id. */
export function anyAccessWhere(userId: number): Prisma.DocumentWhereInput {
  return {
    OR: [
      { userId },
      { permissions: { some: { userId } } },
      groupPath(userId),
      orgPath(userId),
      adminPath(userId),
    ],
  };
}

/**
 * What "my documents" means right now. Personal workspace: owned + directly shared (the
 * pre-existing behaviour, so nothing changes for independent users). Organization workspace:
 * only that organization's group/org documents the user may read.
 * Always a subset of anyAccessWhere.
 */
export function workspaceAccessWhere(userId: number): Prisma.DocumentWhereInput {
  const { organizationId } = currentWorkspace(userId);
  if (organizationId === null) {
    return { OR: [{ userId }, { permissions: { some: { userId } } }] };
  }
  return {
    OR: [
      groupPath(userId, organizationId),
      orgPath(userId, organizationId),
      adminPath(userId, organizationId),
      { userId, organizationId, scope: { in: ["ORGANIZATION", "GROUP"] } },
    ],
  };
}

function groupSql(userId: number, orgId: number | null, alias: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`(${alias}."scope" = 'GROUP' ${orgId ? Prisma.sql`AND ${alias}."organizationId" = ${orgId}` : Prisma.empty} AND EXISTS (
    SELECT 1 FROM "DocumentGroupShare" s
    JOIN "Group" g ON g.id = s."groupId" AND g."status" IN ('ACTIVE','ARCHIVED')
    JOIN "Organization" o ON o.id = g."organizationId" AND o."status" = 'ACTIVE'
    JOIN "OrganizationMembership" m ON m."organizationId" = o.id AND m."userId" = ${userId} AND m."status" = 'ACTIVE'
    WHERE s."documentId" = ${alias}.id AND (
      EXISTS (SELECT 1 FROM "GroupStudent" gs WHERE gs."groupId" = g.id AND gs."studentId" = ${userId} AND gs."status" = 'ACTIVE')
      OR EXISTS (SELECT 1 FROM "GroupTeacher" gt WHERE gt."groupId" = g.id AND gt."teacherId" = ${userId})
    )
  ))`;
}

function orgSql(userId: number, orgId: number | null, alias: Prisma.Sql, adminOnly: boolean): Prisma.Sql {
  return Prisma.sql`(${adminOnly ? Prisma.sql`${alias}."scope" IN ('ORGANIZATION','GROUP')` : Prisma.sql`${alias}."scope" = 'ORGANIZATION'`}
    ${orgId ? Prisma.sql`AND ${alias}."organizationId" = ${orgId}` : Prisma.empty} AND EXISTS (
    SELECT 1 FROM "Organization" o
    JOIN "OrganizationMembership" m ON m."organizationId" = o.id AND m."userId" = ${userId} AND m."status" = 'ACTIVE'
      ${adminOnly ? Prisma.sql`AND m."role" = 'ADMIN'` : Prisma.empty}
    WHERE o.id = ${alias}."organizationId" AND o."status" = 'ACTIVE'
  ))`;
}

/**
 * SQL twin of the above for the raw hybrid-search query. `explicitIds` = the caller named specific
 * documents (still permission-checked, but not narrowed to the workspace).
 */
export function accessSql(userId: number, options: { alias?: string; explicit?: boolean } = {}): Prisma.Sql {
  const alias = Prisma.raw(`${options.alias ?? "d"}`);
  const direct = Prisma.sql`${alias}."userId" = ${userId} OR EXISTS (
    SELECT 1 FROM "DocumentPermission" dp WHERE dp."documentId" = ${alias}.id AND dp."userId" = ${userId}
  )`;
  const { organizationId } = currentWorkspace(userId);

  if (options.explicit) {
    return Prisma.sql`(${direct} OR ${groupSql(userId, null, alias)} OR ${orgSql(userId, null, alias, false)} OR ${orgSql(userId, null, alias, true)})`;
  }
  if (organizationId === null) return Prisma.sql`(${direct})`;
  return Prisma.sql`(${groupSql(userId, organizationId, alias)} OR ${orgSql(userId, organizationId, alias, false)} OR ${orgSql(userId, organizationId, alias, true)}
    OR (${alias}."userId" = ${userId} AND ${alias}."organizationId" = ${organizationId} AND ${alias}."scope" IN ('ORGANIZATION','GROUP')))`;
}

/**
 * Role the user holds on an (already access-checked) document. Organization/group access is always
 * read-only (VIEWER): editing stays with the owner or an explicit EDITOR DocumentPermission.
 */
export function resolveDocumentRole(
  userId: number,
  document: { userId: number },
  permissionRole?: DocumentRole | null,
): "OWNER" | DocumentRole {
  if (document.userId === userId) return "OWNER";
  return permissionRole ?? DocumentRole.VIEWER;
}
