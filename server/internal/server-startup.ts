import type { Express } from "express";
import type { Server } from "http";
import type { WebSocket } from "ws";
import type { PostgresStorage } from "../storage-postgres";
import type { CategoryStatsService } from "../services/category-stats.service";
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
    port = parseInt(process.env.PORT || "5000", 10),
    host = "0.0.0.0",
  } = options;

  console.log("");
  console.log("=========================================");
  console.log("  SQR - SUMBANGAN QUERY RAHMAH");
  console.log("  Mode: Local (PostgreSQL Database)");
  console.log("=========================================");
  console.log("");

  console.log("  Database: PostgreSQL - OK");
  await storage.init();

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
      console.error(`ERROR Port ${port} is already in use.`);
      console.error("   This usually means a previous server process hasn't fully released the port yet.");
      console.error(`   Please wait a few seconds and try again, or use: lsof -i :${port} (or netstat -ano | findstr :${port} on Windows)`);
      setTimeout(() => process.exit(98), 10).unref();
      return;
    }

    notifyFatalStartup("SERVER_STARTUP_ERROR", String(err?.message || err));
    console.error("ERROR Server error:", err);
    setTimeout(() => process.exit(1), 10).unref();
  });

  server.listen(port, host, () => {
    console.log("");
    console.log("=========================================");
    console.log(`  Server berjalan di port ${port}`);
    console.log("");
    console.log("  Buka browser:");
    console.log(`    http://localhost:${port}`);
    console.log("");
    console.log("  Untuk akses dari PC lain (LAN):");
    console.log(`    http://[IP-KOMPUTER]:${port}`);
    console.log("=========================================");
    console.log("");
  });

  if (!aiPrecomputeOnStart) {
    return;
  }

  // Run precompute in background so startup is fast.
  setTimeout(async () => {
    try {
      const result = await categoryStatsService.warmCategoryStats();
      if (result.skipped) {
        console.log("OK Category stats already present. Skipping precompute.");
        return;
      }
      console.log(`INFO Precomputing category stats (${result.computeKeys} key(s))...`);
      console.log("OK Precomputed category stats.");
    } catch (err: any) {
      console.error("ERROR Precompute stats failed:", err?.message || err);
    }
  }, 0);
}
