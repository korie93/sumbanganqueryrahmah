import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildSingleTabLockStorageKey,
  canClaimSingleTabLock,
  createSingleTabLock,
  getSingleTabSeedStorageKey,
  isSingleTabLockOwner,
  parseSingleTabLock,
  serializeSingleTabLock,
  SINGLE_TAB_LOCK_HEARTBEAT_MS,
  SINGLE_TAB_LOCK_TTL_MS,
  normalizeSingleTabUsername,
} from "@/app/single-tab-session";

type SingleTabSessionState = {
  username: string;
  ready: boolean;
  blocked: boolean;
};

const READY_IDLE_STATE: SingleTabSessionState = {
  username: "",
  ready: true,
  blocked: false,
};

function canUseSingleTabLockStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined" && typeof sessionStorage !== "undefined";
}

function createRuntimeId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function canReuseSingleTabSeedOnThisLoad(): boolean {
  if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") {
    return false;
  }

  const navigationEntry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  return navigationEntry?.type === "reload";
}

function getOrCreateTabSeed(): string {
  if (!canUseSingleTabLockStorage()) {
    return `memory-${createRuntimeId()}`;
  }

  const storageKey = getSingleTabSeedStorageKey();

  try {
    const existing = String(sessionStorage.getItem(storageKey) || "").trim();
    if (existing) {
      return existing;
    }

    const nextSeed = `tab-${createRuntimeId()}`;
    sessionStorage.setItem(storageKey, nextSeed);
    return nextSeed;
  } catch {
    return `memory-${createRuntimeId()}`;
  }
}

export function useSingleTabSession(username: string | null | undefined) {
  const normalizedUsername = useMemo(() => normalizeSingleTabUsername(username), [username]);
  const tabSeedRef = useRef("");
  const instanceIdRef = useRef(`instance-${createRuntimeId()}`);
  const allowTabSeedReuseRef = useRef(canReuseSingleTabSeedOnThisLoad());
  const retryRef = useRef<(() => void) | null>(null);
  const [state, setState] = useState<SingleTabSessionState>(READY_IDLE_STATE);

  if (!tabSeedRef.current) {
    tabSeedRef.current = getOrCreateTabSeed();
  }

  const retryNow = useCallback(() => {
    retryRef.current?.();
  }, []);

  useEffect(() => {
    if (!normalizedUsername) {
      retryRef.current = null;
      setState(READY_IDLE_STATE);
      return;
    }

    if (!canUseSingleTabLockStorage()) {
      retryRef.current = null;
      setState({
        username: normalizedUsername,
        ready: true,
        blocked: false,
      });
      return;
    }

    const storageKey = buildSingleTabLockStorageKey(normalizedUsername);
    const tabSeed = tabSeedRef.current;
    const instanceId = instanceIdRef.current;
    const allowTabSeedReuse = allowTabSeedReuseRef.current;
    let cancelled = false;
    let isPageUnloading = false;

    const updateState = (blocked: boolean) => {
      if (cancelled) {
        return;
      }

      setState({
        username: normalizedUsername,
        ready: true,
        blocked,
      });
    };

    const releaseLockIfOwned = () => {
      try {
        const existing = parseSingleTabLock(localStorage.getItem(storageKey));
        if (isSingleTabLockOwner(existing, normalizedUsername, tabSeed, instanceId)) {
          localStorage.removeItem(storageKey);
        }
      } catch {
        // Ignore best-effort ownership release failures during unload/logout transitions.
      }
    };

    const syncLockState = () => {
      if (cancelled) {
        return;
      }

      try {
        const now = Date.now();
        const existing = parseSingleTabLock(localStorage.getItem(storageKey));

        if (
          canClaimSingleTabLock(
            existing,
            normalizedUsername,
            tabSeed,
            instanceId,
            now,
            SINGLE_TAB_LOCK_TTL_MS,
            allowTabSeedReuse,
          )
        ) {
          const nextLock = createSingleTabLock(normalizedUsername, tabSeed, instanceId, now);
          localStorage.setItem(storageKey, serializeSingleTabLock(nextLock));
        }

        const confirmed = parseSingleTabLock(localStorage.getItem(storageKey));
        const ownsLock = isSingleTabLockOwner(confirmed, normalizedUsername, tabSeed, instanceId);
        updateState(!ownsLock);
      } catch {
        updateState(false);
      }
    };

    retryRef.current = syncLockState;
    setState({
      username: normalizedUsername,
      ready: false,
      blocked: false,
    });
    syncLockState();

    const heartbeatId = window.setInterval(syncLockState, SINGLE_TAB_LOCK_HEARTBEAT_MS);

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) {
        return;
      }

      syncLockState();
    };

    const handlePageUnload = () => {
      isPageUnloading = true;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncLockState();
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("pagehide", handlePageUnload);
    window.addEventListener("beforeunload", handlePageUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      retryRef.current = null;
      window.clearInterval(heartbeatId);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("pagehide", handlePageUnload);
      window.removeEventListener("beforeunload", handlePageUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (!isPageUnloading) {
        releaseLockIfOwned();
      }
      cancelled = true;
    };
  }, [normalizedUsername]);

  const isReady = !normalizedUsername || (state.username === normalizedUsername && state.ready);
  const isBlocked = Boolean(normalizedUsername && state.username === normalizedUsername && state.blocked);

  return {
    isBlocked,
    isReady,
    retryNow,
  };
}
