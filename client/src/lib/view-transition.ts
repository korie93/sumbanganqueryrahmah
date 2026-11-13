import { flushSync } from "react-dom";

export type ViewTransitionKind = "auth" | "page";

type BrowserTransition = {
  ready?: Promise<unknown>;
  updateCallbackDone?: Promise<unknown>;
  finished: Promise<unknown>;
  skipTransition?: () => void;
};

type TransitionDocument = {
  documentElement: { dataset: Record<string, string | undefined> };
  startViewTransition?: (update: () => void) => BrowserTransition;
};

type TransitionEnvironment = {
  getDocument: () => TransitionDocument | undefined;
  prefersReducedMotion: () => boolean;
  flush: (update: () => void) => void;
};

type ActiveTransition = {
  kind: ViewTransitionKind;
  document: TransitionDocument;
  cancelled: boolean;
  applied: boolean;
  callbackThrew: boolean;
  callbackError?: unknown;
  native?: BrowserTransition;
};

/** Isolated controller lets tests exercise native lifecycle races without a DOM. */
export function createViewTransitionController(environment: TransitionEnvironment) {
  let active: ActiveTransition | null = null;

  const clear = (transition: ActiveTransition) => {
    if (active !== transition) return;
    active = null;
    const dataset = transition.document.documentElement.dataset;
    if (dataset.vt === transition.kind) delete dataset.vt;
  };

  const interrupt = () => {
    if (!active) return;
    const previous = active;
    previous.cancelled = true;
    try {
      previous.native?.skipTransition?.();
    } catch {
      // A browser may already have finished the interrupted animation.
    }
    clear(previous);
  };

  return {
    cancel: interrupt,
    getActiveKind: (): ViewTransitionKind | null => active?.kind ?? null,
    run(update: () => void, kind: ViewTransitionKind = "auth"): Promise<void> {
      interrupt();
      const ownerDocument = environment.getDocument();
      if (!ownerDocument?.startViewTransition || environment.prefersReducedMotion()) {
        update();
        return Promise.resolve();
      }

      const transition: ActiveTransition = {
        kind, document: ownerDocument, cancelled: false,
        applied: false, callbackThrew: false,
      };
      active = transition;
      ownerDocument.documentElement.dataset.vt = kind;
      const apply = () => {
        if (transition.cancelled || transition.applied) return;
        transition.applied = true;
        try {
          environment.flush(update);
        } catch (error) {
          transition.callbackThrew = true;
          transition.callbackError = error;
          throw error;
        }
      };

      try {
        transition.native = ownerDocument.startViewTransition(apply);
      } catch {
        clear(transition);
        if (transition.callbackThrew) throw transition.callbackError;
        // Failure to start can happen before or after the browser invokes the
        // callback. Apply an update only if it has not already happened.
        if (!transition.applied && !transition.cancelled) {
          transition.applied = true;
          update();
        }
        return Promise.resolve();
      }

      // Skips and interrupted snapshots can reject ready even when the DOM
      // update succeeds. Observe it separately from finished to avoid an
      // unhandled rejection; neither rejection retries navigation.
      if (transition.native.ready) {
        void Promise.resolve(transition.native.ready).catch(() => undefined);
      }
      if (transition.native.updateCallbackDone) {
        void Promise.resolve(transition.native.updateCallbackDone).catch(() => undefined);
      }
      return Promise.resolve(transition.native.finished).then(
        () => { clear(transition); },
        () => { clear(transition); },
      );
    },
  };
}

const controller = createViewTransitionController({
  getDocument: () => typeof document === "undefined" ? undefined : document,
  prefersReducedMotion: () => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return true;
    }
  },
  flush: update => { flushSync(update); },
});

/** Read once when route content mounts; do not add an enter class on cleanup. */
export function getActiveViewTransitionKind(): ViewTransitionKind | null {
  return controller.getActiveKind();
}

/** Browser transition failures degrade gracefully and never reapply navigation. */
export function withViewTransition(update: () => void, kind: ViewTransitionKind = "auth") {
  return controller.run(update, kind);
}

/** History rendering must not remain behind an obsolete native snapshot. */
export function cancelActiveViewTransition() {
  controller.cancel();
}
