import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { RateLimitInfo } from "./provider-error";

type ProviderStats = {
  requestCount: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  failoverCount: number;
  lastQuotaHitAt: number | null;
  lastRateLimitInfo: RateLimitInfo | null;
  // --- fields below feed the admin monitoring page ---
  successCount: number;
  failureCount: number;
  quotaHitCount: number;
  skipCount: number;
  totalLatencyMs: number;
  lastModel: string | null;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastError: string | null;
};

export type LlmEventType = "success" | "failure" | "quota" | "failover" | "skipped";

export type LlmEvent = {
  at: string;
  type: LlmEventType;
  providerId: string;
  model: string | null;
  detail: string;
};

const MAX_EVENTS = 60;

function createEmptyStats(): ProviderStats {
  return {
    requestCount: 0,
    estimatedInputTokens: 0,
    estimatedOutputTokens: 0,
    failoverCount: 0,
    lastQuotaHitAt: null,
    lastRateLimitInfo: null,
    successCount: 0,
    failureCount: 0,
    quotaHitCount: 0,
    skipCount: 0,
    totalLatencyMs: 0,
    lastModel: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
  };
}

/**
 * Tracks per-provider request counts and ESTIMATED token usage purely for
 * backend terminal visibility and proactive failover - this is not billing
 * or an official quota system, and never claims to be. Any number here that
 * isn't sourced directly from a provider's own rate-limit headers is a rough
 * heuristic (see token-estimate.ts) and is always logged as "estimated".
 */
@Injectable()
export class UsageMonitorService {
  private readonly logger = new Logger("LLM Usage");
  private readonly stats = new Map<string, ProviderStats>();
  private readonly events: LlmEvent[] = [];
  private readonly startedAt = Date.now();

  private readonly warnThreshold: number;
  private readonly highThreshold: number;
  private readonly criticalThreshold: number;
  private readonly quotaCooldownMs: number;

  constructor(private readonly config: ConfigService) {
    this.warnThreshold = this.config.get<number>("LLM_USAGE_WARN_THRESHOLD", 80);
    this.highThreshold = this.config.get<number>("LLM_USAGE_HIGH_THRESHOLD", 90);
    this.criticalThreshold = this.config.get<number>(
      "LLM_USAGE_CRITICAL_THRESHOLD",
      95,
    );
    this.quotaCooldownMs =
      this.config.get<number>("LLM_QUOTA_COOLDOWN_SECONDS", 300) * 1000;
  }

  private statsFor(providerId: string): ProviderStats {
    let entry = this.stats.get(providerId);
    if (!entry) {
      entry = createEmptyStats();
      this.stats.set(providerId, entry);
    }
    return entry;
  }

  /** A configured daily request budget for this provider, if any (0/undefined = unlimited). */
  private requestLimitFor(providerId: string): number {
    return this.config.get<number>(
      `LLM_${providerId.toUpperCase()}_REQUEST_LIMIT`,
      0,
    );
  }

  private pushEvent(
    type: LlmEventType,
    providerId: string,
    model: string | null,
    detail: string,
  ): void {
    this.events.unshift({
      at: new Date().toISOString(),
      type,
      providerId,
      model,
      detail: detail.slice(0, 300),
    });
    if (this.events.length > MAX_EVENTS) this.events.length = MAX_EVENTS;
  }

  recordAttempt(providerId: string, model: string): void {
    const stats = this.statsFor(providerId);
    stats.requestCount += 1;
    stats.lastModel = model;
    this.logger.log(
      `[${providerId}/${model}] attempt #${stats.requestCount} this session`,
    );
  }

