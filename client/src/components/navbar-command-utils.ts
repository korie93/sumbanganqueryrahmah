type ShortcutInput = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  isComposing: boolean;
  defaultPrevented: boolean;
};

/** Slash never steals text-entry focus; IME and other dialogs retain their keys. */
export function isCommandSearchShortcut(
  event: ShortcutInput,
  editing: boolean,
  otherDialogOpen: boolean,
) {
  if (event.defaultPrevented || event.isComposing || event.altKey || otherDialogOpen) return false;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") return true;
  return event.key === "/" && !event.ctrlKey && !event.metaKey && !event.shiftKey && !editing;
}

/** Search operates on an already-authorized registry, never an independent role list. */
export function commandModuleKeywords(item: { id: string; label: string; title?: string; description?: string }) {
  return [item.id, item.label, item.title || "", item.description || ""];
}
