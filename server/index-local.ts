import "dotenv/config";
import cluster from "node:cluster";
import { WebSocket } from "ws";
import type { WorkerFatalMessage, WorkerReadyMessage } from "./internal/worker-ipc";
import { startLocalServer } from "./internal/server-startup";
import { createLocalRuntimeEnvironment } from "./internal/local-runtime-environment";
import { notifySupervisorReady } from "./internal/process-supervisor-readiness";
import {
  resolvePgPoolShutdownTimeoutMs,
  shutdownPgPoolSafely,
} from "./internal/pg-pool-shutdown";
import { stopIntelligenceFailSafeLogger } from "./intelligence/intelligence-failsafe-logger";
import { registerLocalProcessFatalHandlers } from "./internal/local-process-fatal-handlers";
import { markStartupFailed } from "./internal/startup-health";
import { closePostgresPools, stopPgPoolBackgroundTasks } from "./db-postgres";
import { logger } from "./lib/logger";
import { runtimeConfig } from "./config/runtime";
import { validateSessionJwtStartupConfiguration } from "./auth/session-jwt";
import { stopAdaptiveRateLimitCooldownSweep } from "./middleware/rate-limit";
import { closeHttpServerForShutdown } from "./internal/http-server-shutdown";
import { initializeTelemetry, shutdownTelemetry } from "./telemetry/tracer";

let reportedWorkerFatalReason: string | null = null;

type WorkerIpcProcess = NodeJS.Process & {
  send?: (message: "ready" | WorkerFatalMessage | WorkerReadyMessage) => void;
};

type StartupReasonError = Error & {
  startupReason?: string;
};

const workerIpcProcess = process as WorkerIpcProcess;
validateSessionJwtStartupConfiguration();
initializeTelemetry();

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

function notifyRuntimeReady() {
  if (cluster.isWorker) {
    if (typeof workerIpcProcess.send !== "function") {
      return;
    }

    try {
      workerIpcProcess.send({
        type: "worker-ready",
        payload: { pid: process.pid, readyAt: Date.now() },
      });
    } catch {
      // PM2 readiness is best-effort; fatal startup reporting remains separate.
    }
    return;
  }

  notifySupervisorReady(workerIpcProcess, logger);
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
  markWebSocketConnectionsReady,
  markWebSocketConnectionsDraining,
} = createLocalRuntimeEnvironment({
  onGracefulShutdownMessage: (reason) => {
    shutdownProcess(reason, 0);
  },
  notifyFatalStartup: notifyMasterFatalReason,
});

const GRACEFUL_SHUTDOWN_TIMEOUT_MS = runtimeConfig.runtime.gracefulShutdownTimeoutMs;
const PG_POOL_SHUTDOWN_TIMEOUT_MS = resolvePgPoolShutdownTimeoutMs(GRACEFUL_SHUTDOWN_TIMEOUT_MS);

let shuttingDown = false;
let shutdownExitCode = 0;
let shutdownTimer: ReturnType<typeof setTimeout> | null = null;
let serverCloseCleanupTriggered = false;
let deregisterLocalFatalHandlers: (() => void) | null = null;

server.once("close", () => {
  serverCloseCleanupTriggered = true;
});

function triggerServerCloseCleanupForUnstartedServer() {
  if (serverCloseCleanupTriggered) {
    return;
  }
  serverCloseCleanupTriggered = true;
  server.emit("close");
}

async function finishShutdown() {
  if (shutdownTimer) {
    clearTimeout(shutdownTimer);
    shutdownTimer = null;
  }

  stopIntelligenceFailSafeLogger();
  stopAdaptiveRateLimitCooldownSweep();

  await shutdownPgPoolSafely({
    logger,
    phase: "graceful-shutdown",
    poolRef: { end: closePostgresPools },
    stopBackgroundTasks: stopPgPoolBackgroundTasks,
    timeoutMs: PG_POOL_SHUTDOWN_TIMEOUT_MS,
  });
  await shutdownTelemetry();

  logger.info("Server closed gracefully");
  process.exit(shutdownExitCode);
}

function finishShutdownSafely() {
  void finishShutdown().catch((error) => {
    logger.error("Server shutdown finalization failed", { error });
    process.exit(shutdownExitCode === 0 ? 1 : shutdownExitCode);
  });
}

function shutdownProcess(reason: string, exitCode: number, details?: string) {
  if (shuttingDown) {
    shutdownExitCode = Math.max(shutdownExitCode, exitCode);
    return;
  }
  shuttingDown = true;
  shutdownExitCode = exitCode;
  deregisterLocalFatalHandlers?.();
  deregisterLocalFatalHandlers = null;
  markWebSocketConnectionsDraining();

  if (exitCode === 0) {
    logger.info("Received shutdown signal, closing gracefully", { signal: reason });
  } else {
    logger.error("Fatal process error triggered shutdown", {
      reason,
      details,
    });
  }

  const webSocketShutdownSnapshot = Array.from(connectedClients.entries());
  for (const [id, ws] of webSocketShutdownSnapshot) {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      try {
        ws.close(1001, "server shutting down");
      } catch (error) {
        logger.warn("WebSocket close request failed during graceful shutdown", { error });
        try {
          ws.terminate();
        } catch (terminateError) {
          logger.warn("WebSocket terminate fallback failed during graceful shutdown", {
            error: terminateError,
          });
        }
      }
    }
    if (connectedClients.get(id) === ws) {
      connectedClients.delete(id);
    }
  }

  shutdownTimer = setTimeout(() => {
    logger.warn("Graceful shutdown timed out, forcing exit");
    process.exit(exitCode === 0 ? 1 : exitCode);
  }, GRACEFUL_SHUTDOWN_TIMEOUT_MS);
  shutdownTimer.unref();

  if (!server.listening) {
    triggerServerCloseCleanupForUnstartedServer();
    finishShutdownSafely();
    return;
  }

  void closeHttpServerForShutdown({
    logger,
    server,
  }).then(() => {
    finishShutdownSafely();
  }).catch((error) => {
    logger.error("HTTP server shutdown drain failed", { error });
    finishShutdownSafely();
  });
}

function gracefulShutdown(signal: string) {
  shutdownProcess(signal, 0);
}

function handleSupervisorShutdownMessage(message: unknown) {
  if (message !== "shutdown") {
    return;
  }

  process.off("message", handleSupervisorShutdownMessage);
  gracefulShutdown("PM2_SHUTDOWN_MESSAGE");
}

process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.once("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("message", handleSupervisorShutdownMessage);

deregisterLocalFatalHandlers = registerLocalProcessFatalHandlers({
  logger,
  notifyFatal: notifyMasterFatalReason,
  shutdown: ({ reason, details, exitCode }) => {
    shutdownProcess(reason, exitCode, details);
  },
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
    notifyFatalStartup: notifyMasterFatalReason,
    markWebSocketConnectionsReady,
    port,
    host,
  });
  notifyRuntimeReady();
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
  shutdownProcess(startupReason, startupReason === "EADDRINUSE" ? 98 : 1, message);
});
