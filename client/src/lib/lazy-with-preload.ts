import { lazy, type LazyExoticComponent } from "react";
import { reportClientError } from "@/lib/client-error-telemetry";
import { logClientError } from "@/lib/client-logger";

type IdleCallbackHandle = number;
type IdleCallbackDeadline = {
  didTimeout: boolean;
  timeRemaining: () => number;
};
type LazyLoader = Parameters<typeof lazy>[0];
type LazyModule = Awaited<ReturnType<LazyLoader>>;
type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: (deadline: IdleCallbackDeadline) => void,
    options?: { timeout: number },
  ) => IdleCallbackHandle;
  cancelIdleCallback?: (handle: IdleCallbackHandle) => void;
};

const DEFAULT_IDLE_PRELOAD_TIMEOUT_MS = 1_200;

export type LazyWithPreload<TModule extends LazyModule> =
  LazyExoticComponent<TModule["default"]> & {
    preload: () => Promise<TModule>;
  };

function logLazyLoadError(event: string, error: unknown) {
  logClientError("Lazy module load failed", error, { event });
  reportClientError({
    source: "lazy_module_load",
    error,
    fingerprintContext: event,
  });
}

export function lazyWithPreload<TModule extends LazyModule>(
  factory: () => Promise<TModule>,
): LazyWithPreload<TModule> {
  let cachedPromise: Promise<TModule> | null = null;

  const load = () => {
    if (!cachedPromise) {
      try {
        cachedPromise = Promise.resolve(factory()).catch((error: unknown) => {
          cachedPromise = null;
          logLazyLoadError("lazy_load_factory_error", error);
          throw error;
        });
      } catch (error) {
        cachedPromise = null;
        logLazyLoadError("lazy_load_factory_sync_error", error);
        return Promise.reject(error);
      }
    }

    return cachedPromise;
  };

  const component = lazy(load) as unknown as LazyWithPreload<TModule>;
  component.preload = load;
  return component;
}

function runScheduledPreload(preload: () => void | Promise<unknown>) {
  try {
    Promise.resolve(preload()).catch((error: unknown) => {
      logLazyLoadError("lazy_preload_scheduled_rejection", error);
    });
  } catch (error) {
    logLazyLoadError("lazy_preload_scheduled_sync_error", error);
  }
}

export function scheduleIdlePreload(
  preload: () => void | Promise<unknown>,
  timeoutMs = DEFAULT_IDLE_PRELOAD_TIMEOUT_MS,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const idleWindow = window as IdleWindow;

  if (typeof idleWindow.requestIdleCallback === "function") {
    const handle = idleWindow.requestIdleCallback(() => {
      runScheduledPreload(preload);
    }, { timeout: timeoutMs });

    return () => {
      if (typeof idleWindow.cancelIdleCallback === "function") {
        idleWindow.cancelIdleCallback(handle);
      }
    };
  }

  const handle = window.setTimeout(() => {
    runScheduledPreload(preload);
  }, timeoutMs);

  return () => {
    window.clearTimeout(handle);
  };
}
