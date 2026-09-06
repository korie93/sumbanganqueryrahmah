import {
  buildCollectionCallingWindow,
  parseSavedCallingDate,
} from "../lib/collection-calling-window";
import type {
  BackupCollectionOspClientResult,
  BackupCollectionOspManualReconciliation,
  BackupCollectionOspManualReconciliationAudit,
  BackupCollectionOspSavedTarget,
  BackupCollectionOspTargetAgingRow,
  BackupCollectionOspTargetRevision,
  BackupCollectionOspTargetSource,
  BackupCollectionOspTargetSourceRow,
} from "./backups-repository-types";
import type {
  RestorableCollectionOspClientResultRow,
  RestorableCollectionOspManualReconciliationAuditRow,
  RestorableCollectionOspManualReconciliationRow,
  RestorableCollectionOspSavedTargetRow,
  RestorableCollectionOspTargetAgingRow,
  RestorableCollectionOspTargetRevisionRow,
  RestorableCollectionOspTargetSourceRow,
  RestorableCollectionOspTargetSourceSnapshotRow,
} from "./backups-restore-collection-dataset-types";
import { toDate } from "./backups-restore-shared-utils";
import {
  protectCollectionV7AccountBackupPii,
  protectCollectionV7CustomerBackupPii,
  protectCollectionOspDetailBackupPii,
} from "./backups-collection-v7-pii-utils";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEARCH_HASH_PATTERN = /^[0-9a-f]{64}$/i;
const CARD_LAST_FOUR_PATTERN = /^\d{4}$/;
const AGING_BUCKETS = ["D3", "D4", "D5", "D6"] as const;
const MANUAL_REASON_CODES = [
  "PRIOR_PAYMENT_NOT_IN_SYSTEM",
  "CLIENT_CONFIRMED_PRIOR_PAYMENT",
  "HISTORICAL_PAYMENT_MISSING",
  "MIGRATED_HISTORY_GAP",
  "OTHER_WITH_REQUIRED_NOTE",
] as const;
const AUDIT_STATE_KEYS = new Set([
  "sourceImportId",
  "sourceRecordId",
  "canonicalObligationKey",
  "cycleKey",
  "aging",
  "totalDue",
  "billingPrincipalOsp",
  "manualPriorAmount",
  "asOfDate",
  "actualPaymentDate",
  "dateSource",
  "reason",
  "note",
  "reference",
  "status",
  "version",
  "voidReason",
]);
const AUDIT_IMMUTABLE_STATE_KEYS = [
  "sourceImportId",
  "sourceRecordId",
  "canonicalObligationKey",
  "cycleKey",
  "aging",
  "totalDue",
  "billingPrincipalOsp",
] as const;
const AUDIT_NON_UPDATE_STATE_KEYS = [
  ...AUDIT_IMMUTABLE_STATE_KEYS,
  "manualPriorAmount",
  "asOfDate",
  "actualPaymentDate",
  "dateSource",
  "reason",
  "note",
  "reference",
] as const;

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return (code >= 0 && code <= 31) || (code >= 127 && code <= 159);
  });
}

type AgingBucket = (typeof AGING_BUCKETS)[number];
type ManualReasonCode = (typeof MANUAL_REASON_CODES)[number];

function normalizeUuid(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return UUID_PATTERN.test(normalized) ? normalized.toLowerCase() : null;
}

function normalizeRequiredText(
  value: unknown,
  maxLength: number,
  options: { preserveWhitespace?: boolean } = {},
): string | null {
  if (typeof value !== "string") return null;
  const normalized = options.preserveWhitespace ? value : value.trim();
  if (
    normalized.length < 1
    || normalized.length > maxLength
    || containsControlCharacter(normalized)
  ) {
    return null;
  }
  return normalized;
}

function normalizeOptionalText(
  value: unknown,
  maxLength: number,
  options: { preserveWhitespace?: boolean } = {},
): string | null {
  if (value === null || value === undefined || value === "") return null;
  return normalizeRequiredText(value, maxLength, options);
}

function isOptionalValueAbsent(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

function isValidOptionalValue(value: unknown, normalized: unknown): boolean {
  return isOptionalValueAbsent(value) || normalized !== null;
}

function normalizeSearchHash(value: unknown): string | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return SEARCH_HASH_PATTERN.test(normalized) ? normalized : null;
}