  recordSuccess(
    providerId: string,
    model: string,
    estimatedInputTokens: number,
    estimatedOutputTokens: number,
    latencyMs = 0,
  ): void {
    const stats = this.statsFor(providerId);
    stats.successCount += 1;
    stats.totalLatencyMs += latencyMs;
    stats.lastSuccessAt = Date.now();
    this.pushEvent(
      "success",
      providerId,
      model,
      `~${estimatedInputTokens + estimatedOutputTokens} est. tokens, ${latencyMs}ms`,
    );
    stats.estimatedInputTokens += estimatedInputTokens;
    stats.estimatedOutputTokens += estimatedOutputTokens;
    const estimatedTotal = stats.estimatedInputTokens + stats.estimatedOutputTokens;

    this.logger.log(
      `[${providerId}/${model}] OK - requests=${stats.requestCount}, ` +
        `estimated tokens: in=${stats.estimatedInputTokens} out=${stats.estimatedOutputTokens} total=${estimatedTotal} (ESTIMATED, not an official provider count)`,
    );

    this.checkThreshold(providerId, stats);
  }

  recordRateLimitInfo(providerId: string, info: RateLimitInfo): void {
    const stats = this.statsFor(providerId);
    stats.lastRateLimitInfo = info;

    if (info.remainingRequests !== undefined && info.limitRequests) {
      const used = info.limitRequests - info.remainingRequests;
      this.logger.log(
        `[${providerId}] provider-reported rate limit: ${used}/${info.limitRequests} requests used` +
          (info.resetSeconds !== undefined
            ? `, resets in ${info.resetSeconds}s`
            : ""),
      );
      this.checkThreshold(providerId, stats, {
        used,
        limit: info.limitRequests,
        officialSource: true,
      });
    }
  }

  recordQuotaHit(providerId: string): void {
    const stats = this.statsFor(providerId);
    stats.lastQuotaHitAt = Date.now();
    stats.quotaHitCount += 1;
    stats.failureCount += 1;
    stats.lastFailureAt = Date.now();
    stats.lastError = "quota / rate limit";
    this.pushEvent("quota", providerId, stats.lastModel, "Quota or rate limit reached");
    this.logger.warn(
      `[${providerId}] quota/rate-limit error reported by provider - deprioritizing for the next ${this.quotaCooldownMs / 1000}s`,
    );
  }

  recordFailure(providerId: string, kind: string, message: string): void {
    const stats = this.statsFor(providerId);
    stats.failureCount += 1;
    stats.lastFailureAt = Date.now();
    stats.lastError = `${kind}: ${message}`.slice(0, 300);
    this.pushEvent("failure", providerId, stats.lastModel, `${kind}: ${message}`);
    this.logger.warn(`[${providerId}] failed (${kind}): ${message}`);
  }

  recordFailover(fromProviderId: string, toProviderId: string | null, reason: string): void {
    const stats = this.statsFor(fromProviderId);
    stats.failoverCount += 1;
    this.pushEvent(
      "failover",
      fromProviderId,
      stats.lastModel,
      `${toProviderId ? `Fell back to ${toProviderId}` : "No further providers"} (${reason})`,
    );
    this.logger.warn(
      toProviderId
        ? `[LLM Failover] ${fromProviderId} -> ${toProviderId} (reason: ${reason})`
        : `[LLM Failover] ${fromProviderId} -> none (no further providers configured; reason: ${reason})`,
    );
  }

  recordSkip(providerId: string): void {
    const stats = this.statsFor(providerId);
    stats.skipCount += 1;
    this.pushEvent("skipped", providerId, stats.lastModel, "Skipped: cooldown or usage limit reached");
  }

