import "dotenv/config";
import cluster from "node:cluster";
import type { WorkerFatalMessage } from "./internal/worker-ipc";
import { startLocalServer } from "./internal/server-startup";
import { createLocalRuntimeEnvironment } from "./internal/local-runtime-environment";
import {
  resolvePgPoolShutdownTimeoutMs,
  shutdownPgPoolSafely,
} from "./internal/pg-pool-shutdown";
import { registerWorkerProcessFatalHandlers } from "./internal/worker-process-fatal-handlers";
import { markStartupFailed } from "./internal/startup-health";
import { pool, stopPgPoolBackgroundTasks } from "./db-postgres";
import { logger } from "./lib/logger";
import { runtimeConfig } from "./config/runtime";

let reportedWorkerFatalReason: string | null = null;

type WorkerIpcProcess = NodeJS.Process & {
  send?: (message: WorkerFatalMessage) => void;
};

type StartupReasonError = Error & {
  startupReason?: string;
};

const workerIpcProcess = process as WorkerIpcProcess;

function notifyMasterFatalReason(reason: string, details?: string) {
  if (reportedWorkerFatalReason) return;
  reportedWorkerFatalReason = reason;

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
  notifyFatalStartup: notifyMasterFatalReason,
});

const GRACEFUL_SHUTDOWN_TIMEOUT_MS = runtimeConfig.runtime.gracefulShutdownTimeoutMs;
const PG_POOL_SHUTDOWN_TIMEOUT_MS = resolvePgPoolShutdownTimeoutMs(GRACEFUL_SHUTDOWN_TIMEOUT_MS);

let shuttingDown = false;
let shutdownExitCode = 0;
let shutdownTimer: ReturnType<typeof setTimeout> | null = null;

async function finishShutdown() {
  if (shutdownTimer) {
    clearTimeout(shutdownTimer);
    shutdownTimer = null;
  }

  await shutdownPgPoolSafely({
    logger,
    phase: "graceful-shutdown",
    poolRef: pool,
    stopBackgroundTasks: stopPgPoolBackgroundTasks,
    timeoutMs: PG_POOL_SHUTDOWN_TIMEOUT_MS,
  });

  logger.info("Server closed gracefully");
  process.exit(shutdownExitCode);
}

function shutdownProcess(reason: string, exitCode: number, details?: string) {
  if (shuttingDown) {
    shutdownExitCode = Math.max(shutdownExitCode, exitCode);
    return;
  }
  shuttingDown = true;
  shutdownExitCode = exitCode;

  if (exitCode === 0) {
    logger.info("Received shutdown signal, closing gracefully", { signal: reason });
  } else {
    logger.error("Fatal worker error triggered shutdown", {
      reason,
      details,
    });
  }

  for (const [id, ws] of connectedClients.entries()) {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
    connectedClients.delete(id);
  }

  shutdownTimer = setTimeout(() => {
    logger.warn("Graceful shutdown timed out, forcing exit");
    process.exit(exitCode === 0 ? 1 : exitCode);
  }, GRACEFUL_SHUTDOWN_TIMEOUT_MS);
  shutdownTimer.unref();

  if (!server.listening) {
    void finishShutdown();
    return;
  }

  server.close(() => {
    void finishShutdown();
  });
}

function gracefulShutdown(signal: string) {
  shutdownProcess(signal, 0);
}

process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.once("SIGINT", () => gracefulShutdown("SIGINT"));

if (cluster.isWorker) {
  registerWorkerProcessFatalHandlers({
    logger,
    notifyMasterFatal: notifyMasterFatalReason,
    shutdown: ({ reason, details, exitCode }) => {
      shutdownProcess(reason, exitCode, details);
    },
  });
}

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
    notifyFatalStartup: notifyMasterFatalReason,
    port,
    host,
  });
}

startServer().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  const startupReasonCandidate =
    error instanceof Error ? (error as StartupReasonError).startupReason : null;
  const startupReason =
    typeof startupReasonCandidate === "string"
      ? startupReasonCandidate
      : "SERVER_STARTUP_ERROR";

  notifyMasterFatalReason(startupReason, message);
  markStartupFailed(startupReason, message);
  logger.error("Local server failed during startup", { error });

  await shutdownPgPoolSafely({
    logger,
    phase: "startup-failure",
    poolRef: pool,
    stopBackgroundTasks: stopPgPoolBackgroundTasks,
    timeoutMs: PG_POOL_SHUTDOWN_TIMEOUT_MS,
  });

  process.exit(1);
});
