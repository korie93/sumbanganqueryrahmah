import type { Express, RequestHandler } from "express";
import { asyncHandler } from "../http/async-handler";
import { ensureObject, readInteger } from "../http/validation";
import type { SearchRepository } from "../repositories/search.repository";
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

function buildRowsWithSource(rows: any[]) {
  return rows.map((row: any) => {
    const base = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object" ? row.jsonDataJsonb : {};
    return {
      ...base,
      "Source File": row.importFilename || row.importName || "",
    };
  });
}

function collectColumns(rows: Array<Record<string, unknown>>) {
  return Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>()),
  );
}

export function registerSearchRoutes(app: Express, deps: SearchRouteDeps) {
  const {
    searchRepository,
    authenticateToken,
    searchRateLimiter,
    getRuntimeSettingsCached,
    isDbProtected,
  } = deps;

  app.get("/api/search/columns", authenticateToken, asyncHandler(async (_req, res) => {
    return res.json(await searchRepository.getAllColumnNames());
  }));

  app.get("/api/columns", authenticateToken, asyncHandler(async (_req, res) => {
    return res.json(await searchRepository.getAllColumnNames());
  }));

  app.get("/api/search/global", authenticateToken, searchRateLimiter, asyncHandler(async (req, res) => {
    const search = String(req.query.q || "").trim();
    const runtimeSettings = await getRuntimeSettingsCached();
    const page = Math.max(1, readInteger(req.query.page, 1));
    const maxTotal = runtimeSettings.searchResultLimit;
    const maxLimit = isDbProtected() ? Math.min(maxTotal, 80) : maxTotal;
    const requestedLimit = readInteger(req.query.limit, 50);
    const limit = Math.max(10, Math.min(requestedLimit, maxLimit));
    const offset = (page - 1) * limit;

    if (offset >= maxTotal) {
      return res.json({
        columns: [],
        rows: [],
        results: [],
        total: maxTotal,
        page,
        limit,
      });
    }

    if (search.length < 2) {
      return res.json({
        columns: [],
        rows: [],
        results: [],
        total: 0,
      });
    }

    const effectiveLimit = Math.min(limit, Math.max(1, maxTotal - offset));
    const result = await searchRepository.searchGlobalDataRows({
      search,
      limit: effectiveLimit,
      offset,
    });

    const parsedRows = buildRowsWithSource(result.rows);
    const columns = collectColumns(parsedRows);

    return res.json({
      columns,
      rows: parsedRows,
      results: parsedRows,
      total: Math.min(result.total, maxTotal),
      page,
      limit: effectiveLimit,
    });
  }));

  app.get("/api/search", authenticateToken, searchRateLimiter, asyncHandler(async (req, res) => {
    const search = String(req.query.q || "").trim();
    if (search.length < 2) {
      return res.json({ results: [], total: 0 });
    }

    const queryResult = await searchRepository.searchSimpleDataRows(search);
    const rows = queryResult.rows || [];
    const results = rows.map((row: any) => ({
      ...(row.jsonDataJsonb || {}),
      _importId: row.importId,
      _importName: row.importName,
    }));

    return res.json({
      results,
      total: results.length,
    });
  }));

  app.post("/api/search/advanced", authenticateToken, asyncHandler(async (req, res) => {
    const body = ensureObject(req.body) || {};
    const filters = Array.isArray(body.filters) ? body.filters : [];
    const logic = body.logic === "OR" ? "OR" : "AND";
    const runtimeSettings = await getRuntimeSettingsCached();
    const page = Math.max(1, readInteger(body.page, 1));
    const maxTotal = runtimeSettings.searchResultLimit;
    const requestedLimit = readInteger(body.limit, 50);
    const limit = Math.max(10, Math.min(requestedLimit, maxTotal));
    const offset = (page - 1) * limit;

    if (offset >= maxTotal) {
      return res.json({
        results: [],
        headers: [],
        total: maxTotal,
        page,
        limit,
      });
    }

    const effectiveLimit = Math.min(limit, Math.max(1, maxTotal - offset));
    const rawResult = await searchRepository.advancedSearchDataRows(
      filters,
      logic,
      effectiveLimit,
      offset,
    );

    const parsedResults = buildRowsWithSource(rawResult.rows);
    const headers = collectColumns(parsedResults);

    return res.json({
      results: parsedResults,
      headers,
      total: Math.min(rawResult.total || 0, maxTotal),
      page,
      limit: effectiveLimit,
    });
  }));
}
