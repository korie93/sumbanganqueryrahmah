import { useCallback, useState } from "react";
import type { User } from "@/app/types";
import {
  getBrowserLocalStorage,
  safeGetStorageItem,
  safeSetStorageItem,
} from "@/lib/browser-storage";

type SidebarPreferenceIdentity = Pick<User, "id" | "username">;
type SidebarPreferenceStorage = Pick<Storage, "getItem" | "setItem">;
const SIDEBAR_PREFERENCE_PREFIX = "sqr:desktop-sidebar:v1";
const MAX_IDENTITY_LENGTH = 160;

export function buildDesktopSidebarPreferenceKey(user: SidebarPreferenceIdentity): string | null {
  const id = user.id?.trim();
  const identity = id || user.username.trim();
  if (!identity || identity.length > MAX_IDENTITY_LENGTH) return null;

  try {
    // Store only an account identifier and a UI preference, never session credentials.
    return `${SIDEBAR_PREFERENCE_PREFIX}:${id ? "id" : "username"}:${encodeURIComponent(identity)}`;
  } catch {
    return null;
  }
}

export function readDesktopSidebarCollapsed(
  key: string | null,
  storage?: SidebarPreferenceStorage | null,
): boolean {
  if (!key) return false;
  const resolvedStorage = storage === undefined ? getBrowserLocalStorage() : storage;
  return safeGetStorageItem(resolvedStorage, key) === "collapsed";
}

export function writeDesktopSidebarCollapsed(
  key: string | null,
  collapsed: boolean,
  storage?: SidebarPreferenceStorage | null,
): boolean {
  if (!key) return false;
  const resolvedStorage = storage === undefined ? getBrowserLocalStorage() : storage;
  return safeSetStorageItem(resolvedStorage, key, collapsed ? "collapsed" : "expanded");
}

export function useDesktopSidebarPreference(user: SidebarPreferenceIdentity) {
  const key = buildDesktopSidebarPreferenceKey(user);
  const [preference, setPreference] = useState(() => ({
    key,
    collapsed: readDesktopSidebarCollapsed(key),
  }));
  let sidebarCollapsed = preference.collapsed;

  if (preference.key !== key) {
    // Reset before committing a new account's frame, without an expanded-state flash.
    sidebarCollapsed = readDesktopSidebarCollapsed(key);
    setPreference({ key, collapsed: sidebarCollapsed });
  }

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setPreference({ key, collapsed });
    writeDesktopSidebarCollapsed(key, collapsed);
  }, [key]);

  return { sidebarCollapsed, setSidebarCollapsed };
}
