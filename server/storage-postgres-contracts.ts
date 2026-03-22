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
  CollectionNicknameAuthProfile,
  CollectionNicknameSession,
  CollectionRecord,
  CollectionRecordAggregate,
  CollectionRecordReceipt,
  CollectionStaffNickname,
  CreateCollectionRecordInput,
  CreateCollectionRecordReceiptInput,
  CreateCollectionStaffNicknameInput,
  IStorage,
  ManagedUserAccount,
  PasswordResetTokenSummary,
  PendingPasswordResetRequestSummary,
  UpdateCollectionRecordInput,
  UpdateCollectionStaffNicknameInput,
} from "./storage-postgres-types";

export class PostgresStorage extends PostgresOperationsStorage implements IStorage {}

export const storage: IStorage = new PostgresStorage();