function normalizeCardNumberLast4(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return CARD_LAST_FOUR_PATTERN.test(normalized) ? normalized : null;
}

function normalizeDate(value: unknown): string | null {
  return parseSavedCallingDate(value);
}

function normalizePositiveInteger(value: unknown): number | null {
  const normalized = Number(value);
  return Number.isSafeInteger(normalized) && normalized >= 1 ? normalized : null;
}

function normalizeMoney(value: unknown, allowZero: boolean): string | null {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{1,14})(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const cents = (BigInt(match[1]!) * 100n) + BigInt(`${match[2] ?? ""}00`.slice(0, 2));
  if (!allowZero && cents === 0n) return null;
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

function moneyToCents(value: string): bigint {
  const [whole, fraction = "00"] = value.split(".");
  return (BigInt(whole!) * 100n) + BigInt(fraction.padEnd(2, "0"));
}

function normalizePercentage(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{1,3})(?:\.(\d{1,4}))?$/);
  if (!match) return null;
  const units = (BigInt(match[1]!) * 10_000n)
    + BigInt(`${match[2] ?? ""}0000`.slice(0, 4));
  if (units > 1_000_000n) return null;
  return `${units / 10_000n}.${String(units % 10_000n).padStart(4, "0")}`;
}

function percentageToUnits(value: string): bigint {
  const [whole, fraction = "0000"] = value.split(".");
  return (BigInt(whole!) * 10_000n) + BigInt(fraction.padEnd(4, "0"));
}

function normalizeAgingBucket(value: unknown): AgingBucket | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  return AGING_BUCKETS.includes(normalized as AgingBucket)
    ? normalized as AgingBucket
    : null;
}

function normalizeAgingScope(value: unknown): AgingBucket[] | null {
  if (!Array.isArray(value)) return null;
  const normalized = value.map(normalizeAgingBucket);
  if (
    normalized.length < 1
    || normalized.length > AGING_BUCKETS.length
    || normalized.some((entry) => entry === null)
  ) {
    return null;
  }
  const result = normalized as AgingBucket[];
  if (new Set(result).size !== result.length) return null;
  // Backups created before V9 may contain a user-selected subset. The target
  // snapshot already persists all four aging rows, so restore it into the
  // canonical two-table scope instead of reintroducing a partial target.
  return [...AGING_BUCKETS];
}

function normalizeNicknameScope(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 200) return null;
  const normalized = value.map((entry) => normalizeRequiredText(entry, 160));
  return normalized.some((entry) => entry === null) ? null : normalized as string[];
}

function normalizeAuditState(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.some(([key]) => !AUDIT_STATE_KEYS.has(key))) return null;
  if (entries.some(([, entry]) => (
    entry !== null
    && typeof entry !== "string"
    && typeof entry !== "number"
    && typeof entry !== "boolean"
  ))) {
    return null;
  }
  return Object.fromEntries(entries);
}

function auditStateVersion(state: Record<string, unknown>): number | null {
  return normalizePositiveInteger(state.version);
}

function auditStateStatus(state: Record<string, unknown>): "ACTIVE" | "VOIDED" | null {
  return state.status === "ACTIVE" || state.status === "VOIDED" ? state.status : null;
}

function hasMatchingAuditStateValues(
  beforeState: Record<string, unknown>,
  afterState: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return keys.every((key) => beforeState[key] === afterState[key]);
}

