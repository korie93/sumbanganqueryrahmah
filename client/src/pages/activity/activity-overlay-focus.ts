export type ActivityOverlay = "investigate" | "kick" | "ban" | "delete";
type FocusTarget = Pick<HTMLElement, "isConnected" | "focus"> & {
  disabled?: boolean;
  getAttribute?: HTMLElement["getAttribute"];
};
type CloseEvent = Pick<Event, "preventDefault">;

export function createActivityOverlayFocus(getFallback: () => FocusTarget | null) {
  const origins = new Map<ActivityOverlay, { target: FocusTarget; testId: string | null | undefined }>();
  return {
    remember(overlay: ActivityOverlay, target: FocusTarget | null) {
      if (target) origins.set(overlay, { target, testId: target.getAttribute?.("data-testid") });
      else origins.delete(overlay);
    },
    transfer(from: ActivityOverlay, to: ActivityOverlay) {
      const origin = origins.get(from);
      origins.delete(from);
      if (origin) origins.set(to, origin);
      else origins.delete(to);
    },
    restore(overlay: ActivityOverlay, event: CloseEvent) {
      event.preventDefault();
      const origin = origins.get(overlay);
      origins.delete(overlay);
      const originStillMatches = origin
        && origin.testId === origin.target.getAttribute?.("data-testid");
      const target = originStillMatches && origin.target.isConnected && !origin.target.disabled
        ? origin.target : getFallback();
      if (target?.isConnected && !target.disabled) target.focus({ preventScroll: true });
    },
  };
}

export type ActivityOverlayFocus = ReturnType<typeof createActivityOverlayFocus>;
