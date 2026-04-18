const SESSION_REVOCATION_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_REVOCATION_MAX_ENTRIES = 10_000;

type SessionRevocationEntry = {
  expiresAt: number;
};

const revokedSessionEntries = new Map<string, SessionRevocationEntry>();

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

export function revokeSession(
  activityId: string,
  options?: {
    now?: number;
    ttlMs?: number;
  },
) {
  const normalizedActivityId = normalizeActivityId(activityId);
  if (!normalizedActivityId) {
    return;
  }

  const now = options?.now ?? Date.now();
  const ttlMs = Math.max(60_000, Math.floor(options?.ttlMs ?? SESSION_REVOCATION_DEFAULT_TTL_MS));
  pruneExpiredSessionRevocations(now);

  revokedSessionEntries.delete(normalizedActivityId);
  revokedSessionEntries.set(normalizedActivityId, {
    expiresAt: now + ttlMs,
  });

  while (revokedSessionEntries.size > SESSION_REVOCATION_MAX_ENTRIES) {
    evictOldestSessionRevocationEntry();
  }
}

export function revokeSessions(
  activityIds: Iterable<string>,
  options?: {
    now?: number;
    ttlMs?: number;
  },
) {
  for (const activityId of activityIds) {
    revokeSession(activityId, options);
  }
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
}

export function getSessionRevocationRegistrySizeForTests() {
  pruneExpiredSessionRevocations();
  return revokedSessionEntries.size;
}
