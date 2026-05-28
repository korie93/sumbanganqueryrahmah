import { formatProcessFatalDetails } from "./process-fatal-error-format";

type LocalProcessFatalLogger = {
  error: (message: string, metadata?: Record<string, unknown>) => void;
};

type LocalProcessFatalEvent = "uncaughtException" | "unhandledRejection";

type LocalProcessLike = {
  on: (event: LocalProcessFatalEvent, handler: (value: unknown) => void) => unknown;
  off: (event: LocalProcessFatalEvent, handler: (value: unknown) => void) => unknown;
};

type NotifyFatal = (reason: string, details?: string) => void;

type ShutdownLocalProcess = (params: {
  reason: LocalProcessFatalEvent;
  details: string;
  exitCode: number;
}) => void;

type CreateLocalProcessFatalHandlersOptions = {
  logger: LocalProcessFatalLogger;
  notifyFatal: NotifyFatal;
  shutdown: ShutdownLocalProcess;
};

type RegisterLocalProcessFatalHandlersOptions =
  & CreateLocalProcessFatalHandlersOptions
  & {
    processRef?: LocalProcessLike;
  };

export function createLocalProcessFatalHandlers({
  logger,
  notifyFatal,
  shutdown,
}: CreateLocalProcessFatalHandlersOptions) {
  function handleUncaughtException(error: unknown) {
    const { details, metadata } = formatProcessFatalDetails(error);
    notifyFatal("PROCESS_UNCAUGHT_EXCEPTION", details);
    logger.error("Uncaught exception in local server process", metadata);
    shutdown({
      details,
      exitCode: 1,
      reason: "uncaughtException",
    });
  }

  function handleUnhandledRejection(reason: unknown) {
    const { details, metadata } = formatProcessFatalDetails(reason);
    notifyFatal("PROCESS_UNHANDLED_REJECTION", details);
    logger.error("Unhandled rejection in local server process", metadata);
    shutdown({
      details,
      exitCode: 1,
      reason: "unhandledRejection",
    });
  }

  return {
    handleUncaughtException,
    handleUnhandledRejection,
  };
}

export function registerLocalProcessFatalHandlers({
  processRef = process,
  ...options
}: RegisterLocalProcessFatalHandlersOptions) {
  const handlers = createLocalProcessFatalHandlers(options);

  processRef.on("uncaughtException", handlers.handleUncaughtException);
  processRef.on("unhandledRejection", handlers.handleUnhandledRejection);

  return () => {
    processRef.off("uncaughtException", handlers.handleUncaughtException);
    processRef.off("unhandledRejection", handlers.handleUnhandledRejection);
  };
}
