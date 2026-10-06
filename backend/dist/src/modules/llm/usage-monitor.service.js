"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsageMonitorService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
function createEmptyStats() {
    return {
        requestCount: 0,
        estimatedInputTokens: 0,
        estimatedOutputTokens: 0,
        failoverCount: 0,
        lastQuotaHitAt: null,
        lastRateLimitInfo: null,
    };
}
/**
 * Tracks per-provider request counts and ESTIMATED token usage purely for
 * backend terminal visibility and proactive failover - this is not billing
 * or an official quota system, and never claims to be. Any number here that
 * isn't sourced directly from a provider's own rate-limit headers is a rough
 * heuristic (see token-estimate.ts) and is always logged as "estimated".
 */
let UsageMonitorService = class UsageMonitorService {
    config;
    logger = new common_1.Logger("LLM Usage");
    stats = new Map();
    warnThreshold;
    highThreshold;
    criticalThreshold;
    quotaCooldownMs;
    constructor(config) {
        this.config = config;
        this.warnThreshold = this.config.get("LLM_USAGE_WARN_THRESHOLD", 80);
        this.highThreshold = this.config.get("LLM_USAGE_HIGH_THRESHOLD", 90);
        this.criticalThreshold = this.config.get("LLM_USAGE_CRITICAL_THRESHOLD", 95);
        this.quotaCooldownMs =
            this.config.get("LLM_QUOTA_COOLDOWN_SECONDS", 300) * 1000;
    }
    statsFor(providerId) {
        let entry = this.stats.get(providerId);
        if (!entry) {
            entry = createEmptyStats();
            this.stats.set(providerId, entry);
        }
        return entry;
    }
    /** A configured daily request budget for this provider, if any (0/undefined = unlimited). */
    requestLimitFor(providerId) {
        return this.config.get(`LLM_${providerId.toUpperCase()}_REQUEST_LIMIT`, 0);
    }
    recordAttempt(providerId, model) {
        const stats = this.statsFor(providerId);
        stats.requestCount += 1;
        this.logger.log(`[${providerId}/${model}] attempt #${stats.requestCount} this session`);
    }
    recordSuccess(providerId, model, estimatedInputTokens, estimatedOutputTokens) {
        const stats = this.statsFor(providerId);
        stats.estimatedInputTokens += estimatedInputTokens;
        stats.estimatedOutputTokens += estimatedOutputTokens;
        const estimatedTotal = stats.estimatedInputTokens + stats.estimatedOutputTokens;
        this.logger.log(`[${providerId}/${model}] OK - requests=${stats.requestCount}, ` +
            `estimated tokens: in=${stats.estimatedInputTokens} out=${stats.estimatedOutputTokens} total=${estimatedTotal} (ESTIMATED, not an official provider count)`);
        this.checkThreshold(providerId, stats);
    }
    recordRateLimitInfo(providerId, info) {
        const stats = this.statsFor(providerId);
        stats.lastRateLimitInfo = info;
        if (info.remainingRequests !== undefined && info.limitRequests) {
            const used = info.limitRequests - info.remainingRequests;
            this.logger.log(`[${providerId}] provider-reported rate limit: ${used}/${info.limitRequests} requests used` +
                (info.resetSeconds !== undefined
                    ? `, resets in ${info.resetSeconds}s`
                    : ""));
            this.checkThreshold(providerId, stats, {
                used,
                limit: info.limitRequests,
                officialSource: true,
            });
        }
    }
    recordQuotaHit(providerId) {
        const stats = this.statsFor(providerId);
        stats.lastQuotaHitAt = Date.now();
        this.logger.warn(`[${providerId}] quota/rate-limit error reported by provider - deprioritizing for the next ${this.quotaCooldownMs / 1000}s`);
    }
    recordFailure(providerId, kind, message) {
        this.logger.warn(`[${providerId}] failed (${kind}): ${message}`);
    }
    recordFailover(fromProviderId, toProviderId, reason) {
        const stats = this.statsFor(fromProviderId);
        stats.failoverCount += 1;
        this.logger.warn(toProviderId
            ? `[LLM Failover] ${fromProviderId} -> ${toProviderId} (reason: ${reason})`
            : `[LLM Failover] ${fromProviderId} -> none (no further providers configured; reason: ${reason})`);
    }
    /** True if this provider should be skipped proactively before even attempting it. */
    shouldSkip(providerId) {
        const stats = this.stats.get(providerId);
        if (!stats)
            return false;
        if (stats.lastQuotaHitAt !== null &&
            Date.now() - stats.lastQuotaHitAt < this.quotaCooldownMs) {
            return true;
        }
        if (stats.lastRateLimitInfo?.remainingRequests !== undefined &&
            stats.lastRateLimitInfo.remainingRequests <= 0) {
            return true;
        }
        const limit = this.requestLimitFor(providerId);
        if (limit > 0 && stats.requestCount >= limit) {
            return true;
        }
        return false;
    }
    checkThreshold(providerId, stats, override) {
        const limit = override?.limit ?? this.requestLimitFor(providerId);
        if (!limit || limit <= 0)
            return;
        const used = override?.used ?? stats.requestCount;
        const percent = (used / limit) * 100;
        const source = override?.officialSource
            ? "provider-reported"
            : "ESTIMATED, based on request count vs LLM_<PROVIDER>_REQUEST_LIMIT";
        if (percent >= this.criticalThreshold) {
            this.logger.error(`[${providerId}] CRITICAL usage: ${used}/${limit} (${percent.toFixed(1)}%) [${source}]`);
        }
        else if (percent >= this.highThreshold) {
            this.logger.warn(`[${providerId}] HIGH usage: ${used}/${limit} (${percent.toFixed(1)}%) [${source}]`);
        }
        else if (percent >= this.warnThreshold) {
            this.logger.warn(`[${providerId}] WARNING usage: ${used}/${limit} (${percent.toFixed(1)}%) [${source}]`);
        }
    }
};
exports.UsageMonitorService = UsageMonitorService;
exports.UsageMonitorService = UsageMonitorService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], UsageMonitorService);
