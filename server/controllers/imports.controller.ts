import type { Response } from "express";
import { z } from "zod";
import type { AuthenticatedRequest } from "../auth/guards";
import { badRequest, notFound } from "../http/errors";
import { runWithRequestDeadline } from "../http/request-deadline";
import { readInteger, readNonEmptyString } from "../http/validation";
import type { ImportDataColumnFilter, ImportsService } from "../services/imports.service";

type RuntimeSettings = {
  viewerRowsPerPage: number;
};

type CreateImportsControllerDeps = {
  importsService: ImportsService;
  getRuntimeSettingsCached: () => Promise<RuntimeSettings>;
  isDbProtected: () => boolean;
  analysisRequestTimeoutMs?: number;
};

export type ImportsController = ReturnType<typeof createImportsController>;

const viewerColumnFilterSchema = z.object({
  column: z.string().trim().min(1).max(120),
  operator: z.enum(["contains", "equals", "startsWith", "endsWith", "notEquals"]),
  value: z.string().trim().min(1).max(500),
});

const viewerColumnFiltersSchema = z.array(viewerColumnFilterSchema).max(10);

function buildImportMutationSuccessPayload<T extends Record<string, unknown>>(payload?: T) {
  return {
    ok: true as const,
    success: true as const,
    ...(payload ?? {}),
  };
}

function parseViewerColumnFiltersQuery(value: unknown): ImportDataColumnFilter[] {
  const normalized = readNonEmptyString(value);
  if (!normalized) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    throw badRequest("Invalid viewer column filters.");
  }

  const result = viewerColumnFiltersSchema.safeParse(parsed);
  if (!result.success) {
    throw badRequest("Invalid viewer column filters.");
  }

  return result.data;
}

export function createImportsController(deps: CreateImportsControllerDeps) {
  const {
    importsService,
    getRuntimeSettingsCached,
    isDbProtected,
    analysisRequestTimeoutMs,
  } = deps;

  const listDataRows = async (req: AuthenticatedRequest, res: Response) => {
    const importId = readNonEmptyString(req.query.importId);
    const limit = readInteger(req.query.limit, 10);
    const offset = readInteger(req.query.offset, 0);
    const search = String(req.query.q || "").trim();

    if (!importId) {
      throw badRequest("importId is required");
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
      throw badRequest("No data rows provided");
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
      throw notFound("Import not found");
    }

    const details = await importsService.getImportDetails(importId);
    if (!details) {
      throw notFound("Import not found");
    }

    return res.json(details);
  };

  const getImportDataPage = async (req: AuthenticatedRequest, res: Response) => {
    const runtimeSettings = await getRuntimeSettingsCached();
    const importId = readNonEmptyString(req.params.id);
    const page = Math.max(1, readInteger(req.query.page, 1));
    const cursor = readNonEmptyString(req.query.cursor);
    const requestedLimit = readInteger(req.query.limit, runtimeSettings.viewerRowsPerPage);
    const search = String(req.query.search || "").trim();
    const columnFilters = parseViewerColumnFiltersQuery(req.query.columnFilters);

    if (!importId) {
      throw badRequest("importId is required");
    }

    try {
      const result = await importsService.getImportDataPage({
        importId,
        page,
        cursor: cursor || null,
        requestedLimit,
        viewerRowsPerPage: runtimeSettings.viewerRowsPerPage,
        isDbProtected: isDbProtected(),
        search,
        columnFilters,
      });

      return res.json(result);
    } catch (error) {
      if (error instanceof Error && /invalid import data cursor/i.test(error.message)) {
        throw badRequest("Invalid import data cursor.");
      }
      throw error;
    }
  };

  const analyzeImport = async (req: AuthenticatedRequest, res: Response) => {
    const outcome = await runWithRequestDeadline(
      res,
      {
        timeoutMs: analysisRequestTimeoutMs ?? 45_000,
        operationName: "import-analysis",
        timeoutMessage:
          "Import analysis is taking longer than expected. Please retry in a moment.",
      },
      () => importsService.analyzeImport(req.params.id),
    );
    if (outcome.timedOut) {
      return;
    }

    const analysis = outcome.value;
    if (!analysis) {
      throw notFound("Import not found");
    }

    return res.json(analysis);
  };

  const analyzeAll = async (_req: AuthenticatedRequest, res: Response) => {
    const outcome = await runWithRequestDeadline(
      res,
      {
        timeoutMs: analysisRequestTimeoutMs ?? 45_000,
        operationName: "imports-analysis-all",
        timeoutMessage:
          "Import analysis is taking longer than expected. Please retry in a moment.",
      },
      () => importsService.analyzeAll(),
    );
    if (outcome.timedOut) {
      return;
    }

    return res.json(outcome.value);
  };

  const renameImport = async (req: AuthenticatedRequest, res: Response) => {
    const { name } = importsService.parseRenameBody(req.body);
    const updated = await importsService.renameImport(req.params.id, name, req.user?.username);
    if (!updated) {
      throw notFound("Import not found");
    }

    return res.json(updated);
  };

  const deleteImport = async (req: AuthenticatedRequest, res: Response) => {
    const deleted = await importsService.deleteImport(req.params.id, req.user?.username);
    if (!deleted) {
      throw notFound("Import not found");
    }

    return res.json(buildImportMutationSuccessPayload());
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
