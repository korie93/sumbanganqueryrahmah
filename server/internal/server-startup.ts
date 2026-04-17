import type { Express } from "express";
import type { Server } from "http";
import type { WebSocket } from "ws";
import { runtimeConfig, runtimeConfigValidation } from "../config/runtime";
import {
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

type RuntimeSettings = {
  sessionTimeoutMinutes: number;
  wsIdleMinutes: number;
};

type StartupStorage = Pick<
  PostgresStorage,
  | "init"
  | "getActiveActivities"
  | "expireIdleActivitySession"
  | "expireIdleActivitySessions"
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
  if (typeof storage.expireIdleActivitySessions !== "function") {
    throw new Error(
      "Local server startup requires batch idle session expiry support to avoid per-session sweeper queries.",
    );
  }
  const idleSweeperHandle = startIdleSessionSweeper({
    storage,
    connectedClients,
    getRuntimeSettingsCached,
    defaultSessionTimeoutMinutes,
  });
  server.once("close", () => {
    clearInterval(idleSweeperHandle);
  });

  server.on("error", (err: unknown) => {
    if (getServerStartupErrorCode(err) === "EADDRINUSE") {
      notifyFatalStartup("EADDRINUSE", `Port ${port} is already in use`);
      markStartupFailed("EADDRINUSE", `Port ${port} is already in use`);
      logger.error("Server startup failed because the port is already in use", {
        port,
        hint: `Wait a few seconds and retry, or inspect the port with lsof -i :${port} or netstat -ano | findstr :${port} on Windows.`,
      });
      setTimeout(() => process.exit(98), 10).unref();
      return;
    }

    const message = getServerStartupErrorMessage(err);
    notifyFatalStartup("SERVER_STARTUP_ERROR", message);
    markStartupFailed("SERVER_STARTUP_ERROR", message);
    logger.error("Server startup failed", { error: err, port, host });
    setTimeout(() => process.exit(1), 10).unref();
  });

  server.listen(port, host, () => {
    markStartupReady();
    logger.info("Local server is listening", {
      port,
      host,
      localUrl: `http://localhost:${port}`,
      lanUrl: `http://[IP-KOMPUTER]:${port}`,
    });
  });

  if (!aiPrecomputeOnStart) {
    return;
  }

  // Run precompute in background so startup is fast.
  const precomputeHandle = setTimeout(() => {
    void (async () => {
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
    })();
  }, 0);
  precomputeHandle.unref?.();
}