function isValidAuditTransition(params: {
  operation: "CREATE" | "UPDATE" | "VOID" | "RESTORE";
  fromVersion: number | null;
  toVersion: number;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown>;
}): boolean {
  const afterVersion = auditStateVersion(params.afterState);
  const afterStatus = auditStateStatus(params.afterState);
  if (afterVersion !== params.toVersion || !afterStatus) return false;

  if (params.operation === "CREATE") {
    return params.fromVersion === null
      && params.beforeState === null
      && params.toVersion === 1
      && afterStatus === "ACTIVE"
      && params.afterState.voidReason == null;
  }
  if (!params.beforeState || params.fromVersion === null) return false;

  const beforeVersion = auditStateVersion(params.beforeState);
  const beforeStatus = auditStateStatus(params.beforeState);
  if (
    beforeVersion !== params.fromVersion
    || params.toVersion !== params.fromVersion + 1
    || !beforeStatus
    || !hasMatchingAuditStateValues(
      params.beforeState,
      params.afterState,
      params.operation === "UPDATE"
        ? AUDIT_IMMUTABLE_STATE_KEYS
        : AUDIT_NON_UPDATE_STATE_KEYS,
    )
  ) {
    return false;
  }

  if (params.operation === "UPDATE") {
    return beforeStatus === "ACTIVE"
      && afterStatus === "ACTIVE"
      && params.beforeState.voidReason == null
      && params.afterState.voidReason == null;
  }
  if (params.operation === "VOID") {
    return beforeStatus === "ACTIVE"
      && afterStatus === "VOIDED"
      && params.beforeState.voidReason == null
      && typeof params.afterState.voidReason === "string"
      && params.afterState.voidReason.trim().length > 0;
  }
  return beforeStatus === "VOIDED"
    && afterStatus === "ACTIVE"
    && params.afterState.voidReason == null;
}

export function normalizeBackupCollectionOspSavedTarget(
  record: BackupCollectionOspSavedTarget,
): RestorableCollectionOspSavedTargetRow | null {
  const id = normalizeUuid(record.id);
  const assignedAdminUserId = normalizeOptionalText(record.assignedAdminUserId, 200);
  const targetName = normalizeRequiredText(record.targetName, 120, { preserveWhitespace: true });
  const normalizedName = normalizeRequiredText(record.normalizedName, 120, {
    preserveWhitespace: true,
  });
  const version = normalizePositiveInteger(record.version);
  const createdBy = normalizeRequiredText(record.createdBy, 160);
  const updatedBy = normalizeRequiredText(record.updatedBy, 160);
  const createdAt = toDate(record.createdAt);
  const updatedAt = toDate(record.updatedAt);
  const status = record.status === "ACTIVE" || record.status === "DELETED"
    ? record.status
    : null;
  const deletedBy = normalizeOptionalText(record.deletedBy, 160);
  const deletedAt = toDate(record.deletedAt);
  const description = normalizeOptionalText(record.description, 1000, { preserveWhitespace: true });

  if (
    !id
    || !isValidOptionalValue(record.assignedAdminUserId, assignedAdminUserId)
    || !targetName
    || targetName !== targetName.trim()
    || !normalizedName
    || normalizedName !== normalizedName.trim().toLowerCase()
    || !status
    || !version
    || !createdBy
    || !createdAt
    || !updatedBy
    || !updatedAt
    || !isValidOptionalValue(record.description, description)
    || !isValidOptionalValue(record.deletedBy, deletedBy)
    || !isValidOptionalValue(record.deletedAt, deletedAt)
    || (status === "ACTIVE" && (deletedBy !== null || deletedAt !== null))
    || (status === "DELETED" && (!deletedBy || !deletedAt))
  ) {
    return null;
  }

  return {
    id,
    assignedAdminUserId,
    targetName,
    normalizedName,
    description,
    status,
    version,
    createdBy,
    createdAt,
    updatedBy,
    updatedAt,
    deletedBy,
    deletedAt,
  };
}

