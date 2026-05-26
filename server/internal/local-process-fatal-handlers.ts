import { inspect } from "node:util";

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

function formatFatalDetails(value: unknown) {
  if (value instanceof Error) {
    return {
      details: value.stack ?? value.message,
      metadata: { error: value },
    };
  }

  return {
    details: inspect(value, {
      breakLength: Infinity,
      depth: 4,
    }),
    metadata: { reason: value },
  };
}

export function createLocalProcessFatalHandlers({
  logger,
  notifyFatal,
  shutdown,
}: CreateLocalProcessFatalHandlersOptions) {
  function handleUncaughtException(error: unknown) {
    const { details, metadata } = formatFatalDetails(error);
    notifyFatal("PROCESS_UNCAUGHT_EXCEPTION", details);
    logger.error("Uncaught exception in local server process", metadata);
    shutdown({
      details,
      exitCode: 1,
      reason: "uncaughtException",
    });
  }

  function handleUnhandledRejection(reason: unknown) {
    const { details, metadata } = formatFatalDetails(reason);
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
