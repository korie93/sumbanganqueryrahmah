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

type RuntimeSettings = {
  sessionTimeoutMinutes: number;
  wsIdleMinutes: number;
};

type StartupStorage = Pick<
  PostgresStorage,
  | "init"
  | "getActiveActivities"
  | "getActivityById"
  | "updateActivity"
  | "createAuditLog"
  | "clearCollectionNicknameSessionByActivity"
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

  markStartupStage("registering-runtime");
  registerFrontendStatic(app);
  const idleSweeperHandle = startIdleSessionSweeper({
    storage,
    connectedClients,
    getRuntimeSettingsCached,
    defaultSessionTimeoutMinutes,
  });
  server.once("close", () => {
    clearInterval(idleSweeperHandle);
  });

  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      notifyFatalStartup("EADDRINUSE", `Port ${port} is already in use`);
      markStartupFailed("EADDRINUSE", `Port ${port} is already in use`);
      logger.error("Server startup failed because the port is already in use", {
        port,
        hint: `Wait a few seconds and retry, or inspect the port with lsof -i :${port} or netstat -ano | findstr :${port} on Windows.`,
      });
      setTimeout(() => process.exit(98), 10).unref();
      return;
    }

    notifyFatalStartup("SERVER_STARTUP_ERROR", String(err?.message || err));
    markStartupFailed("SERVER_STARTUP_ERROR", String(err?.message || err));
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
  setTimeout(async () => {
    try {
      const result = await categoryStatsService.warmCategoryStats();
      if (result.skipped) {
        logger.info("Category stats precompute skipped because cached data is already available");
        return;
      }
      logger.info("Precomputing category stats", { computeKeys: result.computeKeys });
      logger.info("Precomputed category stats");
    } catch (err: any) {
      logger.error("Category stats precompute failed", { error: err });
    }
  }, 0);
}
