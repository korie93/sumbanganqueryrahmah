const SESSION_REVOCATION_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_REVOCATION_MAX_ENTRIES = 10_000;

type SessionRevocationEntry = {
  expiresAt: number;
};

export type SessionRevocationReplicationPayload = {
  activityId: string;
  expiresAt: number;
};

type SessionRevocationReplicationRuntime = {
  publishRevocation: (payload: SessionRevocationReplicationPayload) => void;
};

const revokedSessionEntries = new Map<string, SessionRevocationEntry>();
let replicationRuntime: SessionRevocationReplicationRuntime | null = null;

function normalizeActivityId(activityId: string) {
  return String(activityId || "").trim();
}

function pruneExpiredSessionRevocations(now = Date.now()) {
  for (const [activityId, entry] of revokedSessionEntries.entries()) {
    if (entry.expiresAt <= now) {
      revokedSessionEntries.delete(activityId);
    }
  }
}

function evictOldestSessionRevocationEntry() {
  const oldestEntry = revokedSessionEntries.keys().next();
  if (!oldestEntry.done) {
    revokedSessionEntries.delete(oldestEntry.value);
  }
}

function capSessionRevocationRegistrySize() {
  while (revokedSessionEntries.size > SESSION_REVOCATION_MAX_ENTRIES) {
    evictOldestSessionRevocationEntry();
  }
}

function storeSessionRevocation(activityId: string, expiresAt: number, now: number) {
  pruneExpiredSessionRevocations(now);
  revokedSessionEntries.delete(activityId);
  revokedSessionEntries.set(activityId, {
    expiresAt,
  });
  capSessionRevocationRegistrySize();
}

export function configureSessionRevocationReplication(
  runtime: SessionRevocationReplicationRuntime | null,
) {
  replicationRuntime = runtime;
}

export function revokeSession(
  activityId: string,
  options?: {
    now?: number;
    ttlMs?: number;
    expiresAt?: number;
    replicated?: boolean;
  },
) {
  const normalizedActivityId = normalizeActivityId(activityId);
  if (!normalizedActivityId) {
    return;
  }

  const now = options?.now ?? Date.now();
  const expiresAt = Number.isFinite(options?.expiresAt)
    ? Math.trunc(options?.expiresAt ?? now + SESSION_REVOCATION_DEFAULT_TTL_MS)
    : now + Math.max(60_000, Math.floor(options?.ttlMs ?? SESSION_REVOCATION_DEFAULT_TTL_MS));

  if (expiresAt <= now) {
    revokedSessionEntries.delete(normalizedActivityId);
    return;
  }

  storeSessionRevocation(normalizedActivityId, expiresAt, now);

  if (!options?.replicated) {
    try {
      replicationRuntime?.publishRevocation({
        activityId: normalizedActivityId,
        expiresAt,
      });
    } catch (error) {
      void error;
      // Best-effort cluster replication must never block local revocation.
    }
  }
}

export function revokeSessions(
  activityIds: Iterable<string>,
  options?: {
    now?: number;
    ttlMs?: number;
    expiresAt?: number;
    replicated?: boolean;
  },
) {
  for (const activityId of activityIds) {
    revokeSession(activityId, options);
  }
}

export function applyReplicatedSessionRevocation(
  payload: SessionRevocationReplicationPayload,
  now = Date.now(),
) {
  revokeSession(payload.activityId, {
    now,
    expiresAt: payload.expiresAt,
    replicated: true,
  });
}

export function isSessionRevoked(activityId: string, now = Date.now()) {
  const normalizedActivityId = normalizeActivityId(activityId);
  if (!normalizedActivityId) {
    return false;
  }

  const entry = revokedSessionEntries.get(normalizedActivityId);
  if (!entry) {
    return false;
  }

  if (entry.expiresAt <= now) {
    revokedSessionEntries.delete(normalizedActivityId);
    return false;
  }

  return true;
}

export function clearSessionRevocationsForTests() {
  revokedSessionEntries.clear();
  replicationRuntime = null;
}

export function getSessionRevocationRegistrySizeForTests() {
  pruneExpiredSessionRevocations();
  return revokedSessionEntries.size;
}