export function normalizeBackupCollectionOspTargetRevision(
  record: BackupCollectionOspTargetRevision,
): RestorableCollectionOspTargetRevisionRow | null {
  const id = normalizeUuid(record.id);
  const targetId = normalizeUuid(record.targetId);
  const revisionNumber = normalizePositiveInteger(record.revisionNumber);
  const sourceScopeHash = normalizeSearchHash(record.sourceScopeHash);
  const periodFrom = normalizeDate(record.periodFrom);
  const periodTo = normalizeDate(record.periodTo);
  const trackingStartDate = normalizeDate(record.trackingStartDate);
  const trackingEndDate = normalizeDate(record.trackingEndDate);
  const timezone = normalizeRequiredText(record.timezone, 80);
  const nicknameScope = normalizeNicknameScope(record.nicknameScope);
  const agingScope = normalizeAgingScope(record.agingScope);
  const calculationVersion = normalizeRequiredText(record.calculationVersion, 80);
  const createdBy = normalizeRequiredText(record.createdBy, 160);
  const createdAt = toDate(record.createdAt);

  if (
    !id
    || !targetId
    || !revisionNumber
    || !sourceScopeHash
    || !periodFrom
    || !periodTo
    || periodFrom > periodTo
    || !trackingStartDate
    || trackingStartDate < periodFrom
    || trackingStartDate > periodTo
    || !isValidOptionalValue(record.trackingEndDate, trackingEndDate)
    || (trackingEndDate !== null && (
      trackingEndDate < trackingStartDate || trackingEndDate > periodTo
    ))
    || !timezone
    || !nicknameScope
    || !agingScope
    || !calculationVersion
    || !createdBy
    || !createdAt
  ) {
    return null;
  }

  return {
    id,
    targetId,
    revisionNumber,
    sourceScopeHash,
    periodFrom,
    periodTo,
    trackingStartDate,
    trackingEndDate,
    timezone,
    nicknameScope,
    agingScope,
    calculationVersion,
    createdBy,
    createdAt,
  };
}

export function normalizeBackupCollectionOspTargetSource(
  record: BackupCollectionOspTargetSource,
): RestorableCollectionOspTargetSourceRow | null {
  const targetRevisionId = normalizeUuid(record.targetRevisionId);
  const sourceImportId = normalizeRequiredText(record.sourceImportId, 200);
  const sourceNameSnapshot = normalizeRequiredText(record.sourceNameSnapshot, 300, {
    preserveWhitespace: true,
  });
  const sourceFilenameSnapshot = normalizeRequiredText(record.sourceFilenameSnapshot, 500, {
    preserveWhitespace: true,
  });
  const sourceContentHashSnapshot = record.sourceContentHashSnapshot == null
    ? null
    : normalizeSearchHash(record.sourceContentHashSnapshot);
  const createdAt = toDate(record.createdAt);
  const sourceVersionSnapshot = normalizeOptionalText(record.sourceVersionSnapshot, 1000, {
    preserveWhitespace: true,
  });

  if (
    !targetRevisionId
    || !sourceImportId
    || !sourceNameSnapshot
    || !sourceFilenameSnapshot
    || !isValidOptionalValue(record.sourceVersionSnapshot, sourceVersionSnapshot)
    || (record.sourceContentHashSnapshot != null && !sourceContentHashSnapshot)
    || !createdAt
  ) {
    return null;
  }

  return {
    targetRevisionId,
    sourceImportId,
    sourceNameSnapshot,
    sourceFilenameSnapshot,
    sourceVersionSnapshot,
    sourceContentHashSnapshot,
    createdAt,
  };
}

export function normalizeBackupCollectionOspTargetSourceRow(
  record: BackupCollectionOspTargetSourceRow,
): RestorableCollectionOspTargetSourceSnapshotRow | null {
  const targetRevisionId = normalizeUuid(record.targetRevisionId);
  const sourceImportId = normalizeRequiredText(record.sourceImportId, 200);
  const sourceDataRowId = normalizeRequiredText(record.sourceDataRowId, 200);
  const canonicalObligationKey = normalizeRequiredText(record.canonicalObligationKey, 160, {
    preserveWhitespace: true,
  });
  const cycleKey = normalizeRequiredText(record.cycleKey, 192, { preserveWhitespace: true });
  const accountPii = protectCollectionV7AccountBackupPii({
    encrypted: record.accountNumberEncrypted,
    searchHash: record.accountNumberSearchHash,
  });
  const cardNumberLast4 = normalizeCardNumberLast4(record.cardNumberLast4);
  const customerPii = protectCollectionV7CustomerBackupPii({
    encrypted: record.customerNameEncrypted,
    searchHashes: record.customerNameSearchHashes,
  });
  const agingBucket = normalizeAgingBucket(record.agingBucket);
  const callingDate = normalizeDate(record.callingDate);
  const callingWindowEndExclusive = normalizeDate(record.callingWindowEndExclusive);
  const totalDue = normalizeMoney(record.totalDue, false);
  const billingPrincipalOsp = normalizeMoney(record.billingPrincipalOsp, true);
  const createdAt = toDate(record.createdAt);

  if (
    !targetRevisionId
    || !sourceImportId
    || !sourceDataRowId
    || !canonicalObligationKey
    || !cycleKey
    || (!accountPii.encrypted && !cardNumberLast4)
    || !isValidOptionalValue(record.cardNumberLast4, cardNumberLast4)
    || !agingBucket
    || !callingDate
    || !callingWindowEndExclusive
    || buildCollectionCallingWindow(callingDate)?.endExclusive !== callingWindowEndExclusive
    || !totalDue
    || !billingPrincipalOsp
    || !createdAt
  ) {
    return null;
  }

  return {
    targetRevisionId,
    cardNumberEncrypted: protectCollectionOspDetailBackupPii({ field: "accountNumber", encrypted: record.cardNumberEncrypted }),
    identificationNumberEncrypted: protectCollectionOspDetailBackupPii({ field: "icNumber", encrypted: record.identificationNumberEncrypted }),
    phoneEncrypted: protectCollectionOspDetailBackupPii({ field: "customerPhone", encrypted: record.phoneEncrypted }),
    sourceImportId,
    sourceDataRowId,
    canonicalObligationKey,
    cycleKey,
    accountNumberEncrypted: accountPii.encrypted,
    accountNumberSearchHash: accountPii.searchHash,
    cardNumberLast4,
    customerNameEncrypted: customerPii.encrypted,
    customerNameSearchHashes: customerPii.searchHashes,
    agingBucket,
    callingDate,
    callingWindowEndExclusive,
    totalDue,
    billingPrincipalOsp,
    createdAt,
  };
}

