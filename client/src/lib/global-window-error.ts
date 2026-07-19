import {
  logClientError,
  shouldLogClientDiagnostics,
  type ClientLoggerEnvironment,
} from "@/lib/client-logger";

type WindowErrorEventLike = {
  error?: unknown;
};

type WindowErrorListener = (event: WindowErrorEventLike) => void;

type GlobalWindowErrorTarget = {
  __SQR_WINDOW_ERROR_CLEANUP__?: (() => void) | undefined;
  addEventListener: (type: "error", listener: WindowErrorListener) => void;
  removeEventListener: (type: "error", listener: WindowErrorListener) => void;
};

type InstallGlobalWindowErrorOptions = {
  env?: ClientLoggerEnvironment;
  logError?: typeof logClientError;
  productionReporter?: (error: unknown) => void;
  target?: GlobalWindowErrorTarget;
};

export function installGlobalWindowErrorHandler(
  options: InstallGlobalWindowErrorOptions = {},
): () => void {
  const target = options.target ?? (window as unknown as GlobalWindowErrorTarget);
  const env = options.env ?? import.meta.env;
  const logError = options.logError ?? logClientError;

  target.__SQR_WINDOW_ERROR_CLEANUP__?.();

  const onWindowError: WindowErrorListener = (event) => {
    // Resource load errors do not expose an Error object and may contain
    // sensitive URLs, so they are intentionally excluded from this channel.
    if (!(event.error instanceof Error)) {
      return;
    }

    if (shouldLogClientDiagnostics(env)) {
      logError("Unhandled window error", event.error, {
        source: "window.error",
      }, env);
      return;
    }

    options.productionReporter?.(event.error);
  };

  target.addEventListener("error", onWindowError);

  const cleanup = () => {
    if (target.__SQR_WINDOW_ERROR_CLEANUP__ !== cleanup) {
      return;
    }

    target.removeEventListener("error", onWindowError);
    delete target.__SQR_WINDOW_ERROR_CLEANUP__;
  };

  target.__SQR_WINDOW_ERROR_CLEANUP__ = cleanup;
  return cleanup;
}
