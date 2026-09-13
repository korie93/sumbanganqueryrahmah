import { createHash } from "node:crypto";
import { normalizeTwoFactorCode } from "./two-factor";

export type TwoFactorReplayPurpose = "disable" | "login" | "setup" | "challenge";

type TwoFactorReplayCacheEntry = {
  expiresAtMs: number;
};

type TwoFactorReplayCacheOptions = {
  maxEntries?: number;
  now?: () => number;
  sweepMinIntervalMs?: number;
  sweepThresholdEntries?: number;
  ttlMs?: number;
};

export type ConsumeTwoFactorReplayCodeParams = {
  code: string;
  purpose: TwoFactorReplayPurpose;
  subjectId: string;
};

export type TwoFactorReplayStore = {
  close?: () => Promise<void> | void;
  consume: (params: ConsumeTwoFactorReplayCodeParams) => Promise<boolean> | boolean;
};

const DEFAULT_TWO_FACTOR_REPLAY_TTL_MS = 120_000;
export const TWO_FACTOR_CHALLENGE_REPLAY_TTL_MS = 5 * 60 * 1_000;
const DEFAULT_TWO_FACTOR_REPLAY_MAX_ENTRIES = 10_000;
const DEFAULT_TWO_FACTOR_REPLAY_SWEEP_INTERVAL_MS = 30_000;
const DEFAULT_TWO_FACTOR_REPLAY_SWEEP_THRESHOLD_ENTRIES = 1_000;

export function buildTwoFactorReplayKey(params: ConsumeTwoFactorReplayCodeParams) {
  const subjectId = String(params.subjectId || "").trim();
  const purpose = params.purpose;
  const code = purpose === "challenge"
    ? (/^[0-9a-f-]{36}$/i.test(params.code) ? params.code : null)
    : normalizeTwoFactorCode(params.code);
  if (!subjectId || !code) {
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
  private readonly sweepMinIntervalMs: number;
  private readonly sweepThresholdEntries: number;
  private readonly ttlMs: number;
  private readonly entries = new Map<string, TwoFactorReplayCacheEntry>();
  private nextSweepAtMs = 0;

  constructor(options: TwoFactorReplayCacheOptions = {}) {
    this.maxEntries = Math.max(1, Math.floor(Number(options.maxEntries || DEFAULT_TWO_FACTOR_REPLAY_MAX_ENTRIES)));
    this.now = options.now ?? Date.now;
    this.sweepMinIntervalMs = Math.max(
      1_000,
      Math.floor(Number(options.sweepMinIntervalMs || DEFAULT_TWO_FACTOR_REPLAY_SWEEP_INTERVAL_MS)),
    );
    this.sweepThresholdEntries = Math.max(
      1,
      Math.floor(Number(options.sweepThresholdEntries || DEFAULT_TWO_FACTOR_REPLAY_SWEEP_THRESHOLD_ENTRIES)),
    );
    this.ttlMs = Math.max(1_000, Math.floor(Number(options.ttlMs || DEFAULT_TWO_FACTOR_REPLAY_TTL_MS)));
  }

  get size() {
    return this.entries.size;
  }

  clear() {
    this.entries.clear();
    this.nextSweepAtMs = 0;
  }

  sweep(nowMs = this.now()) {
    for (const [key, entry] of this.entries.entries()) {
      if (entry.expiresAtMs <= nowMs) {
        this.entries.delete(key);
      }
    }
    this.nextSweepAtMs = nowMs + this.sweepMinIntervalMs;
  }

  consume(params: ConsumeTwoFactorReplayCodeParams) {
    const key = buildTwoFactorReplayKey(params);
    if (!key) {
      return false;
    }

    const nowMs = this.now();
    this.sweepExpiredWhenDue(nowMs);

    const existing = this.entries.get(key);
    if (existing && existing.expiresAtMs > nowMs) {
      return false;
    }

    // Never evict an unexpired replay marker to admit a new code/challenge.
    if (this.entries.size >= this.maxEntries && !existing) {
      this.sweep(nowMs);
      if (this.entries.size >= this.maxEntries) return false;
    }
    this.entries.set(key, { expiresAtMs: nowMs + (params.purpose === "challenge"
      ? TWO_FACTOR_CHALLENGE_REPLAY_TTL_MS : this.ttlMs) });
    return true;
  }

  private sweepExpiredWhenDue(nowMs: number) {
    if (this.entries.size < this.sweepThresholdEntries && nowMs < this.nextSweepAtMs) {
      return;
    }

    this.sweep(nowMs);
  }

}

const defaultTwoFactorReplayCache = new TwoFactorReplayCache();
let activeTwoFactorReplayStore: TwoFactorReplayStore = defaultTwoFactorReplayCache;

export function configureTwoFactorReplayStoreForRuntime(store: TwoFactorReplayStore | null) {
  activeTwoFactorReplayStore = store ?? defaultTwoFactorReplayCache;
  return () => {
    if (activeTwoFactorReplayStore === store) {
      activeTwoFactorReplayStore = defaultTwoFactorReplayCache;
    }
    void Promise.resolve(store?.close?.()).catch(() => undefined);
  };
}

export async function consumeTwoFactorReplayCode(params: ConsumeTwoFactorReplayCodeParams) {
  return activeTwoFactorReplayStore.consume(params);
}

export function resetTwoFactorReplayCacheForTests() {
  activeTwoFactorReplayStore = defaultTwoFactorReplayCache;
  defaultTwoFactorReplayCache.clear();
}
