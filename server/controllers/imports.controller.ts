import type { Response } from "express";
import { z } from "zod";
import type { AuthenticatedRequest } from "../auth/guards";
import { badRequest, conflict, notFound } from "../http/errors";
import { runWithRequestDeadline } from "../http/request-deadline";
import { readInteger, readNonEmptyString, readPageLimit, readRouteParam } from "../http/validation";
import {
  cleanupPreparedMultipartImportUpload,
  type PreparedMultipartImportUpload,
} from "../routes/imports-multipart-utils";
import {
  completeImportMutationIdempotency,
  releaseImportMutationIdempotency,
} from "../routes/imports-idempotency";
import { ImportUploadValidationError } from "../services/import-upload-file-utils";
import type { ImportDataColumnFilter, ImportsService } from "../services/imports.service";
import { parseImportColumnMapping } from "../services/import-column-mapping";
import type { ImportBackgroundJobService } from "../services/import-background-job.service";
import { DuplicateImportError } from "../services/import-operation-errors";
import { parseImportUploadFile } from "../services/import-upload-parser";
import { ERROR_CODES } from "../../shared/error-codes";

type RuntimeSettings = {
  viewerRowsPerPage: number;
};

type CreateImportsControllerDeps = {
  importsService: ImportsService;
  getRuntimeSettingsCached: () => Promise<RuntimeSettings>;
  isDbProtected: () => boolean;
  analysisRequestTimeoutMs?: number | undefined;
  importBackgroundJobService?: ImportBackgroundJobService | undefined;
  importBackgroundThresholdBytes?: number | undefined;
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
    importBackgroundJobService,
    importBackgroundThresholdBytes = Number.POSITIVE_INFINITY,
  } = deps;

  const listDataRows = async (req: AuthenticatedRequest, res: Response) => {
    const importId = readNonEmptyString(req.query.importId);
    const pageSize = readPageLimit(req.query.pageSize ?? req.query.limit, 10, 1_000);
    const page = Math.max(1, readInteger(req.query.page, 1));
    const offsetQuery = readNonEmptyString(req.query.offset);
    const offset = offsetQuery ? readInteger(req.query.offset, 0) : (page - 1) * pageSize;
    const search = String(req.query.q || "").trim();

    if (!importId) {
      throw badRequest("importId is required");
    }

    const result = await importsService.searchImportRows({
      importId,
      search: search || null,
      limit: pageSize,
      offset,
    });

    return res.json(result);
  };

  const listImports = async (_req: AuthenticatedRequest, res: Response) => {
    const cursor = readNonEmptyString(_req.query.cursor);
    const pageSize = readPageLimit(_req.query.pageSize ?? _req.query.limit, 100, 200);
    const search = readNonEmptyString(_req.query.search);
    const createdOn = readNonEmptyString(_req.query.createdOn);

    try {
      const result = await importsService.listImports({
        cursor: cursor || null,
        limit: pageSize,
        search: search || null,
        createdOn: createdOn || null,
      });
      return res.json({
        imports: result.items,
        pagination: {
          mode: "cursor" as const,
          limit: result.limit,
          pageSize: result.limit,
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
    const multipartImportUpload = (res.locals as {
      multipartImportUpload?: PreparedMultipartImportUpload;
    }).multipartImportUpload;

    try {
      if (multipartImportUpload?.kind === "staged-file") {
        const body = req.body && typeof req.body === "object"
          ? req.body as Record<string, unknown>
          : {};
        const name = String(body.name ?? "");
        const filename = String(body.filename ?? multipartImportUpload.filename ?? "");
        const columnMapping = parseImportColumnMapping(body.columnMapping);
        const requestedBy = String(req.user?.username || "").trim();

        if (
          importBackgroundJobService?.configured
          && multipartImportUpload.sourceSizeBytes >= importBackgroundThresholdBytes
        ) {
          const queuedJob = await importBackgroundJobService.enqueue({
            upload: multipartImportUpload,
            name,
            requestedBy,
            columnMapping,
          });
          delete (res.locals as {
            multipartImportUpload?: PreparedMultipartImportUpload;
          }).multipartImportUpload;
          const payload = {
            status: "queued" as const,
            job: queuedJob,
          };
          await completeImportMutationIdempotency(res, payload, 202);
          return res.status(202).json(payload);
        }

        const commonInput = {
          name,
          filename,
          createdBy: requestedBy,
          contentHashSha256: multipartImportUpload.contentHashSha256,
          sourceSizeBytes: multipartImportUpload.sourceSizeBytes,
          columnMapping,
        };
        const importRecord = filename.toLowerCase().endsWith(".csv")
          ? await importsService.createImportFromCsvFile({
              ...commonInput,
              filePath: multipartImportUpload.filePath,
            })
          : await (async () => {
              const parsed = await parseImportUploadFile(
                filename,
                multipartImportUpload.filePath,
              );
              if (parsed.error) {
                throw new ImportUploadValidationError(
                  parsed.error,
                  ERROR_CODES.IMPORT_PARSE_FAILED,
                );
              }
              return importsService.createImport({
                ...commonInput,
                dataRows: parsed.rows,
              });
            })();

        await completeImportMutationIdempotency(res, importRecord);
        return res.json(importRecord);
      }

      const { name, filename, dataRows } = importsService.parseCreateImportBody(req.body);
      const rawBody = req.body && typeof req.body === "object"
        ? req.body as Record<string, unknown>
        : {};
      const columnMapping = parseImportColumnMapping(rawBody.columnMapping);

      if (!Array.isArray(dataRows) || dataRows.length === 0) {
        throw badRequest("No data rows provided");
      }

      const importRecord = await importsService.createImport({
        name,
        filename,
        dataRows,
        createdBy: req.user?.username,
        columnMapping,
      });

      await completeImportMutationIdempotency(res, importRecord);
      return res.json(importRecord);
    } catch (error) {
      await releaseImportMutationIdempotency(res);
      if (error instanceof ImportUploadValidationError) {
        throw badRequest(error.message, error.code);
      }
      if (error instanceof DuplicateImportError) {
        throw conflict(
          "This file has already been imported.",
          ERROR_CODES.IMPORT_DUPLICATE_FILE,
        );
      }
      throw error;
    } finally {
      await cleanupPreparedMultipartImportUpload(multipartImportUpload);
      delete (res.locals as { multipartImportUpload?: PreparedMultipartImportUpload }).multipartImportUpload;
    }
  };

  const getImportJob = async (req: AuthenticatedRequest, res: Response) => {
    const jobId = readRouteParam(req.params.jobId, "import job id");
    const job = await importBackgroundJobService?.getJob(
      jobId,
      String(req.user?.username || ""),
    );
    if (!job) {
      throw notFound("Import job not found");
    }
    return res.json(job);
  };

  const cancelImportJob = async (req: AuthenticatedRequest, res: Response) => {
    const jobId = readRouteParam(req.params.jobId, "import job id");
    const job = await importBackgroundJobService?.cancel(
      jobId,
      String(req.user?.username || ""),
    );
    if (!job) {
      throw notFound("Import job not found");
    }
    return res.json(job);
  };

  const resumeImportJob = async (req: AuthenticatedRequest, res: Response) => {
    const jobId = readRouteParam(req.params.jobId, "import job id");
    const job = await importBackgroundJobService?.resume(
      jobId,
      String(req.user?.username || ""),
    );
    if (!job) {
      throw notFound("Import job not found");
    }
    return res.status(202).json(job);
  };

  const getImport = async (req: AuthenticatedRequest, res: Response) => {
    const importId = readRouteParam(req.params.id, "import id");
    const details = await importsService.getImportDetails(importId);
    if (!details) {
      throw notFound("Import not found");
    }

    return res.json(details);
  };

  const getImportDataPage = async (req: AuthenticatedRequest, res: Response) => {
    const runtimeSettings = await getRuntimeSettingsCached();
    const importId = readRouteParam(req.params.id, "import id");
    const page = Math.max(1, readInteger(req.query.page, 1));
    const cursor = readNonEmptyString(req.query.cursor);
    const requestedPageSize = readPageLimit(
      req.query.pageSize ?? req.query.limit,
      runtimeSettings.viewerRowsPerPage,
      runtimeSettings.viewerRowsPerPage,
    );
    const search = String(req.query.search || "").trim();
    const columnFilters = parseViewerColumnFiltersQuery(req.query.columnFilters);

    try {
      const result = await importsService.getImportDataPage({
        importId,
        page,
        cursor: cursor || null,
        requestedLimit: requestedPageSize,
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
    const importId = readRouteParam(req.params.id, "import id");
    const outcome = await runWithRequestDeadline(
      res,
      {
        timeoutMs: analysisRequestTimeoutMs ?? 45_000,
        operationName: "import-analysis",
        timeoutMessage:
          "Import analysis is taking longer than expected. Please retry in a moment.",
      },
      (signal) => importsService.analyzeImport(importId, signal),
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
      (signal) => importsService.analyzeAll(signal),
    );
    if (outcome.timedOut) {
      return;
    }

    return res.json(outcome.value);
  };

  const renameImport = async (req: AuthenticatedRequest, res: Response) => {
    const importId = readRouteParam(req.params.id, "import id");
    const { name } = importsService.parseRenameBody(req.body);
    const updated = await importsService.renameImport(importId, name, req.user?.username);
    if (!updated) {
      throw notFound("Import not found");
    }

    return res.json(updated);
  };

  const deleteImport = async (req: AuthenticatedRequest, res: Response) => {
    const importId = readRouteParam(req.params.id, "import id");
    const deleted = await importsService.deleteImport(importId, req.user?.username);
    if (!deleted) {
      throw notFound("Import not found");
    }

    return res.json(buildImportMutationSuccessPayload());
  };

  return {
    listDataRows,
    listImports,
    createImport,
    getImportJob,
    cancelImportJob,
    resumeImportJob,
    getImport,
    getImportDataPage,
    analyzeImport,
    analyzeAll,
    renameImport,
    deleteImport,
  };
}
