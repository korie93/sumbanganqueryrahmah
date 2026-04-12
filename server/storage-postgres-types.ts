import type { ActivitySettingsStorageContract } from "./storage-postgres-activity-settings-types";
import type { AuditBackupStorageContract } from "./storage-postgres-audit-backup-types";
import type { AuthStorageContract } from "./storage-postgres-auth-types";
import type { ImportAiStorageContract } from "./storage-postgres-import-ai-types";
import type { CollectionStorageContract } from "./storage-postgres-collection-contracts";

export type {
  AccountActivationTokenSummary,
  ManagedUserAccount,
  PasswordResetTokenSummary,
  PendingPasswordResetRequestSummary,
} from "./storage-postgres-auth-types";
export type { CollectionStorageContract } from "./storage-postgres-collection-contracts";
export type * from "./storage-postgres-collection-types";

export interface IStorage
  extends CollectionStorageContract,
    AuthStorageContract,
    ImportAiStorageContract,
    ActivitySettingsStorageContract,
    AuditBackupStorageContract {}
