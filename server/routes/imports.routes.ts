import type { Express, RequestHandler, Response } from "express";
import type { AuthenticatedRequest } from "../auth/guards";
import { ensureObject, readInteger } from "../http/validation";
import type { ImportsRepository } from "../repositories/imports.repository";
import type { ImportAnalysisService } from "../services/import-analysis.service";
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

  app.get("/api/data-rows", authenticateToken, async (req, res) => {
    try {
      const importId = String(req.query.importId || "");
      const limit = readInteger(req.query.limit, 10);
      const offset = readInteger(req.query.offset, 0);
      const search = String(req.query.q || "").trim();

      if (!importId) {
        return res.status(400).json({ error: "importId is required" });
      }

      const result = await storage.searchDataRows({
        importId,
        search,
        limit,
        offset,
      });

      return res.json(result);
    } catch {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/imports", authenticateToken, async (_req, res) => {
    try {
      const imports = await importsRepository.getImportsWithRowCounts();
      return res.json({ imports });
    } catch (error: any) {
      return res.status(500).json({ message: error?.message || "Failed to load imports" });
    }
  });

  app.post("/api/imports", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = ensureObject(req.body) || {};
      const name = String(body.name ?? "");
      const filename = String(body.filename ?? "");
      const dataRows = Array.isArray(body.rows) ? body.rows : (Array.isArray(body.data) ? body.data : []);

      if (!Array.isArray(dataRows) || dataRows.length === 0) {
        return res.status(400).json({ message: "No data rows provided" });
      }

      const importRecord = await storage.createImport({
        name,
        filename,
        createdBy: req.user?.username,
      });

      const insertChunkSize = 20;
      for (let index = 0; index < dataRows.length; index += insertChunkSize) {
        const chunk = dataRows.slice(index, index + insertChunkSize);
        await Promise.all(
          chunk.map((row) =>
            storage.createDataRow({
              importId: importRecord.id,
              jsonDataJsonb: row,
            }),
          ),
        );
      }

      if (req.user?.username) {
        await storage.createAuditLog({
          action: "IMPORT_DATA",
          performedBy: req.user.username,
          targetResource: name,
          details: `Imported ${dataRows.length} rows from ${filename}`,
        });
      }

      return res.json(importRecord);
    } catch (error: any) {
      return res.status(500).json({ message: error?.message || "Import failed" });
    }
  });

  app.get("/api/imports/:id", authenticateToken, async (req, res) => {
    try {
      const importRecord = await storage.getImportById(req.params.id);
      if (!importRecord) {
        return res.status(404).json({ message: "Import not found" });
      }

      const rows = await storage.getDataRowsByImport(req.params.id);
      return res.json({ import: importRecord, rows });
    } catch (error: any) {
      return res.status(500).json({ message: error?.message || "Failed to load import" });
    }
  });

  app.get("/api/imports/:id/data", authenticateToken, searchRateLimiter, async (req, res) => {
    try {
      const runtimeSettings = await getRuntimeSettingsCached();
      const importId = String(req.params.id || "");
      const page = Math.max(1, readInteger(req.query.page, 1));
      const requestedLimit = readInteger(req.query.limit, runtimeSettings.viewerRowsPerPage);
      const maxLimit = Math.min(isDbProtected() ? 120 : 500, runtimeSettings.viewerRowsPerPage);
      const limit = Math.max(10, Math.min(requestedLimit, maxLimit));
      const offset = (page - 1) * limit;
      const search = String(req.query.search || "").trim();

      if (!importId) {
        return res.status(400).json({ message: "importId is required" });
      }

      const result = await storage.searchDataRows({
        importId,
        search: search || null,
        limit,
        offset,
      });

      const formattedRows = (result.rows || []).map((row: any) => ({
        id: row.id,
        importId: row.importId,
        jsonDataJsonb: row.jsonDataJsonb,
      }));

      return res.json({
        rows: formattedRows,
        total: result.total || 0,
        page,
        limit,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error?.message || "Failed to load import data" });
    }
  });

  app.get(
    "/api/imports/:id/analyze",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("analysis"),
    async (req, res) => {
      try {
        const importRecord = await storage.getImportById(req.params.id);
        if (!importRecord) {
          return res.status(404).json({ message: "Import not found" });
        }

        return res.json(await importAnalysisService.analyzeImport(importRecord));
      } catch (error: any) {
        return res.status(500).json({ message: error?.message || "Failed to analyze import" });
      }
    },
  );

  app.get("/api/analyze/all-summary", authenticateToken, async (_req, res) => {
    try {
      const imports = await importsRepository.getImportsWithRowCounts();
      return res.json(await importAnalysisService.analyzeAll(imports));
    } catch (error: any) {
      return res.status(500).json({ message: error?.message || "Failed to analyze imports" });
    }
  });

  app.get(
    "/api/analyze/all",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("analysis"),
    async (_req, res) => {
      try {
        const imports = await importsRepository.getImportsWithRowCounts();
        return res.json(await importAnalysisService.analyzeAll(imports));
      } catch (error: any) {
        return res.status(500).json({ message: error?.message || "Failed to analyze imports" });
      }
    },
  );

  app.patch("/api/imports/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = ensureObject(req.body) || {};
      const name = String(body.name ?? "");
      const updated = await storage.updateImportName(req.params.id, name);
      if (!updated) {
        return res.status(404).json({ message: "Import not found" });
      }
      if (req.user?.username) {
        await storage.createAuditLog({
          action: "UPDATE_IMPORT",
          performedBy: req.user.username,
          targetResource: name,
        });
      }
      return res.json(updated);
    } catch (error: any) {
      return res.status(500).json({ message: error?.message || "Failed to update import" });
    }
  });

  app.patch("/api/imports/:id/rename", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = ensureObject(req.body) || {};
      const name = String(body.name ?? "");
      const updated = await storage.updateImportName(req.params.id, name);
      if (!updated) {
        return res.status(404).json({ message: "Import not found" });
      }
      if (req.user?.username) {
        await storage.createAuditLog({
          action: "UPDATE_IMPORT",
          performedBy: req.user.username,
          targetResource: name,
        });
      }
      return res.json(updated);
    } catch (error: any) {
      return res.status(500).json({ message: error?.message || "Failed to rename import" });
    }
  });

  app.delete(
    "/api/imports/:id",
    authenticateToken,
    requireRole("admin", "superuser"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const importRecord = await storage.getImportById(req.params.id);
        const deleted = await storage.deleteImport(req.params.id);
        if (!deleted) {
          return res.status(404).json({ message: "Import not found" });
        }

        if (req.user?.username) {
          await storage.createAuditLog({
            action: "DELETE_IMPORT",
            performedBy: req.user.username,
            targetResource: importRecord?.name || req.params.id,
          });
        }

        return res.json({ success: true });
      } catch (error: any) {
        return res.status(500).json({ message: error?.message || "Failed to delete import" });
      }
    },
  );
}
