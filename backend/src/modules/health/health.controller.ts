import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
import type { Response } from "express";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Unauthenticated health endpoints used by Render, Docker HEALTHCHECK, Kubernetes probes and
 * the CD pipeline smoke test. They expose no user data and never call an AI provider.
 */
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: the Node process is up. Deliberately independent of the database. */
  @Get("live")
  live() {
    return { status: "ok", uptimeSeconds: Math.round(process.uptime()) };
  }

  /** Readiness: the API can serve traffic (PostgreSQL reachable, pgvector installed). */
  @Get()
  async ready(@Res({ passthrough: true }) res: Response) {
    let database: "up" | "down" = "down";
    let pgvector: string | null = null;
    try {
      const rows = await this.prisma.$queryRaw<{ extversion: string }[]>`
        SELECT extversion FROM pg_extension WHERE extname = 'vector'`;
      database = "up";
      pgvector = rows[0]?.extversion ?? null;
    } catch {
      database = "down";
    }

    const healthy = database === "up" && pgvector !== null;
    if (!healthy) res.status(HttpStatus.SERVICE_UNAVAILABLE);

    return {
      status: healthy ? "ok" : "error",
      database,
      pgvector: pgvector ?? "missing",
      uptimeSeconds: Math.round(process.uptime()),
      memoryRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      environment: process.env.NODE_ENV ?? "development",
      version: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? process.env.APP_VERSION ?? "local",
    };
  }
}
