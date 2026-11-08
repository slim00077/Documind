-- CreateEnum
CREATE TYPE "DocumentScope" AS ENUM ('PERSONAL', 'ORGANIZATION', 'GROUP');

-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('SCHOOL', 'UNIVERSITY', 'TRAINING_CENTER', 'COMPANY', 'OTHER');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('ADMIN', 'TEACHER', 'STUDENT');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "GroupStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GroupTeacherRole" AS ENUM ('LEAD_TEACHER', 'CO_TEACHER');

-- CreateEnum
CREATE TYPE "GroupStudentStatus" AS ENUM ('ACTIVE', 'LEFT', 'REMOVED');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'ORG_CREATE';
ALTER TYPE "AuditAction" ADD VALUE 'ORG_UPDATE';
ALTER TYPE "AuditAction" ADD VALUE 'ORG_STATUS_CHANGE';
ALTER TYPE "AuditAction" ADD VALUE 'ORG_MEMBER_ADD';
ALTER TYPE "AuditAction" ADD VALUE 'ORG_MEMBER_UPDATE';
ALTER TYPE "AuditAction" ADD VALUE 'ORG_MEMBER_REMOVE';
ALTER TYPE "AuditAction" ADD VALUE 'ORG_INVITE_CREATE';
ALTER TYPE "AuditAction" ADD VALUE 'ORG_INVITE_REVOKE';
ALTER TYPE "AuditAction" ADD VALUE 'ORG_INVITE_ACCEPT';
ALTER TYPE "AuditAction" ADD VALUE 'ORG_JOIN_REQUEST';
ALTER TYPE "AuditAction" ADD VALUE 'ORG_JOIN_REVIEW';
ALTER TYPE "AuditAction" ADD VALUE 'GROUP_CREATE';
ALTER TYPE "AuditAction" ADD VALUE 'GROUP_UPDATE';
ALTER TYPE "AuditAction" ADD VALUE 'GROUP_ARCHIVE';
ALTER TYPE "AuditAction" ADD VALUE 'GROUP_CODE_ROTATE';
ALTER TYPE "AuditAction" ADD VALUE 'GROUP_TEACHER_ASSIGN';
ALTER TYPE "AuditAction" ADD VALUE 'GROUP_TEACHER_REMOVE';
ALTER TYPE "AuditAction" ADD VALUE 'GROUP_STUDENT_ADD';
ALTER TYPE "AuditAction" ADD VALUE 'GROUP_STUDENT_REMOVE';
ALTER TYPE "AuditAction" ADD VALUE 'GROUP_JOIN_REQUEST';
ALTER TYPE "AuditAction" ADD VALUE 'GROUP_JOIN_REVIEW';
ALTER TYPE "AuditAction" ADD VALUE 'DOCUMENT_SHARE_GROUP';
ALTER TYPE "AuditAction" ADD VALUE 'DOCUMENT_UNSHARE_GROUP';
ALTER TYPE "AuditAction" ADD VALUE 'DOCUMENT_SHARE_ORG';

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "organizationId" INTEGER;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "organizationId" INTEGER,
ADD COLUMN     "scope" "DocumentScope" NOT NULL DEFAULT 'PERSONAL';

-- CreateTable
CREATE TABLE "Organization" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "logo" TEXT,
    "organizationType" "OrganizationType" NOT NULL DEFAULT 'OTHER',
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinCode" TEXT,
    "isDiscoverable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMembership" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "OrgRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "subject" TEXT,
    "academicYear" TEXT,
    "joinCode" TEXT NOT NULL,
    "status" "GroupStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupTeacher" (
    "groupId" INTEGER NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "role" "GroupTeacherRole" NOT NULL DEFAULT 'CO_TEACHER',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupTeacher_pkey" PRIMARY KEY ("groupId","teacherId")
);

-- CreateTable
CREATE TABLE "GroupStudent" (
    "groupId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "status" "GroupStudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupStudent_pkey" PRIMARY KEY ("groupId","studentId")
);

