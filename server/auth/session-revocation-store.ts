import { logger as defaultLogger } from "../lib/logger";

type LoggerLike = Pick<typeof defaultLogger, "warn">;

export type SessionRevocationRecord = {
  jwtId: string;
  expiresAtMs: number;
};

export type SessionRevocationStore = {
  close?: () => Promise<void> | void;
  isRevoked: (jwtId: string) => Promise<boolean>;
  revoke: (record: SessionRevocationRecord) => Promise<void>;
};

const DEFAULT_REVOCATION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_REVOCATION_RECORDS = 25_000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

class MemorySessionRevocationStore implements SessionRevocationStore {
  private readonly revoked = new Map<string, number>();
  private sweepStopped = false;
  private readonly sweepHandle: NodeJS.Timeout;

  constructor() {
    this.sweepHandle = setInterval(() => {
      this.sweep(Date.now());
    }, SWEEP_INTERVAL_MS);
    this.sweepHandle.unref?.();
  }

  async isRevoked(jwtId: string): Promise<boolean> {
    const normalizedJwtId = normalizeJwtId(jwtId);
    if (!normalizedJwtId) {
      return false;
    }

    const expiresAtMs = this.revoked.get(normalizedJwtId);
    if (!expiresAtMs) {
      return false;
    }
    if (Date.now() >= expiresAtMs) {
      this.revoked.delete(normalizedJwtId);
      return false;
    }
    return true;
  }

  async revoke(record: SessionRevocationRecord): Promise<void> {
    const normalizedJwtId = normalizeJwtId(record.jwtId);
    if (!normalizedJwtId) {
      return;
    }

    const now = Date.now();
    const expiresAtMs = normalizeExpiry(record.expiresAtMs, now);
    this.revoked.delete(normalizedJwtId);
    this.revoked.set(normalizedJwtId, expiresAtMs);

    while (this.revoked.size > MAX_REVOCATION_RECORDS) {
      const oldest = this.revoked.keys().next();
      if (oldest.done) {
        break;
      }
      this.revoked.delete(oldest.value);
    }
  }

  close() {
    if (this.sweepStopped) {
      return;
    }
    this.sweepStopped = true;
    clearInterval(this.sweepHandle);
    this.revoked.clear();
  }

  private sweep(now: number) {
    for (const [jwtId, expiresAtMs] of this.revoked.entries()) {
      if (now >= expiresAtMs) {
        this.revoked.delete(jwtId);
      }
    }
  }
}

let activeStore: SessionRevocationStore = new MemorySessionRevocationStore();

function normalizeJwtId(jwtId: string): string {
  return String(jwtId || "").trim();
}

function normalizeExpiry(expiresAtMs: number, now = Date.now()): number {
  const parsed = Math.trunc(Number(expiresAtMs));
  if (Number.isFinite(parsed) && parsed > now) {
    return parsed;
  }
  return now + DEFAULT_REVOCATION_TTL_MS;
}

export function configureSessionRevocationStoreForRuntime(
  store: SessionRevocationStore | null | undefined,
  options: { logger?: LoggerLike } = {},
) {
  const previousStore = activeStore;
  activeStore = store ?? new MemorySessionRevocationStore();
  const sink = options.logger ?? defaultLogger;
  if (previousStore !== activeStore) {
    void Promise.resolve(previousStore.close?.()).catch((error) => {
      sink.warn("Failed to close previous session revocation store", {
        error: error instanceof Error ? error.message : "Unknown session revocation store close failure",
      });
    });
  }

  return () => {
    const storeToClose = activeStore;
    activeStore = new MemorySessionRevocationStore();
    void Promise.resolve(storeToClose.close?.()).catch((error) => {
      sink.warn("Failed to close session revocation store during shutdown", {
        error: error instanceof Error ? error.message : "Unknown session revocation store close failure",
      });
    });
  };
}

export async function isSessionJwtRevoked(jwtId: string | null | undefined): Promise<boolean> {
  const normalizedJwtId = normalizeJwtId(String(jwtId || ""));
  if (!normalizedJwtId) {
    return false;
  }
  return activeStore.isRevoked(normalizedJwtId);
}

export async function revokeSessionJwt(record: SessionRevocationRecord): Promise<void> {
  await activeStore.revoke(record);
}

export function resetSessionRevocationStoreForTests() {
  const storeToClose = activeStore;
  activeStore = new MemorySessionRevocationStore();
  void Promise.resolve(storeToClose.close?.()).catch(() => undefined);
}
