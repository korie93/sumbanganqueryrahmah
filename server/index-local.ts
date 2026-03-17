import "dotenv/config";
import type { WorkerFatalMessage } from "./internal/worker-ipc";
import { startLocalServer } from "./internal/server-startup";
import { createLocalRuntimeEnvironment } from "./internal/local-runtime-environment";

let startupFatalReason: string | null = null;

type WorkerIpcProcess = NodeJS.Process & {
  send?: (message: WorkerFatalMessage) => void;
};

const workerIpcProcess = process as WorkerIpcProcess;

function notifyMasterFatalStartup(reason: string, details?: string) {
  if (startupFatalReason) return;
  startupFatalReason = reason;

  if (typeof workerIpcProcess.send === "function") {
    try {
      workerIpcProcess.send({
        type: "worker-fatal",
        payload: { reason, details: details ?? "" },
      });
    } catch {
      // no-op
    }
  }
}

const {
  app,
  server,
  storage,
  connectedClients,
  categoryStatsService,
  getRuntimeSettingsCached,
  defaultSessionTimeoutMinutes,
  aiPrecomputeOnStart,
  port,
  host,
} = createLocalRuntimeEnvironment({
  notifyFatalStartup: notifyMasterFatalStartup,
});

async function startServer() {
  await startLocalServer({
    app,
    server,
    storage,
    connectedClients,
    getRuntimeSettingsCached,
    defaultSessionTimeoutMinutes,
    aiPrecomputeOnStart,
    categoryStatsService,
    notifyFatalStartup: notifyMasterFatalStartup,
    port,
    host,
  });
}

startServer();
