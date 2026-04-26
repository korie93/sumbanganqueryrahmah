import { createHash } from "node:crypto";
import { normalizeTwoFactorCode } from "./two-factor";

export type TwoFactorReplayPurpose = "disable" | "login" | "setup";

type TwoFactorReplayCacheEntry = {
  expiresAtMs: number;
};

type TwoFactorReplayCacheOptions = {
  maxEntries?: number;
  now?: () => number;
  ttlMs?: number;
};

type ConsumeTwoFactorReplayCodeParams = {
  code: string;
  purpose: TwoFactorReplayPurpose;
  subjectId: string;
};

const DEFAULT_TWO_FACTOR_REPLAY_TTL_MS = 120_000;
const DEFAULT_TWO_FACTOR_REPLAY_MAX_ENTRIES = 10_000;

function buildReplayKey(params: ConsumeTwoFactorReplayCodeParams) {
  const subjectId = String(params.subjectId || "").trim();
  const purpose = params.purpose;
  const code = normalizeTwoFactorCode(params.code);
  if (!subjectId || code.length !== 6) {
    return "";
  }

  const digest = createHash("sha256")
    .update(purpose)
    .update("\0")
    .update(subjectId)
    .update("\0")
    .update(code)
    .digest("base64url");

  return `${purpose}:${digest}`;
}

export class TwoFactorReplayCache {
  private readonly maxEntries: number;
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly entries = new Map<string, TwoFactorReplayCacheEntry>();

  constructor(options: TwoFactorReplayCacheOptions = {}) {
    this.maxEntries = Math.max(1, Math.floor(Number(options.maxEntries || DEFAULT_TWO_FACTOR_REPLAY_MAX_ENTRIES)));
    this.now = options.now ?? Date.now;
    this.ttlMs = Math.max(1_000, Math.floor(Number(options.ttlMs || DEFAULT_TWO_FACTOR_REPLAY_TTL_MS)));
  }

  get size() {
    return this.entries.size;
  }

  clear() {
    this.entries.clear();
  }

  sweep(nowMs = this.now()) {
    for (const [key, entry] of this.entries.entries()) {
      if (entry.expiresAtMs <= nowMs) {
        this.entries.delete(key);
      }
    }
  }

  consume(params: ConsumeTwoFactorReplayCodeParams) {
    const key = buildReplayKey(params);
    if (!key) {
      return false;
    }

    const nowMs = this.now();
    this.sweep(nowMs);

    const existing = this.entries.get(key);
    if (existing && existing.expiresAtMs > nowMs) {
      return false;
    }

    this.entries.set(key, { expiresAtMs: nowMs + this.ttlMs });
    this.trimToMaxEntries();
    return true;
  }

  private trimToMaxEntries() {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (!oldestKey) {
        break;
      }
      this.entries.delete(oldestKey);
    }
  }
}

const defaultTwoFactorReplayCache = new TwoFactorReplayCache();

export function consumeTwoFactorReplayCode(params: ConsumeTwoFactorReplayCodeParams) {
  return defaultTwoFactorReplayCache.consume(params);
}

export function resetTwoFactorReplayCacheForTests() {
  defaultTwoFactorReplayCache.clear();
}
