import type { Express, RequestHandler, Response } from "express";
import type { AuthenticatedRequest } from "../auth/guards";
import { asyncHandler } from "../http/async-handler";
import { readInteger, readNonEmptyString } from "../http/validation";
import type { ImportsRepository } from "../repositories/imports.repository";
import type { ImportAnalysisService } from "../services/import-analysis.service";
import { ImportsService } from "../services/imports.service";
import type { PostgresStorage } from "../storage-postgres";

type RuntimeSettings = {
  viewerRowsPerPage: number;
};

type ImportsRouteDeps = {
  storage: PostgresStorage;
  importsRepository: ImportsRepository;
  importAnalysisService: ImportAnalysisService;
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  requireTabAccess: (tabId: string) => RequestHandler;
  searchRateLimiter: RequestHandler;
  getRuntimeSettingsCached: () => Promise<RuntimeSettings>;
  isDbProtected: () => boolean;
};

export function registerImportRoutes(app: Express, deps: ImportsRouteDeps) {
  const {
    storage,
    importsRepository,
    importAnalysisService,
    authenticateToken,
    requireRole,
    requireTabAccess,
    searchRateLimiter,
    getRuntimeSettingsCached,
    isDbProtected,
  } = deps;
  const importsService = new ImportsService(storage, importsRepository, importAnalysisService);

  app.get("/api/data-rows", authenticateToken, asyncHandler(async (req, res) => {
    const importId = readNonEmptyString(req.query.importId);
    const limit = readInteger(req.query.limit, 10);
    const offset = readInteger(req.query.offset, 0);
    const search = String(req.query.q || "").trim();

    if (!importId) {
      return res.status(400).json({ error: "importId is required" });
    }

    const result = await importsService.searchImportRows({
      importId,
      search: search || null,
      limit,
      offset,
    });

    return res.json(result);
  }));

  app.get("/api/imports", authenticateToken, asyncHandler(async (_req, res) => {
    const imports = await importsService.listImports();
    return res.json({ imports });
  }));

  app.post("/api/imports", authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { name, filename, dataRows } = importsService.parseCreateImportBody(req.body);

    if (!Array.isArray(dataRows) || dataRows.length === 0) {
      return res.status(400).json({ message: "No data rows provided" });
    }

    const importRecord = await importsService.createImport({
      name,
      filename,
      dataRows,
      createdBy: req.user?.username,
    });

    return res.json(importRecord);
  }));

  app.get("/api/imports/:id", authenticateToken, asyncHandler(async (req, res) => {
    const importId = readNonEmptyString(req.params.id);
    if (!importId) {
      return res.status(400).json({ message: "Import not found" });
    }

    const details = await importsService.getImportDetails(importId);
    if (!details) {
      return res.status(404).json({ message: "Import not found" });
    }

    return res.json(details);
  }));

  app.get("/api/imports/:id/data", authenticateToken, searchRateLimiter, asyncHandler(async (req, res) => {
    const runtimeSettings = await getRuntimeSettingsCached();
    const importId = readNonEmptyString(req.params.id);
    const page = Math.max(1, readInteger(req.query.page, 1));
    const requestedLimit = readInteger(req.query.limit, runtimeSettings.viewerRowsPerPage);
    const search = String(req.query.search || "").trim();

    if (!importId) {
      return res.status(400).json({ message: "importId is required" });
    }

    const result = await importsService.getImportDataPage({
      importId,
      page,
      requestedLimit,
      viewerRowsPerPage: runtimeSettings.viewerRowsPerPage,
      isDbProtected: isDbProtected(),
      search,
    });
    return res.json(result);
  }));

  app.get(
    "/api/imports/:id/analyze",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("analysis"),
    asyncHandler(async (req, res) => {
      const analysis = await importsService.analyzeImport(req.params.id);
      if (!analysis) {
        return res.status(404).json({ message: "Import not found" });
      }

      return res.json(analysis);
    }),
  );

  app.get("/api/analyze/all-summary", authenticateToken, asyncHandler(async (_req, res) => {
    return res.json(await importsService.analyzeAll());
  }));

  app.get(
    "/api/analyze/all",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("analysis"),
    asyncHandler(async (_req, res) => {
      return res.json(await importsService.analyzeAll());
    }),
  );

  app.patch("/api/imports/:id", authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { name } = importsService.parseRenameBody(req.body);
    const updated = await importsService.renameImport(req.params.id, name, req.user?.username);
    if (!updated) {
      return res.status(404).json({ message: "Import not found" });
    }

    return res.json(updated);
  }));

  app.patch("/api/imports/:id/rename", authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { name } = importsService.parseRenameBody(req.body);
    const updated = await importsService.renameImport(req.params.id, name, req.user?.username);
    if (!updated) {
      return res.status(404).json({ message: "Import not found" });
    }

    return res.json(updated);
  }));

  app.delete(
    "/api/imports/:id",
    authenticateToken,
    requireRole("admin", "superuser"),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const deleted = await importsService.deleteImport(req.params.id, req.user?.username);
      if (!deleted) {
        return res.status(404).json({ message: "Import not found" });
      }

      return res.json({ success: true });
    }),
  );
}
