-- CreateEnum
CREATE TYPE "Theme" AS ENUM ('LIGHT', 'DARK', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AiResponseStyle" AS ENUM ('CONCISE', 'BALANCED', 'DETAILED');

-- CreateEnum
CREATE TYPE "DocumentRole" AS ENUM ('VIEWER', 'EDITOR', 'OWNER');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN', 'REGISTER', 'DOCUMENT_UPLOAD', 'DOCUMENT_UPDATE', 'DOCUMENT_DELETE', 'PERMISSION_GRANT', 'PERMISSION_UPDATE', 'PERMISSION_REVOKE', 'USER_UPDATE', 'USER_DISABLE', 'USER_ENABLE', 'USER_DELETE', 'USER_ROLE_CHANGE', 'CATEGORY_CREATE', 'CATEGORY_UPDATE', 'CATEGORY_DELETE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "theme" "Theme" NOT NULL DEFAULT 'SYSTEM',
ADD COLUMN     "aiResponseStyle" "AiResponseStyle" NOT NULL DEFAULT 'BALANCED';

-- CreateTable
CREATE TABLE "DocumentPermission" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "DocumentRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "actorId" INTEGER,
    "actorName" TEXT,
    "actorEmail" TEXT,
    "action" "AuditAction" NOT NULL,
    "targetType" TEXT,
    "targetId" INTEGER,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentPermission_documentId_userId_key" ON "DocumentPermission"("documentId", "userId");

-- CreateIndex
CREATE INDEX "DocumentPermission_userId_idx" ON "DocumentPermission"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- AddForeignKey
ALTER TABLE "DocumentPermission" ADD CONSTRAINT "DocumentPermission_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPermission" ADD CONSTRAINT "DocumentPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