export function normalizeBackupCollectionOspTargetAgingRow(
  record: BackupCollectionOspTargetAgingRow,
): RestorableCollectionOspTargetAgingRow | null {
  const targetRevisionId = normalizeUuid(record.targetRevisionId);
  const agingBucket = normalizeAgingBucket(record.agingBucket);
  const totalOspBaseline = normalizeMoney(record.totalOspBaseline, true);
  const targetPercentage = normalizePercentage(record.targetPercentage);
  const targetOsp = normalizeMoney(record.targetOsp, true);
  const createdAt = toDate(record.createdAt);

  if (
    !targetRevisionId
    || !agingBucket
    || !totalOspBaseline
    || !targetPercentage
    || !targetOsp
    || !createdAt
  ) {
    return null;
  }

  const expectedTargetCents = (
    (moneyToCents(totalOspBaseline) * percentageToUnits(targetPercentage)) + 500_000n
  ) / 1_000_000n;
  if (moneyToCents(targetOsp) !== expectedTargetCents) return null;

  return {
    targetRevisionId,
    agingBucket,
    totalOspBaseline,
    targetPercentage,
    targetOsp,
    createdAt,
  };
}

export function normalizeBackupCollectionOspClientResult(
  record: BackupCollectionOspClientResult,
): RestorableCollectionOspClientResultRow | null {
  const id = normalizeUuid(record.id);
  const targetId = normalizeUuid(record.targetId);
  const targetRevisionId = normalizeUuid(record.targetRevisionId);
  const asOfDate = normalizeDate(record.asOfDate);
  const normalizedAging = String(record.agingBucket ?? "").trim().toUpperCase();
  const agingBucket = normalizedAging === "ALL"
    ? "ALL"
    : normalizeAgingBucket(normalizedAging);
  const resultPercentage = normalizePercentage(record.resultPercentage);
  const ospClosed = normalizeMoney(record.ospClosed, true);
  const version = normalizePositiveInteger(record.version);
  const createdBy = normalizeRequiredText(record.createdBy, 160);
  const createdAt = toDate(record.createdAt);
  const updatedBy = normalizeRequiredText(record.updatedBy, 160);
  const updatedAt = toDate(record.updatedAt);
  const clientReference = normalizeOptionalText(record.clientReference, 300, {
    preserveWhitespace: true,
  });
  const note = normalizeOptionalText(record.note, 2000, { preserveWhitespace: true });

  if (
    !id
    || !targetId
    || !targetRevisionId
    || !asOfDate
    || !agingBucket
    || !resultPercentage
    || !ospClosed
    || !version
    || !createdBy
    || !createdAt
    || !updatedBy
    || !updatedAt
    || !isValidOptionalValue(record.clientReference, clientReference)
    || !isValidOptionalValue(record.note, note)
  ) {
    return null;
  }

  return {
    id,
    targetId,
    targetRevisionId,
    asOfDate,
    agingBucket,
    resultPercentage,
    ospClosed,
    clientReference,
    note,
    version,
    createdBy,
    createdAt,
    updatedBy,
    updatedAt,
  };
}

