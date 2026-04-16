import { logClientError, shouldLogClientDiagnostics, type ClientLoggerEnvironment } from "@/lib/client-logger";

type UnhandledRejectionEventLike = {
  reason?: unknown;
};

type UnhandledRejectionListener = (event: UnhandledRejectionEventLike) => void;

type GlobalUnhandledRejectionTarget = {
  __SQR_UNHANDLED_REJECTION_CLEANUP__?: (() => void) | undefined;
  addEventListener: (type: "unhandledrejection", listener: UnhandledRejectionListener) => void;
  removeEventListener: (type: "unhandledrejection", listener: UnhandledRejectionListener) => void;
};

type InstallGlobalUnhandledRejectionOptions = {
  env?: ClientLoggerEnvironment;
  fallbackConsoleError?: (...args: unknown[]) => void;
  logError?: typeof logClientError;
  target?: GlobalUnhandledRejectionTarget;
};

function buildUnhandledRejectionDetails(reason: unknown) {
  return {
    reasonType: reason instanceof Error ? "error" : typeof reason,
    source: "window.unhandledrejection",
  };
}

export function installGlobalUnhandledRejectionHandler(
  options: InstallGlobalUnhandledRejectionOptions = {},
): () => void {
  const target = options.target ?? (window as GlobalUnhandledRejectionTarget);
  const env = options.env ?? import.meta.env;
  const logError = options.logError ?? logClientError;
  const fallbackConsoleError = options.fallbackConsoleError ?? console.error;

  target.__SQR_UNHANDLED_REJECTION_CLEANUP__?.();

  const onUnhandledRejection: UnhandledRejectionListener = (event) => {
    const reason = event.reason;
    const details = buildUnhandledRejectionDetails(reason);

    if (reason instanceof Error) {
      logError("Unhandled promise rejection", reason, details, env);
    } else {
      logError("Unhandled promise rejection", undefined, {
        ...details,
        reason,
      }, env);
    }

    if (shouldLogClientDiagnostics(env)) {
      return;
    }

    if (reason === undefined) {
      fallbackConsoleError("Unhandled promise rejection");
      return;
    }

    fallbackConsoleError("Unhandled promise rejection", reason);
  };

  target.addEventListener("unhandledrejection", onUnhandledRejection);

  const cleanup = () => {
    if (target.__SQR_UNHANDLED_REJECTION_CLEANUP__ !== cleanup) {
      return;
    }

    target.removeEventListener("unhandledrejection", onUnhandledRejection);
    delete target.__SQR_UNHANDLED_REJECTION_CLEANUP__;
  };

  target.__SQR_UNHANDLED_REJECTION_CLEANUP__ = cleanup;
  return cleanup;
}
