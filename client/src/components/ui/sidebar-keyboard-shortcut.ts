const SIDEBAR_KEYBOARD_SHORTCUT = "b";

type SidebarKeyboardShortcutListener = () => void;

const sidebarKeyboardShortcutListeners: SidebarKeyboardShortcutListener[] = [];
let detachWindowSidebarKeyboardListener: (() => void) | null = null;

function ensureWindowSidebarKeyboardListener() {
  if (detachWindowSidebarKeyboardListener || typeof window === "undefined") {
    return;
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== SIDEBAR_KEYBOARD_SHORTCUT || (!event.metaKey && !event.ctrlKey)) {
      return;
    }

    const activeListener =
      sidebarKeyboardShortcutListeners[sidebarKeyboardShortcutListeners.length - 1] ?? null;
    if (!activeListener) {
      return;
    }

    event.preventDefault();
    activeListener();
  };

  window.addEventListener("keydown", handleKeyDown);
  detachWindowSidebarKeyboardListener = () => {
    window.removeEventListener("keydown", handleKeyDown);
  };
}

function maybeDetachWindowSidebarKeyboardListener() {
  if (sidebarKeyboardShortcutListeners.length > 0 || !detachWindowSidebarKeyboardListener) {
    return;
  }

  detachWindowSidebarKeyboardListener();
  detachWindowSidebarKeyboardListener = null;
}

export function registerSidebarKeyboardShortcut(
  listener: SidebarKeyboardShortcutListener,
) {
  sidebarKeyboardShortcutListeners.push(listener);
  ensureWindowSidebarKeyboardListener();

  return () => {
    const listenerIndex = sidebarKeyboardShortcutListeners.lastIndexOf(listener);
    if (listenerIndex >= 0) {
      sidebarKeyboardShortcutListeners.splice(listenerIndex, 1);
    }
    maybeDetachWindowSidebarKeyboardListener();
  };
}
