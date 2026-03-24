import "dotenv/config";
import type { WorkerFatalMessage } from "./internal/worker-ipc";
import { startLocalServer } from "./internal/server-startup";
import { createLocalRuntimeEnvironment } from "./internal/local-runtime-environment";
import { pool } from "./db-postgres";
import { logger } from "./lib/logger";

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

const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 25_000;

let shuttingDown = false;

function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info("Received shutdown signal, closing gracefully", { signal });

  for (const [id, ws] of connectedClients.entries()) {
    try { ws.close(); } catch { /* already closed */ }
    connectedClients.delete(id);
  }

  server.close(async () => {
    try { await pool.end(); } catch { /* best-effort */ }
    logger.info("Server closed gracefully");
    process.exit(0);
  });

  setTimeout(() => {
    logger.warn("Graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, GRACEFUL_SHUTDOWN_TIMEOUT_MS).unref();
}

process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.once("SIGINT", () => gracefulShutdown("SIGINT"));

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