function normalizeManualReasonCode(value: unknown): ManualReasonCode | null {
  const normalized = String(value ?? "").trim();
  return MANUAL_REASON_CODES.includes(normalized as ManualReasonCode)
    ? normalized as ManualReasonCode
    : null;
}

export function normalizeBackupCollectionOspManualReconciliation(
  record: BackupCollectionOspManualReconciliation,
): RestorableCollectionOspManualReconciliationRow | null {
  const id = normalizeUuid(record.id);
  const targetId = normalizeUuid(record.targetId);
  const targetRevisionId = normalizeUuid(record.targetRevisionId);
  const sourceImportId = normalizeRequiredText(record.sourceImportId, 200);
  const sourceDataRowId = normalizeRequiredText(record.sourceDataRowId, 200);
  const canonicalObligationKey = normalizeRequiredText(record.canonicalObligationKey, 160, {
    preserveWhitespace: true,
  });
  const cycleKey = normalizeRequiredText(record.cycleKey, 192, { preserveWhitespace: true });
  const accountPii = protectCollectionV7AccountBackupPii({
    encrypted: record.accountNumberEncrypted,
    searchHash: record.accountNumberSearchHash,
  });
  const cardNumberLast4 = normalizeCardNumberLast4(record.cardNumberLast4);
  const customerPii = protectCollectionV7CustomerBackupPii({
    encrypted: record.customerNameEncrypted,
    searchHashes: record.customerNameSearchHashes,
  });
  const agingBucket = normalizeAgingBucket(record.agingBucket);
  const callingDate = normalizeDate(record.callingDate);
  const callingWindowEndExclusive = normalizeDate(record.callingWindowEndExclusive);
  const totalDue = normalizeMoney(record.totalDue, false);
  const billingPrincipalOsp = normalizeMoney(record.billingPrincipalOsp, true);
  const manualPriorAmount = normalizeMoney(record.manualPriorAmount, false);
  const manualAsOfDate = normalizeDate(record.manualAsOfDate);
  const actualPaymentDate = normalizeDate(record.actualPaymentDate);
  const dateSource = record.dateSource === "ACTUAL_PAYMENT_DATE"
    || record.dateSource === "CLIENT_AS_OF"
    || record.dateSource === "MANUAL_AS_OF"
    ? record.dateSource
    : null;
  const reasonCode = normalizeManualReasonCode(record.reasonCode);
  const note = normalizeOptionalText(record.note, 2000, { preserveWhitespace: true });
  const evidenceReference = normalizeOptionalText(record.evidenceReference, 300, {
    preserveWhitespace: true,
  });
  const status = record.status === "ACTIVE" || record.status === "VOIDED"
    ? record.status
    : null;
  const version = normalizePositiveInteger(record.version);
  const createdBy = normalizeRequiredText(record.createdBy, 160);
  const createdAt = toDate(record.createdAt);
  const updatedBy = normalizeRequiredText(record.updatedBy, 160);
  const updatedAt = toDate(record.updatedAt);
  const voidedBy = normalizeOptionalText(record.voidedBy, 160);
  const voidedAt = toDate(record.voidedAt);
  const voidReason = normalizeOptionalText(record.voidReason, 500, { preserveWhitespace: true });

  if (
    !id
    || !targetId
    || !targetRevisionId
    || !sourceImportId
    || !sourceDataRowId
    || !canonicalObligationKey
    || !cycleKey
    || (!accountPii.encrypted && !cardNumberLast4)
    || !isValidOptionalValue(record.cardNumberLast4, cardNumberLast4)
    || !isValidOptionalValue(record.actualPaymentDate, actualPaymentDate)
    || !isValidOptionalValue(record.note, note)
    || !isValidOptionalValue(record.evidenceReference, evidenceReference)
    || !isValidOptionalValue(record.voidedBy, voidedBy)
    || !isValidOptionalValue(record.voidedAt, voidedAt)
    || !isValidOptionalValue(record.voidReason, voidReason)
    || !agingBucket
    || !callingDate
    || !callingWindowEndExclusive
    || buildCollectionCallingWindow(callingDate)?.endExclusive !== callingWindowEndExclusive
    || !totalDue
    || !billingPrincipalOsp
    || !manualPriorAmount
    || !manualAsOfDate
    || manualAsOfDate < callingDate
    || manualAsOfDate >= callingWindowEndExclusive
    || (actualPaymentDate !== null && (
      actualPaymentDate < callingDate
      || actualPaymentDate >= callingWindowEndExclusive
      || actualPaymentDate > manualAsOfDate
    ))
    || !dateSource
    || (dateSource === "ACTUAL_PAYMENT_DATE") !== (actualPaymentDate !== null)
    || !reasonCode
    || (reasonCode === "OTHER_WITH_REQUIRED_NOTE" && !note?.trim())
    || !status
    || !version
    || !createdBy
    || !createdAt
    || !updatedBy
    || !updatedAt
    || (status === "ACTIVE" && (voidedBy !== null || voidedAt !== null || voidReason !== null))
    || (status === "VOIDED" && (!voidedBy || !voidedAt || !voidReason?.trim()))
  ) {
    return null;
  }

  return {
    id,
    targetId,
    targetRevisionId,
    sourceImportId,
    sourceDataRowId,
    canonicalObligationKey,
    cycleKey,
    accountNumberEncrypted: accountPii.encrypted,
    accountNumberSearchHash: accountPii.searchHash,
    cardNumberLast4,
    customerNameEncrypted: customerPii.encrypted,
    customerNameSearchHashes: customerPii.searchHashes,
    agingBucket,
    callingDate,
    callingWindowEndExclusive,
    totalDue,
    billingPrincipalOsp,
    manualPriorAmount,
    manualAsOfDate,
    actualPaymentDate,
    dateSource,
    reasonCode,
    note,
    evidenceReference,
    status,
    version,
    createdBy,
    createdAt,
    updatedBy,
    updatedAt,
    voidedBy,
    voidedAt,
    voidReason,
  };
}

