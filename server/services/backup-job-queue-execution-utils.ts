import { logger } from "../lib/logger";
import type {
  BackupJobExecutorDeps,
  BackupJobOperationResponse,
  BackupJobRecord,
  BackupJobType,
} from "./backup-job-queue-shared";

type BackupJobExecutionDeps = Pick<
  BackupJobExecutorDeps,
  "repository" | "executeCreate" | "executeRestore"
>;

async function executeJobByType(
  deps: BackupJobExecutionDeps,
  job: BackupJobRecord,
): Promise<BackupJobOperationResponse> {
  if (job.type === "create") {
    return deps.executeCreate({
      name: job.backupName || "",
      username: job.requestedBy,
    });
  }

  if (!job.backupId) {
    return {
      statusCode: 400,
      body: {
        message: "Backup restore job is missing the backup id.",
      },
    };
  }

  return deps.executeRestore({
    backupId: job.backupId,
    username: job.requestedBy,
  });
}

function readFailureMessage(body: unknown): string {
  if (body && typeof body === "object") {
    const message = String((body as Record<string, unknown>).message ?? "").trim();
    if (message) {
      return message;
    }
  }
  return "Backup job failed.";
}

function normalizeOptionalText(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function extractBackupIdentity(
  jobType: BackupJobType,
  result: unknown,
): { backupId: string | null; backupName: string | null } {
  if (!result || typeof result !== "object") {
    return { backupId: null, backupName: null };
  }

  const resultRecord = result as Record<string, unknown>;
  if (jobType === "create") {
    return {
      backupId: normalizeOptionalText(resultRecord.id),
      backupName: normalizeOptionalText(resultRecord.name),
    };
  }

  return {
    backupId: normalizeOptionalText(resultRecord.backupId),
    backupName: normalizeOptionalText(resultRecord.backupName),
  };
}

export async function executeQueuedBackupJob(
  deps: BackupJobExecutionDeps,
  job: BackupJobRecord,
): Promise<void> {
  try {
    const response = await executeJobByType(deps, job);
    if (response.statusCode >= 400) {
      await deps.repository.failJob({
        jobId: job.id,
        error: {
          statusCode: response.statusCode,
          message: readFailureMessage(response.body),
        },
      });
      return;
    }

    const backupIdentity = extractBackupIdentity(job.type, response.body);
    await deps.repository.completeJob({
      jobId: job.id,
      result: response.body,
      backupId: backupIdentity.backupId ?? job.backupId,
      backupName: backupIdentity.backupName ?? job.backupName,
    });
  } catch (error) {
    await deps.repository.failJob({
      jobId: job.id,
      error: {
        statusCode: 500,
        message:
          error instanceof Error && error.message.trim()
            ? error.message
            : "Unexpected backup job failure.",
      },
    });
    logger.error("Backup background job failed", {
      jobId: job.id,
      type: job.type,
      error,
    });
  }
}
