import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../../generated/prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error("DATABASE_URL is not defined");
    }

    const pool = new Pool({ connectionString: databaseUrl });
    const adapter = new PrismaPg(pool);

    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.ensureFullTextIndex();
  }

  // Guards the custom GIN index used by hybrid search: Prisma's schema can't
  // express it, so a generated migration could silently drop it.
  private async ensureFullTextIndex(): Promise<void> {
    await this.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "DocumentChunk_content_fts_idx" ON "DocumentChunk" USING GIN (to_tsvector('simple', "content"))`,
    );
    await this.ensureOrganizationIndexes();
  }

  // Partial unique indexes (one PENDING request/invitation per target) that Prisma cannot model.
  private async ensureOrganizationIndexes(): Promise<void> {
    const statements = [
      `CREATE UNIQUE INDEX IF NOT EXISTS "GroupJoinRequest_pending_uniq" ON "GroupJoinRequest" ("groupId", "studentId") WHERE "status" = 'PENDING'`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationJoinRequest_pending_uniq" ON "OrganizationJoinRequest" ("organizationId", "userId") WHERE "status" = 'PENDING'`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationInvitation_pending_uniq" ON "OrganizationInvitation" ("organizationId", "email", "intendedRole", COALESCE("groupId", 0)) WHERE "status" = 'PENDING'`,
    ];
    for (const statement of statements) await this.$executeRawUnsafe(statement);
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
