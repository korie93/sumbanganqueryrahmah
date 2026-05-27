import type { Express } from "express";
import type { Server } from "http";
import type { WebSocket } from "ws";
import { runtimeConfig, runtimeConfigValidation } from "../config/runtime";
import {
  clearStartupServiceDegraded,
  markStartupServiceDegraded,
  markStartupFailed,
  markStartupReady,
  markStartupStage,
} from "./startup-health";
import type { PostgresStorage } from "../storage-postgres";
import type { CategoryStatsService } from "../services/category-stats.service";
import { logger } from "../lib/logger";
import { registerFrontendStatic } from "./frontend-static";
import { startIdleSessionSweeper } from "./idle-session-sweeper";
import { assertCollectionPiiRetirementStartupReady } from "./collection-pii-retirement-startup";
import { buildRateLimiterTopologyWarning } from "../middleware/rate-limit-runtime";
import { buildTwoFactorReplayCacheTopologyWarning } from "../auth/two-factor-replay-topology";
import { verifyCollectionReceiptExternalScanStartup } from "../lib/collection-receipt-external-scan-startup";

type RuntimeSettings = {
  sessionTimeoutMinutes: number;
  wsIdleMinutes: number;
};

type StartupStorage = Pick<
  PostgresStorage,
  | "init"
  | "getActiveActivities"
  | "expireIdleActivitySession"
>;

type StartLocalServerOptions = {
  app: Express;
  server: Server;
  storage: StartupStorage;
  connectedClients: Map<string, WebSocket>;
  getRuntimeSettingsCached: () => Promise<RuntimeSettings>;
  defaultSessionTimeoutMinutes: number;
  aiPrecomputeOnStart: boolean;
  categoryStatsService: Pick<CategoryStatsService, "warmCategoryStats">;
  notifyFatalStartup: (reason: string, details?: string) => void;
  markWebSocketConnectionsReady?: () => void;
  port?: number;
  host?: string;
};

function getServerStartupErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code ? code : undefined;
}

function getServerStartupErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createServerStartupError(reason: string, message: string) {
  const error = new Error(message);
  Object.assign(error, {
    startupReason: reason,
  });
  return error;
}

