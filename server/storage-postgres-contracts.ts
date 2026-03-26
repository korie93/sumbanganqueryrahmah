import { PostgresOperationsStorage } from "./storage/postgres/postgres-operations-storage";
import type { IStorage } from "./storage-postgres-types";

export type {
  AccountActivationTokenSummary,
  CollectionAdminGroup,
  CollectionAdminUser,
  CollectionDailyCalendarDay,
  CollectionDailyPaidCustomer,
  CollectionDailyTarget,
  CollectionDailyUser,
  CollectionMonthlySummary,
  CollectionNicknameAggregate,
  CollectionNicknameDailyAggregate,
  CollectionNicknameAuthProfile,
  CollectionNicknameSession,
  CollectionRecord,
  CollectionRecordAggregate,
  CollectionRecordReceipt,
  CollectionReceiptValidationStatus,
  CollectionRollupFreshnessSnapshot,
  CollectionStaffNickname,
  CreateCollectionRecordInput,
  CreateCollectionRecordReceiptInput,
  CreateCollectionStaffNicknameInput,
  DeleteCollectionRecordOptions,
  IStorage,
  ManagedUserAccount,
  MutationIdempotencyAcquireInput,
  MutationIdempotencyAcquireResult,
  MutationIdempotencyCompleteInput,
  PasswordResetTokenSummary,
  PendingPasswordResetRequestSummary,
  UpdateCollectionRecordReceiptInput,
  UpdateCollectionRecordInput,
  UpdateCollectionRecordOptions,
  UpdateCollectionStaffNicknameInput,
} from "./storage-postgres-types";

export class PostgresStorage extends PostgresOperationsStorage implements IStorage {}

export const storage: IStorage = new PostgresStorage();
