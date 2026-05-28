type ClusterMasterFatalLogger = {
  error: (message: string, metadata?: Record<string, unknown>) => void;
};

type ClusterMasterFatalRuntime = {
  handleUncaughtException: (error: unknown) => void;
  handleUnhandledRejection: (reason: unknown) => void;
};

type ClusterMasterFatalStderr = {
  write: (message: string) => unknown;
};

type ClusterMasterFatalExit = (code: number) => never | void;

type CreateClusterMasterFatalHandlersOptions = {
  clusterMaster: ClusterMasterFatalRuntime;
  exit?: ClusterMasterFatalExit;
  logger: ClusterMasterFatalLogger;
  stderr?: ClusterMasterFatalStderr;
};

function formatFatalHandlerFailure(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return String(error);
}

export function createClusterMasterFatalHandlers({
  clusterMaster,
  exit = process.exit,
  logger,
  stderr = process.stderr,
}: CreateClusterMasterFatalHandlersOptions) {
  function failClosed(event: "uncaughtException" | "unhandledRejection", error: unknown): void {
    try {
      logger.error("Cluster master fatal handler failed; forcing process exit", {
        event,
        error: error instanceof Error ? { name: error.name } : { type: typeof error },
      });
    } catch {
      // Fall through to stderr. The fatal handler must not depend on structured logging.
    }

    try {
      stderr.write(
        `FATAL: Cluster master fatal handler failed during ${event}: ${formatFatalHandlerFailure(error)}\n`,
      );
    } catch {
      // Last resort still exits below.
    } finally {
      exit(1);
    }
  }

  function handleUncaughtException(error: unknown): void {
    try {
      clusterMaster.handleUncaughtException(error);
    } catch (handlerError) {
      failClosed("uncaughtException", handlerError);
    }
  }

  function handleUnhandledRejection(reason: unknown): void {
    try {
      clusterMaster.handleUnhandledRejection(reason);
    } catch (handlerError) {
      failClosed("unhandledRejection", handlerError);
    }
  }

  return {
    handleUncaughtException,
    handleUnhandledRejection,
  };
}
