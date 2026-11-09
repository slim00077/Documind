import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
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

    // Neon Free has a small connection budget and suspends idle compute: keep the pool small and
    // short-lived. SSL comes from the URL (?sslmode=require). Settings are env-overridable.
    const pool = new Pool({
      connectionString: databaseUrl,
      max: Number(process.env.DB_POOL_MAX ?? 5),
      idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_MS ?? 10_000),
      connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS ?? 30_000),
    });
    // Without a handler, an idle client dropped by the server (compute suspend, restart) is an
    // unhandled 'error' event that terminates the process.
    pool.on("error", (error) =>
      new Logger(PrismaService.name).warn(`Idle database connection dropped: ${error.message}`),
    );
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
