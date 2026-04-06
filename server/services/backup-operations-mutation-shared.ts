import type { BackupOperationsServiceDeps } from "./backup-operations-service-shared";

export type BackupOperationsMutationDeps = Pick<
  BackupOperationsServiceDeps,
  "storage" | "backupsRepository" | "withExportCircuit" | "isExportCircuitOpenError"
>;
