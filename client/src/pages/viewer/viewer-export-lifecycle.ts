export type ViewerExportKind = "csv" | "excel" | "pdf";

export type ViewerExportOwner = {
  kind: ViewerExportKind;
  controller: AbortController;
};

/** One owner across all formats, including before React renders busy state. */
export function createViewerExportLifecycle() {
  let active: ViewerExportOwner | null = null;

  return {
    start(kind: ViewerExportKind): ViewerExportOwner | null {
      if (active) return null;
      active = { kind, controller: new AbortController() };
      return active;
    },
    isBusy() {
      return active !== null;
    },
    isCurrent(owner: ViewerExportOwner) {
      return active === owner && !owner.controller.signal.aborted;
    },
    finish(owner: ViewerExportOwner) {
      if (active !== owner) return false;
      active = null;
      return true;
    },
    cancel() {
      const previous = active;
      active = null;
      previous?.controller.abort();
    },
  };
}
