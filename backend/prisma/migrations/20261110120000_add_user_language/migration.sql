-- Interface language preference (nullable: existing users keep their browser language until they pick one).
-- CreateEnum
CREATE TYPE "Language" AS ENUM ('EN', 'FR');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "language" "Language";