export async function startLocalServer(options: StartLocalServerOptions) {
  const {
    app,
    server,
    storage,
    connectedClients,
    getRuntimeSettingsCached,
    defaultSessionTimeoutMinutes,
    aiPrecomputeOnStart,
    categoryStatsService,
    notifyFatalStartup,
    markWebSocketConnectionsReady,
    port = runtimeConfig.app.port,
    host = runtimeConfig.app.host,
  } = options;

  logger.info("Starting local server", {
    app: "SQR - SUMBANGAN QUERY RAHMAH",
    mode: "local",
    database: "postgresql",
    host,
    port,
  });
  if (runtimeConfigValidation.warningCount > 0) {
    logger.warn("Runtime configuration warnings detected", {
      warningCount: runtimeConfigValidation.warningCount,
      warnings: runtimeConfigValidation.warnings,
    });
  }
  const configuredSecurityWorkerCount = runtimeConfig.cluster.maxWorkers;
  const rateLimiterTopologyWarning = buildRateLimiterTopologyWarning({
    distributedStoreConfigured: runtimeConfig.rateLimiting.store.distributedStoreConfigured,
    workerCount: configuredSecurityWorkerCount,
  });
  if (rateLimiterTopologyWarning) {
    logger.error("Rate limiter topology requires a shared store before scaling past one worker", {
      workerCount: configuredSecurityWorkerCount,
      message: rateLimiterTopologyWarning,
      storage: runtimeConfig.rateLimiting.store.provider,
      strictModeRefusal: runtimeConfig.app.isProductionLike,
    });
    markStartupServiceDegraded(
      "rate-limiter-topology",
      "PROCESS_LOCAL_RATE_LIMITER_MULTI_WORKER",
      rateLimiterTopologyWarning,
    );
  } else {
    clearStartupServiceDegraded("rate-limiter-topology");
  }
  const twoFactorReplayCacheTopologyWarning = buildTwoFactorReplayCacheTopologyWarning(
    configuredSecurityWorkerCount,
    runtimeConfig.rateLimiting.store.distributedStoreConfigured,
  );
  if (twoFactorReplayCacheTopologyWarning) {
    logger.warn("2FA replay protection requires a shared store before scaling past one worker", {
      workerCount: configuredSecurityWorkerCount,
      message: twoFactorReplayCacheTopologyWarning,
      storage: runtimeConfig.rateLimiting.store.provider,
    });
    markStartupServiceDegraded(
      "two-factor-replay-topology",
      "PROCESS_LOCAL_2FA_REPLAY_CACHE_MULTI_WORKER",
      twoFactorReplayCacheTopologyWarning,
    );
  } else {
    clearStartupServiceDegraded("two-factor-replay-topology");
  }

  markStartupStage("verifying-receipt-scanner");
  try {
    const receiptScanner = await verifyCollectionReceiptExternalScanStartup({
      isProductionLike: runtimeConfig.app.isProductionLike,
      logger,
    });
    if (receiptScanner.ready) {
      clearStartupServiceDegraded("receipt-external-scan");
    } else {
      markStartupServiceDegraded(
        "receipt-external-scan",
        "COLLECTION_RECEIPT_EXTERNAL_SCAN_UNAVAILABLE",
        receiptScanner.message,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const startupError = error instanceof Error ? error : new Error(message);
    Object.assign(startupError, {
      startupReason: "COLLECTION_RECEIPT_EXTERNAL_SCAN_UNAVAILABLE",
    });
    notifyFatalStartup("COLLECTION_RECEIPT_EXTERNAL_SCAN_UNAVAILABLE", message);
    markStartupFailed("COLLECTION_RECEIPT_EXTERNAL_SCAN_UNAVAILABLE", message);
    logger.error("Local server startup blocked by receipt external malware scanner policy", {
      error,
    });
    throw startupError;
  }

  markStartupStage("initializing-storage");
  await storage.init();
  try {
    await assertCollectionPiiRetirementStartupReady();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const startupError = error instanceof Error ? error : new Error(message);
    Object.assign(startupError, {
      startupReason: "COLLECTION_PII_RETIREMENT_BLOCKED",
    });
    notifyFatalStartup("COLLECTION_PII_RETIREMENT_BLOCKED", message);
    markStartupFailed("COLLECTION_PII_RETIREMENT_BLOCKED", message);
    logger.error("Local server startup blocked by collection PII retirement policy", {
      error,
    });
    throw startupError;
  }

  markStartupStage("registering-runtime");
  registerFrontendStatic(app);

  await new Promise<void>((resolve, reject) => {
    const handleStartupError = (err: unknown) => {
      const errorCode = getServerStartupErrorCode(err);
      if (errorCode === "EADDRINUSE") {
        const message = `Port ${port} is already in use`;
        notifyFatalStartup("EADDRINUSE", message);
        markStartupFailed("EADDRINUSE", message);
        logger.error("Server startup failed because the port is already in use", {
          port,
          hint: `Wait a few seconds and retry, or inspect the port with lsof -i :${port} or netstat -ano | findstr :${port} on Windows.`,
        });
        reject(createServerStartupError("EADDRINUSE", message));
        return;
      }

      const message = getServerStartupErrorMessage(err);
      notifyFatalStartup("SERVER_STARTUP_ERROR", message);
      markStartupFailed("SERVER_STARTUP_ERROR", message);
      logger.error("Server startup failed", { error: err, port, host });
      reject(createServerStartupError("SERVER_STARTUP_ERROR", message));
    };

    server.once("error", handleStartupError);
    server.listen(port, host, () => {
      server.off("error", handleStartupError);
      resolve();
    });
  });

  server.on("error", (err: unknown) => {
    logger.error("HTTP server emitted an error after startup", { error: err, port, host });
  });

  const idleSweeperHandle = startIdleSessionSweeper({
    storage,
    connectedClients,
    getRuntimeSettingsCached,
    defaultSessionTimeoutMinutes,
  });
  server.once("close", () => {
    clearInterval(idleSweeperHandle);
  });

  markStartupReady();
  markWebSocketConnectionsReady?.();
  logger.info("Local server is listening", {
    port,
    host,
    localUrl: `http://localhost:${port}`,
    lanUrl: `http://[IP-KOMPUTER]:${port}`,
  });

  if (!aiPrecomputeOnStart) {
    return;
  }

  // Run precompute in background so startup is fast.
  const precomputeHandle = setTimeout(async () => {
    try {
      const result = await categoryStatsService.warmCategoryStats();
      if (result.skipped) {
        logger.info("Category stats precompute skipped because cached data is already available");
        return;
      }
      logger.info("Precomputing category stats", { computeKeys: result.computeKeys });
      logger.info("Precomputed category stats");
    } catch (err) {
      logger.error("Category stats precompute failed", { error: err });
    }
  }, 0);
  precomputeHandle.unref?.();
}
