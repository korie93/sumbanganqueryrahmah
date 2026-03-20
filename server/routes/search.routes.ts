import type { Express, RequestHandler } from "express";
import { asyncHandler } from "../http/async-handler";
import { ensureObject, readInteger } from "../http/validation";
import type { SearchRepository } from "../repositories/search.repository";
import { SearchService } from "../services/search.service";
import type { PostgresStorage } from "../storage-postgres";

type RuntimeSettings = {
  searchResultLimit: number;
  aiEnabled: boolean;
  semanticSearchEnabled: boolean;
  aiTimeoutMs: number;
};

type SearchRouteDeps = {
  storage: PostgresStorage;
  searchRepository: SearchRepository;
  authenticateToken: RequestHandler;
  searchRateLimiter: RequestHandler;
  getRuntimeSettingsCached: () => Promise<RuntimeSettings>;
  isDbProtected: () => boolean;
};

export function registerSearchRoutes(app: Express, deps: SearchRouteDeps) {
  const {
    searchRepository,
    authenticateToken,
    searchRateLimiter,
    getRuntimeSettingsCached,
    isDbProtected,
  } = deps;
  const searchService = new SearchService(searchRepository);

  app.get("/api/search/columns", authenticateToken, asyncHandler(async (_req, res) => {
    return res.json(await searchService.getColumns());
  }));

  app.get("/api/columns", authenticateToken, asyncHandler(async (_req, res) => {
    return res.json(await searchService.getColumns());
  }));

  app.get("/api/search/global", authenticateToken, searchRateLimiter, asyncHandler(async (req, res) => {
    const search = String(req.query.q || "").trim();
    const runtimeSettings = await getRuntimeSettingsCached();
    const page = Math.max(1, readInteger(req.query.page, 1));
    const requestedLimit = readInteger(req.query.limit, 50);
    return res.json(await searchService.searchGlobal({
      search,
      page,
      requestedLimit,
      maxTotal: runtimeSettings.searchResultLimit,
      isDbProtected: isDbProtected(),
    }));
  }));

  app.get("/api/search", authenticateToken, searchRateLimiter, asyncHandler(async (req, res) => {
    return res.json(await searchService.searchSimple(String(req.query.q || "")));
  }));

  app.post("/api/search/advanced", authenticateToken, asyncHandler(async (req, res) => {
    const body = ensureObject(req.body) || {};
    const filters = Array.isArray(body.filters) ? body.filters : [];
    const logic = body.logic === "OR" ? "OR" : "AND";
    const runtimeSettings = await getRuntimeSettingsCached();
    const page = Math.max(1, readInteger(body.page, 1));
    const requestedLimit = readInteger(body.limit, 50);
    return res.json(await searchService.advancedSearch({
      filters,
      logic,
      page,
      requestedLimit,
      maxTotal: runtimeSettings.searchResultLimit,
    }));
  }));
}
