import { resolveSafeNavigationUrl } from "@/lib/safe-url";

const SINGLE_TAB_LOCK_STORAGE_PREFIX = "sqr_single_tab_lock:";
const SINGLE_TAB_SEED_STORAGE_KEY = "sqr_single_tab_seed";
const SINGLE_TAB_NAVIGATION_RECLAIM_STORAGE_KEY = "sqr_single_tab_navigation_reclaim";

export const SINGLE_TAB_LOCK_TTL_MS = 12_000;
export const SINGLE_TAB_LOCK_HEARTBEAT_MS = 4_000;
export const SINGLE_TAB_NAVIGATION_RECLAIM_TTL_MS = 15_000;

export type SingleTabLock = {
  username: string;
  tabSeed: string;
  instanceId: string;
  updatedAt: number;
};

export type SingleTabNavigationReclaim = {
  tabSeed: string;
  markedAt: number;
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

export function createSingleTabNavigationReclaim(
  tabSeed: string,
  markedAt = Date.now(),
): SingleTabNavigationReclaim {
  return {
    tabSeed: normalizeStorageValue(tabSeed),
    markedAt,
  };
}

export function serializeSingleTabNavigationReclaim(
  reclaim: SingleTabNavigationReclaim,
): string {
  return JSON.stringify(reclaim);
}

export function parseSingleTabNavigationReclaim(
  raw: string | null | undefined,
): SingleTabNavigationReclaim | null {
  const normalized = normalizeStorageValue(raw);
  if (!normalized) {
    return null;
  }

  try {
    const parsed = JSON.parse(normalized) as Partial<SingleTabNavigationReclaim>;
    const tabSeed = normalizeStorageValue(parsed.tabSeed);
    const markedAt = Number(parsed.markedAt);

    if (!tabSeed || !Number.isFinite(markedAt) || markedAt <= 0) {
      return null;
    }

    return {
      tabSeed,
      markedAt,
    };
  } catch {
    return null;
  }
}

export function isSingleTabNavigationReclaimActive(
  reclaim: SingleTabNavigationReclaim | null,
  tabSeed: string | null | undefined,
  now = Date.now(),
  ttlMs = SINGLE_TAB_NAVIGATION_RECLAIM_TTL_MS,
): boolean {
  if (!reclaim) {
    return false;
  }

  if (!Number.isFinite(now) || !Number.isFinite(ttlMs) || ttlMs <= 0) {
    return false;
  }

  return reclaim.tabSeed === normalizeStorageValue(tabSeed) && now - reclaim.markedAt <= ttlMs;
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

export function getSingleTabNavigationReclaimStorageKey(): string {
  return SINGLE_TAB_NAVIGATION_RECLAIM_STORAGE_KEY;
}

export function markSingleTabNavigationReclaimForCurrentTab() {
  if (typeof sessionStorage === "undefined") {
    return;
  }

  try {
    const tabSeed = normalizeStorageValue(sessionStorage.getItem(getSingleTabSeedStorageKey()));
    if (!tabSeed) {
      return;
    }

    sessionStorage.setItem(
      getSingleTabNavigationReclaimStorageKey(),
      serializeSingleTabNavigationReclaim(createSingleTabNavigationReclaim(tabSeed)),
    );
  } catch {
    // Ignore best-effort session reclaim persistence failures.
  }
}

export function reloadAppPreservingSingleTabLock(url?: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  const targetUrl =
    resolveSafeNavigationUrl(normalizeStorageValue(url) || window.location.href) || window.location.href;
  const performReload = () => {
    markSingleTabNavigationReclaimForCurrentTab();

    if (typeof window.location.replace === "function") {
      window.location.replace(targetUrl);
      return;
    }

    window.location.href = targetUrl;
  };

  markSingleTabNavigationReclaimForCurrentTab();

  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => {
      performReload();
    });
    return;
  }

  window.setTimeout(performReload, 0);
}
