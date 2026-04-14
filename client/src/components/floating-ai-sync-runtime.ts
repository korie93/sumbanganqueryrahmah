export type FloatingAiSyncRuntimeState = {
  frame: number;
  resizeDebounceHandle: number | null;
  scheduled: boolean;
};

type FloatingAiSyncWindowLike = Pick<Window, "cancelAnimationFrame" | "clearTimeout">;

export function cleanupFloatingAiSyncRuntime(
  windowObject: FloatingAiSyncWindowLike,
  state: FloatingAiSyncRuntimeState,
): void {
  if (state.resizeDebounceHandle !== null) {
    windowObject.clearTimeout(state.resizeDebounceHandle);
    state.resizeDebounceHandle = null;
  }

  if (state.frame !== 0) {
    windowObject.cancelAnimationFrame(state.frame);
    state.frame = 0;
  }

  state.scheduled = false;
}
