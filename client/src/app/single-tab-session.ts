const SINGLE_TAB_LOCK_STORAGE_PREFIX = "sqr_single_tab_lock:";
const SINGLE_TAB_SEED_STORAGE_KEY = "sqr_single_tab_seed";

export const SINGLE_TAB_LOCK_TTL_MS = 12_000;
export const SINGLE_TAB_LOCK_HEARTBEAT_MS = 4_000;

export type SingleTabLock = {
  username: string;
  tabSeed: string;
  instanceId: string;
  updatedAt: number;
};

function normalizeStorageValue(value: string | null | undefined): string {
  return String(value || "").trim();
}

export function normalizeSingleTabUsername(username: string | null | undefined): string {
  return normalizeStorageValue(username).toLowerCase();
}

export function buildSingleTabLockStorageKey(username: string | null | undefined): string {
  return `${SINGLE_TAB_LOCK_STORAGE_PREFIX}${normalizeSingleTabUsername(username)}`;
}

export function parseSingleTabLock(raw: string | null | undefined): SingleTabLock | null {
  const normalized = normalizeStorageValue(raw);
  if (!normalized) {
    return null;
  }

  try {
    const parsed = JSON.parse(normalized) as Partial<SingleTabLock>;
    const username = normalizeSingleTabUsername(parsed.username);
    const tabSeed = normalizeStorageValue(parsed.tabSeed);
    const instanceId = normalizeStorageValue(parsed.instanceId);
    const updatedAt = Number(parsed.updatedAt);

    if (!username || !tabSeed || !instanceId || !Number.isFinite(updatedAt) || updatedAt <= 0) {
      return null;
    }

    return {
      username,
      tabSeed,
      instanceId,
      updatedAt,
    };
  } catch {
    return null;
  }
}

export function isSingleTabLockExpired(
  lock: SingleTabLock | null,
  now = Date.now(),
  ttlMs = SINGLE_TAB_LOCK_TTL_MS,
): boolean {
  if (!lock) {
    return true;
  }

  if (!Number.isFinite(now) || !Number.isFinite(ttlMs) || ttlMs <= 0) {
    return true;
  }

  return now - lock.updatedAt > ttlMs;
}

export function isSingleTabLockOwner(
  lock: SingleTabLock | null,
  username: string | null | undefined,
  tabSeed: string | null | undefined,
  instanceId: string | null | undefined,
): boolean {
  const normalizedUsername = normalizeSingleTabUsername(username);
  const normalizedTabSeed = normalizeStorageValue(tabSeed);
  const normalizedInstanceId = normalizeStorageValue(instanceId);

  return Boolean(
    lock
      && lock.username === normalizedUsername
      && lock.tabSeed === normalizedTabSeed
      && lock.instanceId === normalizedInstanceId,
  );
}

export function canClaimSingleTabLock(
  lock: SingleTabLock | null,
  username: string | null | undefined,
  tabSeed: string | null | undefined,
  instanceId: string | null | undefined,
  now = Date.now(),
  ttlMs = SINGLE_TAB_LOCK_TTL_MS,
  allowTabSeedReuse = false,
): boolean {
  if (!lock || isSingleTabLockExpired(lock, now, ttlMs)) {
    return true;
  }

  if (isSingleTabLockOwner(lock, username, tabSeed, instanceId)) {
    return true;
  }

  return allowTabSeedReuse
    && lock.username === normalizeSingleTabUsername(username)
    && lock.tabSeed === normalizeStorageValue(tabSeed);
}

export function createSingleTabLock(
  username: string | null | undefined,
  tabSeed: string,
  instanceId: string,
  updatedAt = Date.now(),
): SingleTabLock {
  return {
    username: normalizeSingleTabUsername(username),
    tabSeed: normalizeStorageValue(tabSeed),
    instanceId: normalizeStorageValue(instanceId),
    updatedAt,
  };
}

export function serializeSingleTabLock(lock: SingleTabLock): string {
  return JSON.stringify(lock);
}

export function getSingleTabSeedStorageKey(): string {
  return SINGLE_TAB_SEED_STORAGE_KEY;
}
