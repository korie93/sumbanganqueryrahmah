import { formatProcessFatalDetails } from "./process-fatal-error-format";

type WorkerProcessLogger = {
  error: (message: string, metadata?: Record<string, unknown>) => void;
};

type WorkerProcessEvent = "uncaughtException" | "unhandledRejection";

type WorkerProcessLike = {
  on: (event: WorkerProcessEvent, handler: (value: unknown) => void) => unknown;
  off: (event: WorkerProcessEvent, handler: (value: unknown) => void) => unknown;
};

type NotifyMasterFatal = (reason: string, details?: string) => void;

type ShutdownWorkerProcess = (params: {
  reason: "uncaughtException" | "unhandledRejection";
  details: string;
  exitCode: number;
}) => void;

type CreateWorkerProcessFatalHandlersOptions = {
  logger: WorkerProcessLogger;
  notifyMasterFatal: NotifyMasterFatal;
  shutdown: ShutdownWorkerProcess;
};

type RegisterWorkerProcessFatalHandlersOptions =
  & CreateWorkerProcessFatalHandlersOptions
  & {
    processRef?: WorkerProcessLike;
  };

export function createWorkerProcessFatalHandlers({
  logger,
  notifyMasterFatal,
  shutdown,
}: CreateWorkerProcessFatalHandlersOptions) {
  function handleUncaughtException(error: unknown) {
    const { details, metadata } = formatProcessFatalDetails(error);
    notifyMasterFatal("WORKER_UNCAUGHT_EXCEPTION", details);
    logger.error("Uncaught exception in worker process", metadata);
    shutdown({
      reason: "uncaughtException",
      details,
      exitCode: 1,
    });
  }

  function handleUnhandledRejection(reason: unknown) {
    const { details, metadata } = formatProcessFatalDetails(reason);
    notifyMasterFatal("WORKER_UNHANDLED_REJECTION", details);
    logger.error("Unhandled rejection in worker process", metadata);
    shutdown({
      reason: "unhandledRejection",
      details,
      exitCode: 1,
    });
  }

  return {
    handleUncaughtException,
    handleUnhandledRejection,
  };
}

export function registerWorkerProcessFatalHandlers({
  processRef = process,
  ...options
}: RegisterWorkerProcessFatalHandlersOptions) {
  const handlers = createWorkerProcessFatalHandlers(options);

  processRef.on("uncaughtException", handlers.handleUncaughtException);
  processRef.on("unhandledRejection", handlers.handleUnhandledRejection);

  return () => {
    processRef.off("uncaughtException", handlers.handleUncaughtException);
    processRef.off("unhandledRejection", handlers.handleUnhandledRejection);
  };
}
