import type {
  BackupOperationsLimits,
  BackupOperationsServiceDeps,
} from "./backup-operations-service-shared";

export type BackupOperationsMutationDeps = Pick<
  BackupOperationsServiceDeps,
  "storage" | "backupsRepository" | "withExportCircuit" | "isExportCircuitOpenError"
>;

export type BackupOperationsMutationConfig = {
  limits: BackupOperationsLimits;
};
