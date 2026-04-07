const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function formatServerStartupExitMessage({ url, code, signal, logPath } = {}) {
  const exitReason = signal
    ? `signal ${signal}`
    : `exit code ${code ?? "unknown"}`;
  const logHint = logPath ? ` See server log: ${logPath}` : "";

  return `Server process exited with ${exitReason} before ${url} became ready.${logHint}`;
}

export function createServerExitTracker(serverProcess) {
  let exit = null;

  if (!serverProcess) {
    return {
      cleanup: () => {},
      getExit: () => null,
      hasExited: () => false,
    };
  }

  if (serverProcess.exitCode !== null || serverProcess.signalCode !== null) {
    exit = {
      code: serverProcess.exitCode,
      signal: serverProcess.signalCode,
    };
  }

  const onExit = (code, signal) => {
    exit = { code, signal };
  };

  serverProcess.once("exit", onExit);

  return {
    cleanup: () => {
      serverProcess.off("exit", onExit);
    },
    getExit: () => exit,
    hasExited: () => exit !== null,
  };
}

export async function waitForServer(
  url,
  {
    fetchImpl = fetch,
    logPath,
    pollIntervalMs = 2_000,
    serverProcess,
    sleepImpl = defaultSleep,
    timeoutMs = 120_000,
  } = {},
) {
  const tracker = createServerExitTracker(serverProcess);
  const startedAt = Date.now();

  try {
    while (Date.now() - startedAt < timeoutMs) {
      if (tracker.hasExited()) {
        throw new Error(formatServerStartupExitMessage({
          url,
          logPath,
          ...tracker.getExit(),
        }));
      }

      try {
        const response = await fetchImpl(url, { redirect: "manual" });
        if (response.status >= 200 && response.status < 500) {
          return;
        }
      } catch {
        // Keep polling until the server is ready, exits, or times out.
      }

      if (tracker.hasExited()) {
        throw new Error(formatServerStartupExitMessage({
          url,
          logPath,
          ...tracker.getExit(),
        }));
      }

      await sleepImpl(pollIntervalMs);
    }
  } finally {
    tracker.cleanup();
  }

  throw new Error(`Server did not become ready at ${url} within ${timeoutMs}ms`);
}
