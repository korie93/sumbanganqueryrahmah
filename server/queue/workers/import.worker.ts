import type { Job } from "bullmq";
import { ImportsRepository } from "../../repositories/imports.repository";
import { ImportAnalysisService } from "../../services/import-analysis.service";
import {
  assertImportJobStagedFilePath,
  cleanupImportBackgroundJobFiles,
  isImportJobCancellationRequested,
  type ImportBackgroundJobData,
  type ImportBackgroundJobResult,
} from "../../services/import-background-job.service";
import { DuplicateImportError, ImportJobCancelledError } from "../../services/import-operation-errors";
import { parseImportUploadFile } from "../../services/import-upload-parser";
import { ImportsService } from "../../services/imports.service";
import { PostgresStorage } from "../../storage-postgres";

export type ImportQueueJob = Job<
  ImportBackgroundJobData,
  ImportBackgroundJobResult,
  "process-import"
>;

const storage = new PostgresStorage();
const importsRepository = new ImportsRepository();
const importsService = new ImportsService(
  storage,
  importsRepository,
  new ImportAnalysisService(importsRepository),
);

export async function processImportJob(
  job: ImportQueueJob,
): Promise<ImportBackgroundJobResult> {
  if (job.name !== "process-import") {
    throw new Error(`Unsupported import job: ${job.name}`);
  }

  await storage.init();
  const stagedFilePath = assertImportJobStagedFilePath(job.data.stagedFilePath);
  if (await isImportJobCancellationRequested(stagedFilePath)) {
    return { status: "cancelled" };
  }

  try {
    const commonInput = {
      name: job.data.name,
      filename: job.data.filename,
      createdBy: job.data.requestedBy,
      contentHashSha256: job.data.contentHashSha256,
      sourceSizeBytes: job.data.sourceSizeBytes,
      columnMapping: job.data.columnMapping,
    };
    const created = job.data.filename.toLowerCase().endsWith(".csv")
      ? await importsService.createImportFromCsvFile({
          ...commonInput,
          filePath: stagedFilePath,
          shouldCancel: () => isImportJobCancellationRequested(stagedFilePath),
          onProgress: async (processedRows, totalRows) => {
            const percent = totalRows > 0
              ? Math.min(99, Math.round((processedRows / totalRows) * 100))
              : 0;
            await job.updateProgress(percent);
          },
        })
      : await (async () => {
          const parsed = await parseImportUploadFile(
            job.data.filename,
            stagedFilePath,
          );
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          if (await isImportJobCancellationRequested(stagedFilePath)) {
            throw new ImportJobCancelledError();
          }
          await job.updateProgress(50);
          return importsService.createImport({
            ...commonInput,
            dataRows: parsed.rows,
          });
        })();

    await job.updateProgress(100);
    await cleanupImportBackgroundJobFiles(stagedFilePath);
    return {
      status: "completed",
      importId: created.id,
      rowCount: created.rowCount,
    };
  } catch (error) {
    if (error instanceof ImportJobCancelledError) {
      return { status: "cancelled" };
    }
    if (error instanceof DuplicateImportError) {
      await cleanupImportBackgroundJobFiles(stagedFilePath);
      return {
        status: "duplicate",
        importId: error.existingImport.id,
        importName: error.existingImport.name,
      };
    }
    throw error;
  }
}
