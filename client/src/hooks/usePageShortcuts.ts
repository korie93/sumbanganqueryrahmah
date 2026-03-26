import { useEffect, useRef } from "react";

type ShortcutTargetLike = {
  tagName?: string | null;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
};

type ShortcutEventLike = {
  key?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
};

export type PageShortcutDefinition = {
  key: string;
  ctrlOrMeta?: boolean;
  alt?: boolean;
  shift?: boolean;
  enabled?: boolean;
  preventDefault?: boolean;
  allowInEditable?: boolean;
  handler: () => void;
};

function normalizeShortcutKey(key: string | undefined): string {
  const normalized = String(key || "").trim();
  if (!normalized) {
    return "";
  }

  return normalized.length === 1 ? normalized.toLowerCase() : normalized;
}

export function isEditableShortcutTarget(target: EventTarget | ShortcutTargetLike | null | undefined): boolean {
  const candidate = target as ShortcutTargetLike | null | undefined;
  if (!candidate) {
    return false;
  }

  const tagName = String(candidate.tagName || "").trim().toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }

  if (candidate.isContentEditable) {
    return true;
  }

  if (typeof candidate.closest === "function") {
    return Boolean(candidate.closest("input, textarea, select, [contenteditable='true']"));
  }

  return false;
}

export function matchesPageShortcut(
  event: ShortcutEventLike,
  shortcut: Pick<PageShortcutDefinition, "key" | "ctrlOrMeta" | "alt" | "shift">,
): boolean {
  if (normalizeShortcutKey(event.key) !== normalizeShortcutKey(shortcut.key)) {
    return false;
  }

  const expectsCtrlOrMeta = shortcut.ctrlOrMeta === true;
  if (expectsCtrlOrMeta !== Boolean(event.ctrlKey || event.metaKey)) {
    return false;
  }

  const expectsAlt = shortcut.alt === true;
  if (expectsAlt !== Boolean(event.altKey)) {
    return false;
  }

  const expectsShift = shortcut.shift === true;
  if (expectsShift !== Boolean(event.shiftKey)) {
    return false;
  }

  return true;
}

export function usePageShortcuts(shortcuts: PageShortcutDefinition[]) {
  const shortcutsRef = useRef(shortcuts);

  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      for (const shortcut of shortcutsRef.current) {
        if (shortcut.enabled === false) {
          continue;
        }
        if (!shortcut.allowInEditable && isEditableShortcutTarget(event.target)) {
          continue;
        }
        if (!matchesPageShortcut(event, shortcut)) {
          continue;
        }

        if (shortcut.preventDefault !== false) {
          event.preventDefault();
        }
        shortcut.handler();
        break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
}
