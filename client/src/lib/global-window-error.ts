import { logClientError, type ClientLoggerEnvironment } from "@/lib/client-logger";

type WindowErrorEventLike = {
  error?: unknown;
  message?: unknown;
};

type WindowErrorListener = (event: WindowErrorEventLike) => void;

type GlobalWindowErrorTarget = {
  __SQR_WINDOW_ERROR_CLEANUP__?: (() => void) | undefined;
  addEventListener: (type: "error", listener: WindowErrorListener) => void;
  removeEventListener: (type: "error", listener: WindowErrorListener) => void;
};

type InstallGlobalWindowErrorHandlerOptions = {
  env?: ClientLoggerEnvironment;
  logError?: typeof logClientError;
  target?: GlobalWindowErrorTarget;
};

function buildWindowErrorDetails(error: unknown) {
  return {
    reasonType: error instanceof Error ? "error" : typeof error,
    source: "window.error",
  };
}

export function installGlobalWindowErrorHandler(
  options: InstallGlobalWindowErrorHandlerOptions = {},
): () => void {
  const target = options.target ?? (window as GlobalWindowErrorTarget);
  const env = options.env ?? import.meta.env;
  const logError = options.logError ?? logClientError;

  target.__SQR_WINDOW_ERROR_CLEANUP__?.();

  const onWindowError: WindowErrorListener = (event) => {
    const error = event.error;
    const details = buildWindowErrorDetails(error);

    if (error instanceof Error) {
      logError("Unhandled window error", error, details, env);
      return;
    }

    logError("Unhandled window error", undefined, {
      ...details,
      message: typeof event.message === "string" ? event.message : undefined,
    }, env);
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
