import type { Job } from "bullmq";
import type { AuditLog, InsertAuditLog } from "../../../shared/schema-postgres";
import { PostgresStorage } from "../../storage-postgres";

export type AuditJobName = "write";
export type AuditJobData = InsertAuditLog;
export type AuditJob = Job<AuditJobData, AuditLog, AuditJobName>;

const storage = new PostgresStorage();

export async function processAuditJob(job: AuditJob): Promise<AuditLog> {
  if (job.name !== "write") {
    throw new Error(`Unsupported audit job: ${job.name}`);
  }

  return storage.createAuditLog(job.data);
}

