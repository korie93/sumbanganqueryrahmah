export type SavedOverlay = "details" | "rename" | "delete" | "bulk-delete";

type SavedFocusTarget = Pick<HTMLElement, "isConnected" | "focus"> & { disabled?: boolean };
type FocusCloseEvent = Pick<Event, "preventDefault">;

export function createSavedOverlayFocus(getFallback: () => SavedFocusTarget | null) {
  const origins = new Map<SavedOverlay, SavedFocusTarget>();

  return {
    remember(overlay: SavedOverlay, target: SavedFocusTarget | null) {
      if (target) origins.set(overlay, target);
      else origins.delete(overlay);
    },
    restore(overlay: SavedOverlay, event: FocusCloseEvent) {
      event.preventDefault();
      const origin = origins.get(overlay);
      origins.delete(overlay);
      const target = origin?.isConnected && !origin.disabled ? origin : getFallback();
      if (target?.isConnected && !target.disabled) target.focus({ preventScroll: true });
    },
  };
}

export type SavedOverlayFocus = ReturnType<typeof createSavedOverlayFocus>;
