import express from "express";
import { WebSocket } from "ws";
import { getOllamaConfig } from "./ai-ollama";
import { createAuthGuards } from "./auth/guards";
import { searchRateLimiter } from "./middleware/rate-limit";
import { registerActivityRoutes } from "./routes/activity.routes";
import { registerAuthRoutes } from "./routes/auth.routes";
import { registerImportRoutes } from "./routes/imports.routes";
import { registerSearchRoutes } from "./routes/search.routes";
import { ImportsRepository } from "./repositories/imports.repository";
import { SearchRepository } from "./repositories/search.repository";
import { PostgresStorage } from "./storage-postgres";
import { ImportAnalysisService } from "./services/import-analysis.service";

const app = express();
const storage = new PostgresStorage();
const importsRepository = new ImportsRepository();
const searchRepository = new SearchRepository();
const importAnalysisService = new ImportAnalysisService(importsRepository);

const DEFAULT_BODY_LIMIT = "2mb";
const IMPORT_BODY_LIMIT = process.env.IMPORT_BODY_LIMIT || "50mb";

app.use("/api/imports", express.json({ limit: IMPORT_BODY_LIMIT }));
app.use("/api/imports", express.urlencoded({ extended: true, limit: IMPORT_BODY_LIMIT }));
app.use(express.json({ limit: DEFAULT_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: DEFAULT_BODY_LIMIT }));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  return next();
});

const guards = createAuthGuards({ storage });
const connectedClients = new Map<string, WebSocket>();

registerAuthRoutes(app, {
  storage,
  authenticateToken: guards.authenticateToken,
  requireRole: guards.requireRole,
  connectedClients,
});

registerActivityRoutes(app, {
  storage,
  authenticateToken: guards.authenticateToken,
  requireRole: guards.requireRole,
  requireTabAccess: guards.requireTabAccess,
  connectedClients,
});

registerImportRoutes(app, {
  storage,
  importsRepository,
  importAnalysisService,
  authenticateToken: guards.authenticateToken,
  requireRole: guards.requireRole,
  requireTabAccess: guards.requireTabAccess,
  searchRateLimiter,
  getRuntimeSettingsCached: async () => ({ viewerRowsPerPage: 100 }),
  isDbProtected: () => false,
});

registerSearchRoutes(app, {
  storage,
  searchRepository,
  authenticateToken: guards.authenticateToken,
  requireRole: guards.requireRole,
  searchRateLimiter,
  getRuntimeSettingsCached: async () => ({
    searchResultLimit: 200,
    aiEnabled: true,
    semanticSearchEnabled: true,
    aiTimeoutMs: 6000,
  }),
  isDbProtected: () => false,
  getOllamaConfig,
});

export default app;