export function normalizeBackupCollectionOspManualReconciliationAudit(
  record: BackupCollectionOspManualReconciliationAudit,
): RestorableCollectionOspManualReconciliationAuditRow | null {
  const id = normalizeUuid(record.id);
  const reconciliationId = normalizeUuid(record.reconciliationId);
  const targetId = normalizeUuid(record.targetId);
  const targetRevisionId = normalizeUuid(record.targetRevisionId);
  const operation = record.operation === "CREATE"
    || record.operation === "UPDATE"
    || record.operation === "VOID"
    || record.operation === "RESTORE"
    ? record.operation
    : null;
  const fromVersion = record.fromVersion == null
    ? null
    : normalizePositiveInteger(record.fromVersion);
  const toVersion = normalizePositiveInteger(record.toVersion);
  const beforeState = record.beforeState == null ? null : normalizeAuditState(record.beforeState);
  const afterState = normalizeAuditState(record.afterState);
  const actorUsername = normalizeRequiredText(record.actorUsername, 160);
  const requestId = normalizeOptionalText(record.requestId, 160, { preserveWhitespace: true });
  const createdAt = toDate(record.createdAt);

  if (
    !id
    || !reconciliationId
    || !targetId
    || !targetRevisionId
    || !operation
    || (record.fromVersion != null && !fromVersion)
    || !toVersion
    || (operation === "CREATE" && (fromVersion !== null || beforeState !== null))
    || (operation !== "CREATE" && (fromVersion === null || beforeState === null))
    || !afterState
    || !actorUsername
    || record.actorRole !== "superuser"
    || !isValidOptionalValue(record.requestId, requestId)
    || !createdAt
    || !isValidAuditTransition({
      operation,
      fromVersion,
      toVersion,
      beforeState,
      afterState,
    })
  ) {
    return null;
  }

  return {
    id,
    reconciliationId,
    targetId,
    targetRevisionId,
    operation,
    fromVersion,
    toVersion,
    beforeState,
    afterState,
    actorUsername,
    actorRole: "superuser",
    requestId,
    createdAt,
  };
}
