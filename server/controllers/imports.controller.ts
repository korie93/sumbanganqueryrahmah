import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/guards";
import { badRequest } from "../http/errors";
import { readInteger, readNonEmptyString } from "../http/validation";
import type { ImportsService } from "../services/imports.service";

type RuntimeSettings = {
  viewerRowsPerPage: number;
};

type CreateImportsControllerDeps = {
  importsService: ImportsService;
  getRuntimeSettingsCached: () => Promise<RuntimeSettings>;
  isDbProtected: () => boolean;
};

export type ImportsController = ReturnType<typeof createImportsController>;

export function createImportsController(deps: CreateImportsControllerDeps) {
  const {
    importsService,
    getRuntimeSettingsCached,
    isDbProtected,
  } = deps;

  const listDataRows = async (req: AuthenticatedRequest, res: Response) => {
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
  };

  const listImports = async (_req: AuthenticatedRequest, res: Response) => {
    const cursor = readNonEmptyString(_req.query.cursor);
    const limit = readInteger(_req.query.limit, 100);
    const search = readNonEmptyString(_req.query.search);
    const createdOn = readNonEmptyString(_req.query.createdOn);

    try {
      const result = await importsService.listImports({
        cursor: cursor || null,
        limit,
        search: search || null,
        createdOn: createdOn || null,
      });
      return res.json({
        imports: result.items,
        pagination: {
          limit: result.limit,
          nextCursor: result.nextCursor,
          hasMore: result.nextCursor !== null,
          total: result.total,
        },
      });
    } catch (error) {
      if (error instanceof Error && /invalid imports cursor/i.test(error.message)) {
        throw badRequest("Invalid imports cursor.");
      }
      throw error;
    }
  };

  const createImport = async (req: AuthenticatedRequest, res: Response) => {
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
  };

  const getImport = async (req: AuthenticatedRequest, res: Response) => {
    const importId = readNonEmptyString(req.params.id);
    if (!importId) {
      return res.status(400).json({ message: "Import not found" });
    }

    const details = await importsService.getImportDetails(importId);
    if (!details) {
      return res.status(404).json({ message: "Import not found" });
    }

    return res.json(details);
  };

  const getImportDataPage = async (req: AuthenticatedRequest, res: Response) => {
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
  };

  const analyzeImport = async (req: AuthenticatedRequest, res: Response) => {
    const analysis = await importsService.analyzeImport(req.params.id);
    if (!analysis) {
      return res.status(404).json({ message: "Import not found" });
    }

    return res.json(analysis);
  };

  const analyzeAll = async (_req: AuthenticatedRequest, res: Response) => {
    return res.json(await importsService.analyzeAll());
  };

  const renameImport = async (req: AuthenticatedRequest, res: Response) => {
    const { name } = importsService.parseRenameBody(req.body);
    const updated = await importsService.renameImport(req.params.id, name, req.user?.username);
    if (!updated) {
      return res.status(404).json({ message: "Import not found" });
    }

    return res.json(updated);
  };

  const deleteImport = async (req: AuthenticatedRequest, res: Response) => {
    const deleted = await importsService.deleteImport(req.params.id, req.user?.username);
    if (!deleted) {
      return res.status(404).json({ message: "Import not found" });
    }

    return res.json({ success: true });
  };

  return {
    listDataRows,
    listImports,
    createImport,
    getImport,
    getImportDataPage,
    analyzeImport,
    analyzeAll,
    renameImport,
    deleteImport,
  };
}
