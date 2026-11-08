-- Additive: new enum values only. They cannot be used in the same transaction
-- that adds them, so data conversion lives in the next migration.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'STUDENT';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'TEACHER';