  /**
   * Point-in-time view for the admin monitoring page. Everything is held in
   * memory since the last backend start, and token numbers are estimates.
   */
  snapshot(chain: { id: string; model: string }[]) {
    const providers = chain.map(({ id, model }) => {
      const stats = this.stats.get(id) ?? createEmptyStats();
      const limit = this.requestLimitFor(id);
      const cooldownUntil =
        stats.lastQuotaHitAt !== null &&
        Date.now() - stats.lastQuotaHitAt < this.quotaCooldownMs
          ? new Date(stats.lastQuotaHitAt + this.quotaCooldownMs).toISOString()
          : null;

      let status: "healthy" | "degraded" | "limited" | "idle" | "disabled";
      if (id === "none") status = "disabled";
      else if (this.shouldSkip(id)) status = "limited";
      else if (
        stats.lastFailureAt !== null &&
        (stats.lastSuccessAt === null || stats.lastFailureAt > stats.lastSuccessAt)
      )
        status = "degraded";
      else if (stats.requestCount === 0) status = "idle";
      else status = "healthy";

      return {
        id,
        model: stats.lastModel ?? model,
        status,
        requests: stats.requestCount,
        successes: stats.successCount,
        errors: stats.failureCount,
        quotaHits: stats.quotaHitCount,
        fallbacksFrom: stats.failoverCount,
        skipped: stats.skipCount,
        estimatedInputTokens: stats.estimatedInputTokens,
        estimatedOutputTokens: stats.estimatedOutputTokens,
        avgLatencyMs: stats.successCount
          ? Math.round(stats.totalLatencyMs / stats.successCount)
          : null,
        requestLimit: limit > 0 ? limit : null,
        cooldownUntil,
        lastSuccessAt: stats.lastSuccessAt ? new Date(stats.lastSuccessAt).toISOString() : null,
        lastFailureAt: stats.lastFailureAt ? new Date(stats.lastFailureAt).toISOString() : null,
        lastError: stats.lastError,
        providerReportedRateLimit: stats.lastRateLimitInfo,
      };
    });

    const sum = (pick: (p: (typeof providers)[number]) => number) =>
      providers.reduce((total, p) => total + pick(p), 0);

    return {
      since: new Date(this.startedAt).toISOString(),
      totals: {
        requests: sum((p) => p.requests),
        successes: sum((p) => p.successes),
        errors: sum((p) => p.errors),
        fallbacks: sum((p) => p.fallbacksFrom),
        estimatedInputTokens: sum((p) => p.estimatedInputTokens),
        estimatedOutputTokens: sum((p) => p.estimatedOutputTokens),
      },
      providers,
      recentEvents: [...this.events],
    };
  }

  /** True if this provider should be skipped proactively before even attempting it. */
  shouldSkip(providerId: string): boolean {
    const stats = this.stats.get(providerId);
    if (!stats) return false;

    if (
      stats.lastQuotaHitAt !== null &&
      Date.now() - stats.lastQuotaHitAt < this.quotaCooldownMs
    ) {
      return true;
    }

    if (
      stats.lastRateLimitInfo?.remainingRequests !== undefined &&
      stats.lastRateLimitInfo.remainingRequests <= 0
    ) {
      return true;
    }

    const limit = this.requestLimitFor(providerId);
    if (limit > 0 && stats.requestCount >= limit) {
      return true;
    }

    return false;
  }

  private checkThreshold(
    providerId: string,
    stats: ProviderStats,
    override?: { used: number; limit: number; officialSource: boolean },
  ): void {
    const limit = override?.limit ?? this.requestLimitFor(providerId);
    if (!limit || limit <= 0) return;

    const used = override?.used ?? stats.requestCount;
    const percent = (used / limit) * 100;
    const source = override?.officialSource
      ? "provider-reported"
      : "ESTIMATED, based on request count vs LLM_<PROVIDER>_REQUEST_LIMIT";

    if (percent >= this.criticalThreshold) {
      this.logger.error(
        `[${providerId}] CRITICAL usage: ${used}/${limit} (${percent.toFixed(1)}%) [${source}]`,
      );
    } else if (percent >= this.highThreshold) {
      this.logger.warn(
        `[${providerId}] HIGH usage: ${used}/${limit} (${percent.toFixed(1)}%) [${source}]`,
      );
    } else if (percent >= this.warnThreshold) {
      this.logger.warn(
        `[${providerId}] WARNING usage: ${used}/${limit} (${percent.toFixed(1)}%) [${source}]`,
      );
    }
  }
}
