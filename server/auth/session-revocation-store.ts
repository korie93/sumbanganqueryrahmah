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
const MAX_CONSECUTIVE_SWEEP_FAILURES = 5;

type SweepableSessionRevocationStore = {
  sweepExpired: (now: number) => void;
};

class MemorySessionRevocationSweepOrchestrator {
  private readonly stores = new Set<SweepableSessionRevocationStore>();
  private intervalHandle: NodeJS.Timeout | null = null;
  private sweepInProgress = false;
  private consecutiveFailures = 0;
  private suspendedUntilMs = 0;

  register(store: SweepableSessionRevocationStore) {
    this.stores.add(store);
    this.start();
  }

  unregister(store: SweepableSessionRevocationStore) {
    this.stores.delete(store);
    if (this.stores.size === 0) {
      this.stop();
    }
  }

  trigger(now = Date.now()) {
    if (this.sweepInProgress) {
      return;
    }
    if (this.suspendedUntilMs > now) {
      return;
    }

    this.sweepInProgress = true;
    let failed = false;
    try {
      for (const store of Array.from(this.stores)) {
        try {
          store.sweepExpired(now);
        } catch (error) {
          failed = true;
          logSessionRevocationStoreCloseFailure(
            defaultLogger,
            "Session revocation memory sweep failed",
            error,
          );
        }
      }
    } finally {
      if (failed) {
        this.consecutiveFailures += 1;
        if (this.consecutiveFailures >= MAX_CONSECUTIVE_SWEEP_FAILURES) {
          this.suspendedUntilMs = now + SWEEP_INTERVAL_MS;
          this.consecutiveFailures = 0;
          defaultLogger.warn("Session revocation memory sweep temporarily suspended", {
            suspendedUntilMs: this.suspendedUntilMs,
          });
        }
      } else {
        this.consecutiveFailures = 0;
        this.suspendedUntilMs = 0;
      }
      this.sweepInProgress = false;
    }
  }

  getDiagnostics() {
    return {
      activeMemoryStores: this.stores.size,
      sweepActive: this.intervalHandle !== null,
      sweepInProgress: this.sweepInProgress,
      consecutiveFailures: this.consecutiveFailures,
      sweepSuspended: this.suspendedUntilMs > Date.now(),
    };
  }

  resetFailureBackoff() {
    this.consecutiveFailures = 0;
    this.suspendedUntilMs = 0;
  }

  private start() {
    if (this.intervalHandle || this.stores.size === 0) {
      return;
    }

    this.intervalHandle = setInterval(() => {
      this.trigger(Date.now());
    }, SWEEP_INTERVAL_MS);
    this.intervalHandle.unref?.();
  }

  private stop() {
    if (!this.intervalHandle) {
      return;
    }

    clearInterval(this.intervalHandle);
    this.intervalHandle = null;
  }
}

const memorySweepOrchestrator = new MemorySessionRevocationSweepOrchestrator();

class MemorySessionRevocationStore implements SessionRevocationStore {
  private readonly revoked = new Map<string, number>();
  private closed = false;

  constructor() {
    memorySweepOrchestrator.register(this);
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
    if (this.closed) {
      return;
    }
    this.closed = true;
    memorySweepOrchestrator.unregister(this);
    this.revoked.clear();
  }

  sweepExpired(now: number) {
    if (this.closed) {
      return;
    }

    for (const [jwtId, expiresAtMs] of this.revoked.entries()) {
      if (now >= expiresAtMs) {
        this.revoked.delete(jwtId);
      }
    }
  }
}

class ClosedSessionRevocationStore implements SessionRevocationStore {
  async isRevoked(): Promise<boolean> {
    return true;
  }

  async revoke(): Promise<void> {
    throw new Error("Session revocation store is closed.");
  }

  close() {
    // Already closed.
  }
}

const closedSessionRevocationStore = new ClosedSessionRevocationStore();
let activeStore: SessionRevocationStore = new MemorySessionRevocationStore();

function logSessionRevocationStoreCloseFailure(
  sink: LoggerLike,
  message: string,
  error: unknown,
) {
  sink.warn(message, {
    error: error instanceof Error
      ? { name: error.name }
      : { type: typeof error },
  });
}

function closeSessionRevocationStoreSafely(
  store: SessionRevocationStore,
  sink: LoggerLike,
  message: string,
) {
  try {
    void Promise.resolve(store.close?.()).catch((error) => {
      logSessionRevocationStoreCloseFailure(sink, message, error);
    });
  } catch (error) {
    logSessionRevocationStoreCloseFailure(sink, message, error);
  }
}

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
  memorySweepOrchestrator.resetFailureBackoff();
  const sink = options.logger ?? defaultLogger;
  if (previousStore !== activeStore) {
    closeSessionRevocationStoreSafely(
      previousStore,
      sink,
      "Failed to close previous session revocation store",
    );
  }

  return () => {
    const storeToClose = activeStore;
    activeStore = closedSessionRevocationStore;
    closeSessionRevocationStoreSafely(
      storeToClose,
      sink,
      "Failed to close session revocation store during shutdown",
    );
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
  memorySweepOrchestrator.resetFailureBackoff();
  closeSessionRevocationStoreSafely(
    storeToClose,
    defaultLogger,
    "Failed to close session revocation store during test reset",
  );
}

export function getSessionRevocationStoreDiagnosticsForTests() {
  return memorySweepOrchestrator.getDiagnostics();
}

export function sweepSessionRevocationStoreForTests(now = Date.now()) {
  memorySweepOrchestrator.trigger(now);
}

export function registerSessionRevocationSweepStoreForTests(
  store: SweepableSessionRevocationStore,
) {
  memorySweepOrchestrator.register(store);
  return () => {
    memorySweepOrchestrator.unregister(store);
  };
}
