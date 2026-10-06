-- AlterEnum
ALTER TYPE "DocumentStatus" ADD VALUE 'READY';

-- AlterTable
ALTER TABLE "Document"
  ADD COLUMN "extractedText" TEXT,
  ADD COLUMN "processingError" TEXT;
