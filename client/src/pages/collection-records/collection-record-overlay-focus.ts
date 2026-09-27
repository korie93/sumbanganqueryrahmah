type CollectionRecordOverlay = "edit" | "delete";
type CollectionRecordFocusTarget = Pick<HTMLElement, "isConnected" | "focus"> & { disabled?: boolean };
type FocusCloseEvent = Pick<Event, "preventDefault">;

export function createCollectionRecordOverlayFocus(getFallback: () => CollectionRecordFocusTarget | null) {
  const origins = new Map<CollectionRecordOverlay, CollectionRecordFocusTarget>();

  return {
    remember(overlay: CollectionRecordOverlay, target: CollectionRecordFocusTarget | null) {
      if (target?.isConnected) origins.set(overlay, target);
      else origins.delete(overlay);
    },
    restore(overlay: CollectionRecordOverlay, event: FocusCloseEvent) {
      event.preventDefault();
      const origin = origins.get(overlay);
      origins.delete(overlay);
      const target = origin?.isConnected && !origin.disabled ? origin : getFallback();
      if (target?.isConnected && !target.disabled) target.focus({ preventScroll: true });
    },
  };
}