-- CreateTable
CREATE TABLE "GroupJoinRequest" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "reviewedById" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationJoinRequest" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "reviewedById" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationInvitation" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "intendedRole" "OrgRole" NOT NULL,
    "groupId" INTEGER,
    "tokenHash" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invitedById" INTEGER NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentGroupShare" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,
    "sharedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentGroupShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_joinCode_key" ON "Organization"("joinCode");

-- CreateIndex
CREATE INDEX "OrganizationMembership_userId_status_idx" ON "OrganizationMembership"("userId", "status");

-- CreateIndex
CREATE INDEX "OrganizationMembership_organizationId_role_status_idx" ON "OrganizationMembership"("organizationId", "role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMembership_organizationId_userId_key" ON "OrganizationMembership"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Group_joinCode_key" ON "Group"("joinCode");

-- CreateIndex
CREATE INDEX "Group_organizationId_status_idx" ON "Group"("organizationId", "status");

-- CreateIndex
CREATE INDEX "GroupTeacher_teacherId_idx" ON "GroupTeacher"("teacherId");

-- CreateIndex
CREATE INDEX "GroupStudent_studentId_status_idx" ON "GroupStudent"("studentId", "status");

-- CreateIndex
CREATE INDEX "GroupJoinRequest_groupId_status_idx" ON "GroupJoinRequest"("groupId", "status");

-- CreateIndex
CREATE INDEX "GroupJoinRequest_studentId_status_idx" ON "GroupJoinRequest"("studentId", "status");

-- CreateIndex
CREATE INDEX "OrganizationJoinRequest_organizationId_status_idx" ON "OrganizationJoinRequest"("organizationId", "status");

-- CreateIndex
CREATE INDEX "OrganizationJoinRequest_userId_status_idx" ON "OrganizationJoinRequest"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationInvitation_tokenHash_key" ON "OrganizationInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "OrganizationInvitation_organizationId_status_idx" ON "OrganizationInvitation"("organizationId", "status");

-- CreateIndex
CREATE INDEX "OrganizationInvitation_email_idx" ON "OrganizationInvitation"("email");

-- CreateIndex
CREATE INDEX "DocumentGroupShare_groupId_idx" ON "DocumentGroupShare"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentGroupShare_documentId_groupId_key" ON "DocumentGroupShare"("documentId", "groupId");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Document_organizationId_scope_idx" ON "Document"("organizationId", "scope");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupTeacher" ADD CONSTRAINT "GroupTeacher_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupTeacher" ADD CONSTRAINT "GroupTeacher_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupStudent" ADD CONSTRAINT "GroupStudent_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupStudent" ADD CONSTRAINT "GroupStudent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupJoinRequest" ADD CONSTRAINT "GroupJoinRequest_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupJoinRequest" ADD CONSTRAINT "GroupJoinRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationJoinRequest" ADD CONSTRAINT "OrganizationJoinRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationJoinRequest" ADD CONSTRAINT "OrganizationJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentGroupShare" ADD CONSTRAINT "DocumentGroupShare_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentGroupShare" ADD CONSTRAINT "DocumentGroupShare_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Hand-written additions (Prisma cannot model these). All purely additive.
-- ---------------------------------------------------------------------------

-- At most one PENDING request / invitation per target; history rows are unrestricted.
CREATE UNIQUE INDEX IF NOT EXISTS "GroupJoinRequest_pending_uniq"
  ON "GroupJoinRequest" ("groupId", "studentId") WHERE "status" = 'PENDING';
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationJoinRequest_pending_uniq"
  ON "OrganizationJoinRequest" ("organizationId", "userId") WHERE "status" = 'PENDING';
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationInvitation_pending_uniq"
  ON "OrganizationInvitation" ("organizationId", "email", "intendedRole", COALESCE("groupId", 0)) WHERE "status" = 'PENDING';

-- An ORGANIZATION-scoped document must name its organization (existing rows are all PERSONAL).
ALTER TABLE "Document" ADD CONSTRAINT "Document_scope_org_chk"
  CHECK ("scope" = 'PERSONAL' OR "organizationId" IS NOT NULL);
