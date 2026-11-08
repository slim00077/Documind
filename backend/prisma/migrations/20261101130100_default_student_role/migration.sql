-- Public registrations are students. Existing plain users become students;
-- ADMIN accounts are untouched. The legacy USER enum value is kept (unused).
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'STUDENT';
UPDATE "User" SET "role" = 'STUDENT' WHERE "role" = 'USER';
