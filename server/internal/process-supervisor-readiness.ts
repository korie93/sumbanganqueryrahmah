type SupervisorReadyLogger = {
  warn: (message: string, metadata?: Record<string, unknown>) => void;
};

type SupervisorReadyProcess = {
  send?: (message: "ready") => void;
};

export function notifySupervisorReady(
  processRef: SupervisorReadyProcess,
  logger: SupervisorReadyLogger,
): boolean {
  if (typeof processRef.send !== "function") {
    return false;
  }

  try {
    processRef.send("ready");
    return true;
  } catch (error) {
    logger.warn("Failed to notify process supervisor readiness", { error });
    return false;
  }
}

export function createSupervisorReadyGate(options: {
  expectedReadyCount: number;
  logger: SupervisorReadyLogger;
  processRef: SupervisorReadyProcess;
}) {
  const expectedReadyCount = Math.max(1, Math.floor(options.expectedReadyCount));
  const readyWorkerIds = new Set<number>();
  let supervisorReadySent = false;

  function markWorkerReady(workerId: number): boolean {
    readyWorkerIds.add(workerId);

    if (supervisorReadySent || readyWorkerIds.size < expectedReadyCount) {
      return false;
    }

    supervisorReadySent = notifySupervisorReady(options.processRef, options.logger);
    return supervisorReadySent;
  }

  return {
    getReadyWorkerCount: () => readyWorkerIds.size,
    hasNotifiedSupervisor: () => supervisorReadySent,
    markWorkerReady,
  };
}
