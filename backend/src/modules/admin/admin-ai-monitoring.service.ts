import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { MultiProviderLlmService } from "../llm/multi-provider-llm.service";
import { UsageMonitorService } from "../llm/usage-monitor.service";
import { MessageRole } from "../../../generated/prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AdminAiMonitoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usageMonitor: UsageMonitorService,
    private readonly llm: MultiProviderLlmService,
  ) {}

  async getSnapshot() {
    const now = Date.now();
    const since24h = new Date(now - DAY_MS);
    const since7d = new Date(now - 7 * DAY_MS);

    const [answers24h, answers7d, answersTotal, insightsGenerated, indexedChunks] =
      await Promise.all([
        this.prisma.message.count({
          where: { role: MessageRole.ASSISTANT, createdAt: { gte: since24h } },
        }),
        this.prisma.message.count({
          where: { role: MessageRole.ASSISTANT, createdAt: { gte: since7d } },
        }),
        this.prisma.message.count({ where: { role: MessageRole.ASSISTANT } }),
        this.prisma.document.count({ where: { insightsGeneratedAt: { not: null } } }),
        this.prisma.documentChunk.count(),
      ]);

    return {
      // In memory since the last backend start; tokens are estimates (~4 chars/token).
      live: this.usageMonitor.snapshot(this.llm.getChain()),
      // Persisted in the database, survives restarts.
      persisted: {
        assistantAnswersLast24h: answers24h,
        assistantAnswersLast7d: answers7d,
        assistantAnswersTotal: answersTotal,
        documentsWithInsights: insightsGenerated,
        indexedChunks,
      },
    };
  }
}
