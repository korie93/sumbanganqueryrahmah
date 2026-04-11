import { lazy, type LazyExoticComponent } from "react";

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

export function lazyWithPreload<TModule extends LazyModule>(
  factory: () => Promise<TModule>,
): LazyWithPreload<TModule> {
  let cachedPromise: Promise<TModule> | null = null;

  const load = () => {
    if (!cachedPromise) {
      cachedPromise = factory().catch((error) => {
        cachedPromise = null;
        throw error;
      });
    }

    return cachedPromise;
  };

  const component = lazy(load) as unknown as LazyWithPreload<TModule>;
  component.preload = load;
  return component;
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
      void preload();
    }, { timeout: timeoutMs });

    return () => {
      if (typeof idleWindow.cancelIdleCallback === "function") {
        idleWindow.cancelIdleCallback(handle);
      }
    };
  }

  const handle = window.setTimeout(() => {
    void preload();
  }, timeoutMs);

  return () => {
    window.clearTimeout(handle);
  };
}
