import crypto from "node:crypto";
import { and, asc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { backupJobs, type BackupJobRow } from "../../shared/schema-postgres";
import { db } from "../db-postgres";

export type BackupJobType = "create" | "restore";
export type BackupJobStatus = "queued" | "running" | "completed" | "failed";

export type BackupJobError = {
  message: string;
  statusCode: number;
};

export type BackupJobRecord = {
  id: string;
  type: BackupJobType;
  status: BackupJobStatus;
  requestedBy: string;
  requestedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  updatedAt: Date;
  backupId: string | null;
  backupName: string | null;
  result: unknown;
  error: BackupJobError | null;
};

export type BackupJobSnapshot = {
  id: string;
  type: BackupJobType;
  status: BackupJobStatus;
  requestedBy: string;
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  backupId: string | null;
  backupName: string | null;
  queuePosition: number;
  result: unknown;
  error: BackupJobError | null;
};

export type CreateBackupJobInput = {
  type: BackupJobType;
  requestedBy: string;
  backupId?: string | null;
  backupName?: string | null;
};

function normalizeOptionalText(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function normalizeError(value: unknown): BackupJobError | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const message = String(candidate.message ?? "").trim();
  const statusCode = Number(candidate.statusCode);
  if (!message || !Number.isFinite(statusCode)) {
    return null;
  }

  return {
    message,
    statusCode,
  };
}

export class BackupJobRepository {
  async createJob(input: CreateBackupJobInput): Promise<BackupJobSnapshot> {
    const jobId = crypto.randomUUID();
    const now = new Date();

    await db.insert(backupJobs).values({
      id: jobId,
      type: input.type,
      status: "queued",
      requestedBy: input.requestedBy,
      requestedAt: now,
      updatedAt: now,
      backupId: normalizeOptionalText(input.backupId),
      backupName: normalizeOptionalText(input.backupName),
    });

    const snapshot = await this.getJobSnapshot(jobId);
    if (!snapshot) {
      throw new Error(`Failed to read queued backup job ${jobId}.`);
    }
    return snapshot;
  }

  async getJobSnapshot(jobId: string): Promise<BackupJobSnapshot | null> {
    const job = await this.getJobRecord(jobId);
    if (!job) {
      return null;
    }
    return this.toSnapshot(job);
  }

  async claimNextQueuedJob(): Promise<BackupJobRecord | null> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const nextQueued = await db
        .select()
        .from(backupJobs)
        .where(eq(backupJobs.status, "queued"))
        .orderBy(asc(backupJobs.requestedAt), asc(backupJobs.id))
        .limit(1);
      const candidate = nextQueued[0];
      if (!candidate) {
        return null;
      }

      const claimedRows = await db
        .update(backupJobs)
        .set({
          status: "running",
          startedAt: candidate.startedAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(backupJobs.id, candidate.id), eq(backupJobs.status, "queued")))
        .returning();

      if (claimedRows[0]) {
        return this.mapRecord(claimedRows[0]);
      }
    }

    return null;
  }

  async completeJob(params: {
    jobId: string;
    result: unknown;
    backupId?: string | null;
    backupName?: string | null;
  }): Promise<void> {
    await db
      .update(backupJobs)
      .set({
        status: "completed",
        result: params.result as Record<string, unknown> | null,
        error: null,
        backupId: normalizeOptionalText(params.backupId),
        backupName: normalizeOptionalText(params.backupName),
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(backupJobs.id, params.jobId));
  }

  async failJob(params: {
    jobId: string;
    error: BackupJobError;
  }): Promise<void> {
    await db
      .update(backupJobs)
      .set({
        status: "failed",
        result: null,
        error: params.error,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(backupJobs.id, params.jobId));
  }

  async markRunningJobsFailed(message: string): Promise<void> {
    await db
      .update(backupJobs)
      .set({
        status: "failed",
        error: {
          message,
          statusCode: 500,
        },
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(backupJobs.status, "running"));
  }

  async pruneHistory(maxRetainedJobs: number): Promise<void> {
    if (maxRetainedJobs <= 0) {
      return;
    }

    const removableRows = await db
      .select({ id: backupJobs.id })
      .from(backupJobs)
      .where(or(eq(backupJobs.status, "completed"), eq(backupJobs.status, "failed")))
      .orderBy(sql`${backupJobs.requestedAt} DESC`, sql`${backupJobs.id} DESC`)
      .offset(maxRetainedJobs);

    if (removableRows.length === 0) {
      return;
    }

    const removableIds = removableRows
      .map((row) => String(row.id || "").trim())
      .filter(Boolean);

    if (removableIds.length === 0) {
      return;
    }

    await db.delete(backupJobs).where(inArray(backupJobs.id, removableIds));
  }

  private async getJobRecord(jobId: string): Promise<BackupJobRecord | null> {
    const rows = await db.select().from(backupJobs).where(eq(backupJobs.id, jobId)).limit(1);
    return rows[0] ? this.mapRecord(rows[0]) : null;
  }

  private async toSnapshot(job: BackupJobRecord): Promise<BackupJobSnapshot> {
    return {
      id: job.id,
      type: job.type,
      status: job.status,
      requestedBy: job.requestedBy,
      requestedAt: job.requestedAt.toISOString(),
      startedAt: job.startedAt ? job.startedAt.toISOString() : null,
      finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
      backupId: job.backupId,
      backupName: job.backupName,
      queuePosition: await this.readQueuePosition(job),
      result: job.result,
      error: job.error,
    };
  }

  private async readQueuePosition(job: BackupJobRecord): Promise<number> {
    if (job.status === "running") {
      return 0;
    }
    if (job.status !== "queued") {
      return -1;
    }

    const queueCountRows = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(backupJobs)
      .where(
        and(
          eq(backupJobs.status, "queued"),
          or(
            lt(backupJobs.requestedAt, job.requestedAt),
            and(eq(backupJobs.requestedAt, job.requestedAt), lt(backupJobs.id, job.id)),
          ),
        ),
      );
    const queuedAhead = Number(queueCountRows[0]?.count ?? 0);

    const runningCountRows = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(backupJobs)
      .where(eq(backupJobs.status, "running"));
    const runningCount = Number(runningCountRows[0]?.count ?? 0);

    return queuedAhead + (runningCount > 0 ? 1 : 0);
  }

  private mapRecord(row: BackupJobRow): BackupJobRecord {
    return {
      id: row.id,
      type: row.type as BackupJobType,
      status: row.status as BackupJobStatus,
      requestedBy: row.requestedBy,
      requestedAt: toDate(row.requestedAt),
      startedAt: row.startedAt ? toDate(row.startedAt) : null,
      finishedAt: row.finishedAt ? toDate(row.finishedAt) : null,
      updatedAt: toDate(row.updatedAt),
      backupId: normalizeOptionalText(row.backupId),
      backupName: normalizeOptionalText(row.backupName),
      result: row.result ?? null,
      error: normalizeError(row.error),
    };
  }
}
