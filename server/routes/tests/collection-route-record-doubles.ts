import type {
  CreateCollectionRecordReceiptInput,
  MutationIdempotencyAcquireInput,
  MutationIdempotencyCompleteInput,
  PostgresStorage,
} from "../../storage-postgres";
import {
  buildCollectionReceiptValidationResult,
  normalizeCollectionReceiptExtractionStatus,
} from "../../services/collection/collection-receipt-validation";
import { subtractOneDayDateOnly } from "../../lib/collection-calling-window";

export type AuditEntry = {
  action: string;
  performedBy?: string;
  targetResource?: string;
  details?: string;
};

export type CollectionRecordShape = {
  id: string;
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
  cardNumberLast4?: string | null;
  sourceImportId?: string | null;
  sourceDataRowId?: string | null;
  sourceImportName?: string | null;
  sourceFilename?: string | null;
  agingBucket?: "D3" | "D4" | "D5" | "D6" | null;
  callingDate?: string | null;
  callingWindowEnd?: string | null;
  callingWindowEndExclusive?: string | null;
  totalDue?: string | null;
  billingPrincipalOsp?: string | null;
  sourceMatchBasis?:
    | "ic"
    | "phone_and_account"
    | "account_number"
    | "card_number"
    | "account_and_card"
    | null;
  sourceMatchAccuracy?: number | null;
  totalDueCovered?: boolean | null;
  cumulativeCollected?: string | null;
  remainingAmount?: string | null;
  cpStatus?: "cp" | "abort_cp" | "unverified";
  batch: string;
  paymentDate: string;
  amount: string;
  receiptFile: string | null;
  receipts: unknown[];
  archivedReceipts?: unknown[];
  receiptTotalAmount: string;
  receiptValidationStatus: "matched" | "underpaid" | "overpaid" | "unverified" | "needs_review";
  receiptValidationMessage: string | null;
  receiptCount: number;
  duplicateReceiptFlag: boolean;
  createdByLogin: string;
  collectionStaffNickname: string;
  createdAt: Date;
  updatedAt?: Date;
};

type CollectionReceiptShape = {
  id: string;
  collectionRecordId: string;
  storagePath: string;
  originalFileName: string;
  originalMimeType: string;
  originalExtension: string;
  fileSize: number;
  receiptAmount: string | null;
  extractedAmount: string | null;
  extractionStatus: "unprocessed" | "suggested" | "ambiguous" | "unavailable" | "error";
  extractionConfidence: number | null;
  receiptDate: string | null;
  receiptReference: string | null;
  fileHash: string | null;
  createdAt: Date;
  deletedAt: Date | null;
};

function parseAmountToCents(value: unknown): number {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return 0;
  }

  const normalized = raw.replace(/,/g, "");
  const [wholeRaw, fractionRaw = ""] = normalized.split(".");
  const whole = Number.parseInt(wholeRaw, 10);
  const fraction = Number.parseInt(`${fractionRaw}00`.slice(0, 2), 10);
  if (!Number.isFinite(whole) || !Number.isFinite(fraction)) {
    return 0;
  }

  return (whole * 100) + fraction;
}

function formatAmountFromCents(value: number | null | undefined): string {
  const cents = Number.isFinite(value) ? Math.max(0, Math.trunc(value || 0)) : 0;
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, "0");
  return `${whole}.${fraction}`;
}

type MutationIdempotencyEntry = {
  actor: string;
  idempotencyKey: string;
  requestFingerprint: string | null;
  responseBody?: unknown;
  responseStatus?: number;
  scope: string;
  state: "completed" | "pending";
};

function createMutationIdempotencyDouble() {
  const entries = new Map<string, MutationIdempotencyEntry>();

  const buildEntryKey = (params: {
    scope: string;
    actor: string;
    idempotencyKey: string;
  }) => `${params.scope}::${params.actor}::${params.idempotencyKey}`;

  return {
    acquire(params: MutationIdempotencyAcquireInput) {
      const key = buildEntryKey(params);
      const existing = entries.get(key);
      if (!existing) {
        entries.set(key, {
          actor: params.actor,
          idempotencyKey: params.idempotencyKey,
          requestFingerprint: params.requestFingerprint ?? null,
          scope: params.scope,
          state: "pending",
        });
        return { status: "acquired" as const };
      }

      if (
        params.requestFingerprint
        && existing.requestFingerprint
        && params.requestFingerprint !== existing.requestFingerprint
      ) {
        return { status: "payload_mismatch" as const };
      }

      if (existing.state === "completed") {
        return {
          status: "replay" as const,
          responseStatus: existing.responseStatus || 200,
          responseBody: existing.responseBody,
        };
      }

      return { status: "in_progress" as const };
    },
    complete(params: MutationIdempotencyCompleteInput) {
      const key = buildEntryKey(params);
      const existing = entries.get(key);
      if (!existing) {
        return;
      }
      entries.set(key, {
        ...existing,
        responseBody: params.responseBody,
        responseStatus: params.responseStatus,
        state: "completed",
      });
    },
    release(params: Pick<MutationIdempotencyAcquireInput, "actor" | "idempotencyKey" | "scope">) {
      entries.delete(buildEntryKey(params));
    },
  };
}

export function createCollectionStorageDouble(options: {
  actorPasswordHash: string;
}) {
  const auditLogs: AuditEntry[] = [];
  let purgeCallCount = 0;
  const purgeActors: string[] = [];
  const idempotency = createMutationIdempotencyDouble();

  const actor = {
    id: "superuser-1",
    username: "superuser",
    role: "superuser",
    passwordHash: options.actorPasswordHash,
  };

  const storage = {
    getUser: async (userId: string) => (userId === actor.id ? actor : null),
    getUserByUsername: async (username: string) => (username === actor.username ? actor : null),
    createAuditLog: async (entry: AuditEntry) => {
      auditLogs.push(entry);
      return { id: `audit-${auditLogs.length}`, ...entry };
    },
    acquireMutationIdempotency: async (params: MutationIdempotencyAcquireInput) =>
      idempotency.acquire(params),
    completeMutationIdempotency: async (params: MutationIdempotencyCompleteInput) => {
      idempotency.complete(params);
    },
    releaseMutationIdempotency: async (
      params: Pick<MutationIdempotencyAcquireInput, "actor" | "idempotencyKey" | "scope">,
    ) => {
      idempotency.release(params);
    },
    purgeCollectionRecordsOlderThan: async (_cutoffDate: string, purgedBy: string) => {
      purgeCallCount += 1;
      purgeActors.push(purgedBy);
      return {
        totalRecords: 2,
        totalAmount: 450.75,
        receiptPaths: [],
      };
    },
  } as unknown as PostgresStorage;

  return {
    storage,
    auditLogs,
    getPurgeCallCount: () => purgeCallCount,
    getPurgeActors: () => [...purgeActors],
  };
}

export function createCoreCollectionStorageDouble(options?: {
  sessionNickname?: string | null;
  sourceMatchTotalDue?: string | null;
  sourceMatchCallingDate?: string | null;
  sourceMatchCallingWindowEnd?: string | null;
  sourceMatchCallingWindowEndExclusive?: string | null;
  seedRecordOverrides?: Partial<CollectionRecordShape>;
  receiptRowsByRecordId?: Record<string, Array<{
    id: string;
    collectionRecordId: string;
    storagePath: string;
    originalFileName: string;
    originalMimeType: string;
    originalExtension: string;
    fileSize: number;
    receiptAmount?: string | null;
    extractedAmount?: string | null;
    extractionStatus?: string | null;
    extractionConfidence?: number | null;
    receiptDate?: string | null;
    receiptReference?: string | null;
    fileHash?: string | null;
    createdAt: Date;
    deletedAt?: Date | null;
  }>>;
}) {
  const auditLogs: AuditEntry[] = [];
  const idempotency = createMutationIdempotencyDouble();
  const createCalls: Array<Record<string, unknown>> = [];
  const listCalls: Array<Record<string, unknown>> = [];
  const summaryCalls: Array<Record<string, unknown>> = [];
  const updateCalls: Array<{
    id: string;
    data: Record<string, unknown>;
    options?: {
      expectedUpdatedAt?: Date;
      removeAllReceipts?: boolean;
      removeReceiptIds?: string[];
      newReceipts?: Array<{
        storagePath: string;
        originalFileName: string;
        originalMimeType: string;
        originalExtension: string;
        fileSize: number;
        receiptAmountCents?: number | null;
        extractedAmountCents?: number | null;
        extractionStatus?: string | null;
        extractionConfidence?: number | null;
        receiptDate?: string | null;
        receiptReference?: string | null;
        fileHash?: string | null;
      }>;
      receiptUpdates?: Array<{
        receiptId: string;
        receiptAmountCents?: number | null;
        extractedAmountCents?: number | null;
        extractionStatus?: string | null;
        extractionConfidence?: number | null;
        receiptDate?: string | null;
        receiptReference?: string | null;
      }>;
    } | undefined;
  }> = [];
  const createReceiptCalls: Array<{
    recordId: string;
    receipts: Array<{
      storagePath: string;
      originalFileName: string;
      originalMimeType: string;
      originalExtension: string;
      fileSize: number;
      receiptAmountCents?: number | null;
      extractedAmountCents?: number | null;
      extractionStatus?: string | null;
      extractionConfidence?: number | null;
      receiptDate?: string | null;
      receiptReference?: string | null;
      fileHash?: string | null;
    }>;
  }> = [];
  const deleteCalls: Array<{
    id: string;
    options?: { expectedUpdatedAt?: Date } | undefined;
  }> = [];
  const deleteReceiptCalls: Array<{
    recordId: string;
    receiptIds: string[];
  }> = [];
  const activeNickname = {
    id: "nickname-1",
    nickname: "Collector Alpha",
    isActive: true,
    roleScope: "both",
    createdBy: "superuser",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  const records = new Map<string, CollectionRecordShape>();
  const seedRecord: CollectionRecordShape = {
    id: "collection-1",
    customerName: "Alice Tan",
    icNumber: "900101015555",
    customerPhone: "0123456789",
    accountNumber: "ACC-1001",
    sourceImportId: null,
    sourceDataRowId: null,
    sourceImportName: null,
    sourceFilename: null,
    callingDate: "2026-03-01",
    callingWindowEnd: "2026-03-31",
    callingWindowEndExclusive: "2026-04-01",
    batch: "P10",
    paymentDate: "2026-03-01",
    amount: "120.50",
    receiptFile: null,
    receipts: [],
    receiptTotalAmount: "0.00",
    receiptValidationStatus: "unverified",
    receiptValidationMessage: "Tiada resit dilampirkan untuk semakan jumlah.",
    receiptCount: 0,
    duplicateReceiptFlag: false,
    createdByLogin: "staff.user",
    collectionStaffNickname: "Collector Alpha",
    createdAt: new Date("2026-03-01T09:00:00.000Z"),
    updatedAt: new Date("2026-03-01T09:00:00.000Z"),
    ...options?.seedRecordOverrides,
  };
  records.set(seedRecord.id, seedRecord);
  const receiptRowsByRecordId = new Map<string, CollectionReceiptShape[]>();
  for (const [recordId, receipts] of Object.entries(options?.receiptRowsByRecordId || {})) {
    receiptRowsByRecordId.set(
      recordId,
      receipts.map((receipt) => ({
        ...receipt,
        receiptAmount: receipt.receiptAmount ?? null,
        extractedAmount: receipt.extractedAmount ?? null,
        extractionStatus: normalizeCollectionReceiptExtractionStatus(receipt.extractionStatus),
        extractionConfidence: receipt.extractionConfidence ?? null,
        receiptDate: receipt.receiptDate ?? null,
        receiptReference: receipt.receiptReference ?? null,
        fileHash: receipt.fileHash ?? null,
        deletedAt: receipt.deletedAt ?? null,
      })),
    );
  }

  const getAllReceiptsForRecord = (recordId: string) => receiptRowsByRecordId.get(recordId) || [];
  const getActiveReceiptsForRecord = (recordId: string) =>
    getAllReceiptsForRecord(recordId).filter((receipt) => !receipt.deletedAt);
  const getArchivedReceiptsForRecord = (recordId: string) =>
    getAllReceiptsForRecord(recordId).filter((receipt) => Boolean(receipt.deletedAt));

  const applySettlementProjection = (record: CollectionRecordShape): CollectionRecordShape => {
    if (
      !record.sourceImportId
      || !record.sourceDataRowId
      || !record.callingDate
      || !record.callingWindowEndExclusive
      || record.totalDue == null
    ) {
      return {
        ...record,
        cumulativeCollected: null,
        remainingAmount: null,
        totalDueCovered: null,
        cpStatus: "unverified",
      };
    }

    const cumulativeCents = Array.from(records.values())
      .filter((candidate) => (
        candidate.sourceImportId === record.sourceImportId
        && candidate.sourceDataRowId === record.sourceDataRowId
        && candidate.callingDate === record.callingDate
        && candidate.callingWindowEndExclusive === record.callingWindowEndExclusive
        && candidate.paymentDate >= record.callingDate!
        && candidate.paymentDate < record.callingWindowEndExclusive!
        && !candidate.duplicateReceiptFlag
      ))
      .reduce((total, candidate) => total + parseAmountToCents(candidate.amount), 0);
    const totalDueCents = parseAmountToCents(record.totalDue);
    const covered = cumulativeCents >= totalDueCents;
    return {
      ...record,
      cumulativeCollected: formatAmountFromCents(cumulativeCents),
      remainingAmount: formatAmountFromCents(Math.max(totalDueCents - cumulativeCents, 0)),
      totalDueCovered: covered,
      cpStatus: covered ? "abort_cp" : "cp",
    };
  };

  const hydrateRecord = (record: CollectionRecordShape): CollectionRecordShape => ({
    ...applySettlementProjection(record),
    receipts: getActiveReceiptsForRecord(record.id),
    archivedReceipts: getArchivedReceiptsForRecord(record.id),
  });

  const syncRecordReceiptState = (recordId: string) => {
    const existing = records.get(recordId);
    if (!existing) {
      return;
    }

    const receipts = getActiveReceiptsForRecord(recordId);
    const allReceipts = getAllReceiptsForRecord(recordId);
    const validation = buildCollectionReceiptValidationResult({
      totalPaidCents: parseAmountToCents(existing.amount),
      receipts: receipts.map((receipt) => ({
        receiptId: receipt.id,
        fileHash: receipt.fileHash,
        originalFileName: receipt.originalFileName,
        receiptAmountCents:
          receipt.receiptAmount === null || receipt.receiptAmount === undefined || receipt.receiptAmount === ""
            ? null
            : parseAmountToCents(receipt.receiptAmount),
        extractedAmountCents:
          receipt.extractedAmount === null || receipt.extractedAmount === undefined || receipt.extractedAmount === ""
            ? null
            : parseAmountToCents(receipt.extractedAmount),
        extractionStatus: receipt.extractionStatus,
        extractionConfidence: receipt.extractionConfidence,
        receiptDate: receipt.receiptDate,
        receiptReference: receipt.receiptReference,
      })),
    });
    const seenHashes = new Set<string>();
    let duplicateReceiptFlag = false;
    for (const receipt of receipts) {
      const normalizedHash = String(receipt.fileHash || "").trim().toLowerCase();
      if (!normalizedHash) {
        continue;
      }
      if (seenHashes.has(normalizedHash)) {
        duplicateReceiptFlag = true;
        break;
      }
      seenHashes.add(normalizedHash);
    }
    records.set(recordId, {
      ...existing,
      receiptFile: receipts[0]?.storagePath || (allReceipts.length === 0 ? existing.receiptFile || null : null),
      receiptTotalAmount: formatAmountFromCents(validation.receiptTotalAmountCents),
      receiptValidationStatus: validation.status,
      receiptValidationMessage: validation.message,
      receiptCount: receipts.length,
      duplicateReceiptFlag,
    });
  };

  for (const recordId of records.keys()) {
    syncRecordReceiptState(recordId);
  }

  const storage = {
    getImportById: async (sourceImportId: string) => (
      sourceImportId === "import-1"
        ? {
            id: "import-1",
            name: "NPL CC P10 JULY",
            filename: "npl-cc-p10-july.xlsx",
            createdAt: new Date("2026-03-01T00:00:00.000Z"),
            isDeleted: false,
          }
        : null
    ),
    listCollectionSavedSourceFiles: async () => ({
      items: [{
        id: "import-1",
        name: "NPL CC P10 JULY",
        filename: "npl-cc-p10-july.xlsx",
        createdAt: "2026-03-01T00:00:00.000Z",
        rowCount: 2,
      }],
      limit: 100,
      nextCursor: null,
      total: 1,
    }),
    findEligibleCollectionSourceMatches: async (lookup: Record<string, string>) => {
      const accountNumber = String(lookup.accountNumber || "").trim();
      const cardNumber = String(lookup.cardNumber || "").trim();
      if (accountNumber === "NO-SAVED-MATCH" || cardNumber === "NO-SAVED-MATCH") {
        return { eligibleSourceCount: 1, matches: [] };
      }

      const callingDate = options?.sourceMatchCallingDate === undefined
        ? "2026-03-01"
        : options.sourceMatchCallingDate;
      const callingWindowEnd = options?.sourceMatchCallingWindowEnd === undefined
        ? "2026-03-31"
        : options.sourceMatchCallingWindowEnd;
      const callingWindowEndExclusive = options?.sourceMatchCallingWindowEndExclusive === undefined
        ? "2026-04-01"
        : options.sourceMatchCallingWindowEndExclusive;
      const sourceObligationKey = accountNumber
        ? `account:${accountNumber.toLowerCase()}`
        : `card:${cardNumber.toLowerCase() || "card-2002"}`;

      return {
        eligibleSourceCount: 1,
        matches: [{
          sourceImportId: "import-1",
          sourceDataRowId: "saved-row-1",
          sourceImportName: "NPL CC P10 JULY",
          sourceFilename: "npl-cc-p10-july.xlsx",
          sourceObligationKey,
          settlementCycleKey: `${callingDate || "missing"}:${sourceObligationKey}`,
          cardNumberLast4: cardNumber ? cardNumber.slice(-4) : null,
          matchBasis: accountNumber && cardNumber
            ? "account_and_card" as const
            : cardNumber
              ? "card_number" as const
              : "account_number" as const,
          totalDue: options?.sourceMatchTotalDue === undefined
            ? "200.00"
            : options.sourceMatchTotalDue,
          billingPrincipalOsp: "180.00",
          totalOsb: "250.00",
          agingBucket: "D4" as const,
          callingDate,
          callingWindowEnd,
          callingWindowEndExclusive,
          duplicateSourceCount: 1,
        }],
      };
    },
    findSavedCollectionSourceForRecord: async (lookup: Record<string, string>) => (
      lookup.accountNumber === "NO-SAVED-MATCH"
      || (lookup.sourceImportId && lookup.sourceImportId !== "import-1")
        ? null
        : {
            rowId: "saved-row-1",
            sourceImportId: "import-1",
            sourceImportName: "NPL CC P10 JULY",
            sourceFilename: "npl-cc-p10-july.xlsx",
            matchBasis: "ic" as const,
            matchAccuracy: 100,
            matchedFields: ["customer_name", "ic_number", "customer_phone", "account_number"] as const,
            comparedFields: ["customer_name", "ic_number", "customer_phone", "account_number"] as const,
            totalDue: options?.sourceMatchTotalDue === undefined
              ? "200.00"
              : options.sourceMatchTotalDue,
            billingPrincipalOsp: "180.00",
            callingDate: options?.sourceMatchCallingDate === undefined
              ? "2026-03-01"
              : options.sourceMatchCallingDate,
            callingWindowEnd: options?.sourceMatchCallingWindowEnd === undefined
              ? "2026-03-31"
              : options.sourceMatchCallingWindowEnd,
            callingWindowEndExclusive: options?.sourceMatchCallingWindowEndExclusive === undefined
              ? "2026-04-01"
              : options.sourceMatchCallingWindowEndExclusive,
          }
    ),
    findSavedCollectionSourcesForRecord: async (lookup: Record<string, string>) => (
      lookup.accountNumber === "NO-SAVED-MATCH"
      || lookup.sourceImportId !== "import-1"
        ? []
        : [{
            rowId: "saved-row-1",
            sourceImportId: "import-1",
            sourceImportName: "NPL CC P10 JULY",
            sourceFilename: "npl-cc-p10-july.xlsx",
            matchBasis: "ic" as const,
            matchAccuracy: 100,
            matchedFields: ["customer_name", "ic_number", "customer_phone", "account_number"] as const,
            comparedFields: ["customer_name", "ic_number", "customer_phone", "account_number"] as const,
            totalDue: options?.sourceMatchTotalDue === undefined
              ? "200.00"
              : options.sourceMatchTotalDue,
            billingPrincipalOsp: "180.00",
            callingDate: options?.sourceMatchCallingDate === undefined
              ? "2026-03-01"
              : options.sourceMatchCallingDate,
            callingWindowEnd: options?.sourceMatchCallingWindowEnd === undefined
              ? "2026-03-31"
              : options.sourceMatchCallingWindowEnd,
            callingWindowEndExclusive: options?.sourceMatchCallingWindowEndExclusive === undefined
              ? "2026-04-01"
              : options.sourceMatchCallingWindowEndExclusive,
          }]
    ),
    getCollectionSettlementProjection: async (input: Record<string, unknown>) => {
      const currentAmountCents = parseAmountToCents(input.currentAmount);
      const existingCents = Array.from(records.values())
        .filter((candidate) => candidate.id !== String(input.excludeRecordId || ""))
        .filter((candidate) => (
          candidate.sourceImportId === input.sourceImportId
          && candidate.sourceDataRowId === input.sourceDataRowId
          && candidate.callingDate === input.callingDate
          && candidate.callingWindowEndExclusive === input.callingWindowEndExclusive
          && candidate.paymentDate >= String(input.callingDate)
          && candidate.paymentDate < String(input.callingWindowEndExclusive)
          && !candidate.duplicateReceiptFlag
        ))
        .reduce((total, candidate) => total + parseAmountToCents(candidate.amount), 0);
      const projectedCents = existingCents + currentAmountCents;
      const totalDueCents = parseAmountToCents(input.totalDue);
      const covered = projectedCents >= totalDueCents;
      return {
        currentEntry: formatAmountFromCents(currentAmountCents),
        existingCumulative: formatAmountFromCents(existingCents),
        projectedCumulative: formatAmountFromCents(projectedCents),
        remainingAfterSave: formatAmountFromCents(Math.max(totalDueCents - projectedCents, 0)),
        projectedTotalDueCovered: covered,
        projectedCpStatus: covered ? "abort_cp" as const : "cp" as const,
      };
    },
    getCollectionNicknameSessionByActivity: async (activityId: string) => {
      if (!options?.sessionNickname) {
        return null;
      }
      return {
        activityId,
        username: "staff.user",
        userRole: "user",
        nickname: options.sessionNickname,
        verifiedAt: new Date("2026-03-10T00:00:00.000Z"),
        updatedAt: new Date("2026-03-10T00:00:00.000Z"),
      };
    },
    getCollectionStaffNicknameByName: async (nickname: string) =>
      nickname === activeNickname.nickname ? activeNickname : null,
    getCollectionNicknameAuthProfileByName: async (nickname: string) =>
      nickname === activeNickname.nickname ? {
        ...activeNickname,
        nicknamePasswordHash: "verified-test-profile-hash",
        mustChangePassword: false,
        passwordResetBySuperuser: false,
        passwordUpdatedAt: new Date("2026-01-01T00:00:00.000Z"),
      } : undefined,
    createCollectionRecord: async (
      data: Record<string, unknown>,
      receipts: CreateCollectionRecordReceiptInput[] = [],
    ) => {
      createCalls.push(data);
      const created: CollectionRecordShape = {
        id: `collection-${records.size + 1}`,
        customerName: String(data.customerName),
        icNumber: String(data.icNumber),
        customerPhone: String(data.customerPhone),
        accountNumber: String(data.accountNumber),
        cardNumberLast4: (data.cardNumberLast4 as string | null | undefined) ?? null,
        sourceImportId: (data.sourceImportId as string | null | undefined) ?? null,
        sourceDataRowId: (data.sourceDataRowId as string | null | undefined) ?? null,
        sourceImportName: (data.sourceImportName as string | null | undefined) ?? null,
        sourceFilename: (data.sourceFilename as string | null | undefined) ?? null,
        agingBucket: (data.agingBucket as CollectionRecordShape["agingBucket"]) ?? null,
        callingDate: (data.callingDate as string | null | undefined) ?? null,
        callingWindowEnd:
          data.callingWindowEndExclusive == null
            ? null
            : subtractOneDayDateOnly(String(data.callingWindowEndExclusive)),
        callingWindowEndExclusive:
          (data.callingWindowEndExclusive as string | null | undefined) ?? null,
        totalDue: data.totalDue == null ? null : Number(data.totalDue).toFixed(2),
        billingPrincipalOsp:
          data.billingPrincipalOsp == null ? null : Number(data.billingPrincipalOsp).toFixed(2),
        sourceMatchBasis: (data.sourceMatchBasis as CollectionRecordShape["sourceMatchBasis"]) ?? null,
        sourceMatchAccuracy:
          data.sourceMatchAccuracy == null ? null : Number(data.sourceMatchAccuracy),
        totalDueCovered: null,
        cumulativeCollected: null,
        remainingAmount: null,
        cpStatus: "unverified",
        batch: String(data.batch),
        paymentDate: String(data.paymentDate),
        amount: Number(data.amount).toFixed(2),
        receiptFile: (data.receiptFile as string | null | undefined) ?? null,
        receipts: [],
        receiptTotalAmount: "0.00",
        receiptValidationStatus: "unverified",
        receiptValidationMessage: "Tiada resit dilampirkan untuk semakan jumlah.",
        receiptCount: 0,
        duplicateReceiptFlag: false,
        createdByLogin: String(data.createdByLogin),
        collectionStaffNickname: String(data.collectionStaffNickname),
        createdAt: new Date("2026-03-15T10:00:00.000Z"),
        updatedAt: new Date("2026-03-15T10:00:00.000Z"),
      };
      records.set(created.id, created);
      if (receipts.length > 0) {
        await storage.createCollectionRecordReceipts(created.id, receipts);
      } else {
        syncRecordReceiptState(created.id);
      }
      return hydrateRecord(records.get(created.id) || created);
    },
    getCollectionRecordById: async (id: string) => {
      const record = records.get(id);
      return record ? hydrateRecord(record) : null;
    },
    createAuditLog: async (entry: AuditEntry) => {
      auditLogs.push(entry);
      return { id: `audit-${auditLogs.length}`, ...entry };
    },
    acquireMutationIdempotency: async (params: MutationIdempotencyAcquireInput) =>
      idempotency.acquire(params),
    completeMutationIdempotency: async (params: MutationIdempotencyCompleteInput) => {
      idempotency.complete(params);
    },
    releaseMutationIdempotency: async (
      params: Pick<MutationIdempotencyAcquireInput, "actor" | "idempotencyKey" | "scope">,
    ) => {
      idempotency.release(params);
    },
    summarizeCollectionRecords: async (filters: Record<string, unknown>) => {
      summaryCalls.push(filters);
      return {
        totalRecords: 1,
        totalAmount: 120.5,
      };
    },
    getCollectionRecordDailyRollupFreshness: async () => ({
      status: "fresh" as const,
      pendingCount: 0,
      runningCount: 0,
      retryCount: 0,
      oldestPendingAgeMs: 0,
    }),
    listCollectionRecords: async (filters: Record<string, unknown>) => {
      listCalls.push(filters);
      return Array.from(records.values()).map((record) => hydrateRecord(record));
    },
    listCollectionRecordReceipts: async (recordId: string) => getActiveReceiptsForRecord(recordId),
    findCollectionReceiptDuplicateSummaries: async (fileHashes: string[], options?: { excludeRecordId?: string }) => {
      const normalizedExcludeRecordId = String(options?.excludeRecordId || "").trim();
      const normalizedHashes = Array.from(
        new Set((fileHashes || []).map((value) => String(value || "").trim().toLowerCase()).filter(Boolean)),
      );

      return normalizedHashes
        .map((fileHash) => {
          const matches = Array.from(receiptRowsByRecordId.values())
            .flat()
            .filter((receipt) => !receipt.deletedAt)
            .filter((receipt) => receipt.fileHash === fileHash)
            .filter((receipt) => receipt.collectionRecordId !== normalizedExcludeRecordId)
            .map((receipt) => ({
              receiptId: receipt.id,
              collectionRecordId: receipt.collectionRecordId,
              originalFileName: receipt.originalFileName,
              createdAt: receipt.createdAt,
            }));

          return matches.length > 0
            ? {
                fileHash,
                matchCount: matches.length,
                matches,
              }
            : null;
        })
        .filter((summary): summary is NonNullable<typeof summary> => Boolean(summary));
    },
    getCollectionRecordReceiptById: async (recordId: string, receiptId: string) =>
      getAllReceiptsForRecord(recordId).find((receipt) => receipt.id === receiptId) || null,
    createCollectionRecordReceipts: async (
      recordId: string,
      receipts: Array<{
        storagePath: string;
        originalFileName: string;
        originalMimeType: string;
        originalExtension: string;
        fileSize: number;
        receiptAmountCents?: number | null;
        extractedAmountCents?: number | null;
        extractionStatus?: string | null;
        extractionConfidence?: number | null;
        receiptDate?: string | null;
        receiptReference?: string | null;
        fileHash?: string | null;
      }>,
    ) => {
      createReceiptCalls.push({
        recordId,
        receipts: receipts.map((receipt) => ({
          storagePath: String(receipt.storagePath || ""),
          originalFileName: String(receipt.originalFileName || ""),
          originalMimeType: String(receipt.originalMimeType || "application/octet-stream"),
          originalExtension: String(receipt.originalExtension || ""),
          fileSize: Number(receipt.fileSize || 0),
          receiptAmountCents: receipt.receiptAmountCents ?? null,
          extractedAmountCents: receipt.extractedAmountCents ?? null,
          extractionStatus: String(receipt.extractionStatus || "").trim() || "unprocessed",
          extractionConfidence: receipt.extractionConfidence ?? null,
          receiptDate: String(receipt.receiptDate || "").trim() || null,
          receiptReference: String(receipt.receiptReference || "").trim() || null,
          fileHash: String(receipt.fileHash || "").trim().toLowerCase() || null,
        })),
      });
      const current = receiptRowsByRecordId.get(recordId) || [];
      const insertedRows: CollectionReceiptShape[] = [];
      for (const receipt of receipts || []) {
        const duplicate = current.find((item) => item.storagePath === receipt.storagePath);
        if (duplicate) {
          insertedRows.push(duplicate);
          continue;
        }
        const created: CollectionReceiptShape = {
          id: `receipt-${recordId}-${current.length + insertedRows.length + 1}`,
          collectionRecordId: recordId,
          storagePath: String(receipt.storagePath || ""),
          originalFileName: String(receipt.originalFileName || ""),
          originalMimeType: String(receipt.originalMimeType || "application/octet-stream"),
          originalExtension: String(receipt.originalExtension || ""),
          fileSize: Number(receipt.fileSize || 0),
          receiptAmount: receipt.receiptAmountCents == null ? null : formatAmountFromCents(receipt.receiptAmountCents),
          extractedAmount: receipt.extractedAmountCents == null ? null : formatAmountFromCents(receipt.extractedAmountCents),
          extractionStatus: normalizeCollectionReceiptExtractionStatus(receipt.extractionStatus),
          extractionConfidence:
            receipt.extractionConfidence === undefined || receipt.extractionConfidence === null
              ? null
              : Number(receipt.extractionConfidence),
          receiptDate: String(receipt.receiptDate || "").trim() || null,
          receiptReference: String(receipt.receiptReference || "").trim() || null,
          fileHash: String(receipt.fileHash || "").trim().toLowerCase() || null,
          createdAt: new Date("2026-03-16T10:00:00.000Z"),
          deletedAt: null,
        };
        current.push(created);
        insertedRows.push(created);
      }
      receiptRowsByRecordId.set(recordId, current);
      syncRecordReceiptState(recordId);
      return insertedRows;
    },
    updateCollectionRecordReceipts: async (
      recordId: string,
      updates: Array<{
        receiptId: string;
        receiptAmountCents?: number | null;
        extractedAmountCents?: number | null;
        extractionStatus?: string | null;
        extractionConfidence?: number | null;
        receiptDate?: string | null;
        receiptReference?: string | null;
      }>,
    ) => {
      const current = receiptRowsByRecordId.get(recordId) || [];
      const updatedRows: CollectionReceiptShape[] = [];
      for (const update of updates || []) {
        const receipt = current.find((item) => item.id === update.receiptId && !item.deletedAt);
        if (!receipt) {
          continue;
        }
        receipt.receiptAmount =
          update.receiptAmountCents === undefined || update.receiptAmountCents === null
            ? null
            : formatAmountFromCents(update.receiptAmountCents);
        receipt.extractedAmount =
          update.extractedAmountCents === undefined || update.extractedAmountCents === null
            ? null
            : formatAmountFromCents(update.extractedAmountCents);
        receipt.extractionStatus = normalizeCollectionReceiptExtractionStatus(update.extractionStatus);
        receipt.extractionConfidence =
          update.extractionConfidence === undefined || update.extractionConfidence === null
            ? null
            : Number(update.extractionConfidence);
        receipt.receiptDate = String(update.receiptDate || "").trim() || null;
        receipt.receiptReference = String(update.receiptReference || "").trim() || null;
        updatedRows.push(receipt);
      }
      syncRecordReceiptState(recordId);
      return updatedRows;
    },
    deleteCollectionRecordReceipts: async (recordId: string, receiptIds: string[]) => {
      const normalizedReceiptIds = Array.from(
        new Set((receiptIds || []).map((value) => String(value || "").trim()).filter(Boolean)),
      );
      deleteReceiptCalls.push({
        recordId,
        receiptIds: normalizedReceiptIds,
      });
      const current = receiptRowsByRecordId.get(recordId) || [];
      const deletedRows = current.filter((receipt) => normalizedReceiptIds.includes(receipt.id) && !receipt.deletedAt);
      const archivedAt = new Date("2026-03-16T10:00:00.000Z");
      receiptRowsByRecordId.set(recordId, current.map((receipt) => (
        normalizedReceiptIds.includes(receipt.id) && !receipt.deletedAt
          ? { ...receipt, deletedAt: archivedAt }
          : receipt
      )));
      syncRecordReceiptState(recordId);
      return deletedRows;
    },
    syncCollectionRecordReceiptValidation: async (recordId: string) => {
      syncRecordReceiptState(recordId);
      return records.get(recordId) || null;
    },
    updateCollectionRecord: async (
      id: string,
      data: Record<string, unknown>,
      options?: {
        expectedUpdatedAt?: Date;
        removeAllReceipts?: boolean;
        removeReceiptIds?: string[];
        newReceipts?: Array<{
          storagePath: string;
          originalFileName: string;
          originalMimeType: string;
          originalExtension: string;
          fileSize: number;
          receiptAmountCents?: number | null;
          extractedAmountCents?: number | null;
          extractionStatus?: string | null;
          extractionConfidence?: number | null;
          receiptDate?: string | null;
          receiptReference?: string | null;
          fileHash?: string | null;
        }>;
        receiptUpdates?: Array<{
          receiptId: string;
          receiptAmountCents?: number | null;
          extractedAmountCents?: number | null;
          extractionStatus?: string | null;
          extractionConfidence?: number | null;
          receiptDate?: string | null;
          receiptReference?: string | null;
        }>;
      },
    ) => {
      updateCalls.push({ id, data, options });
      const existing = records.get(id);
      if (!existing) {
        return null;
      }
      if (
        options?.expectedUpdatedAt
        && existing.updatedAt
        && existing.updatedAt.getTime() !== options.expectedUpdatedAt.getTime()
      ) {
        return null;
      }
      const persistedData = Object.fromEntries(
        Object.entries(data).filter(([key]) => key !== "sourceCardNumber"),
      );
      const updated: CollectionRecordShape = {
        ...existing,
        ...persistedData,
        amount: data.amount !== undefined ? Number(data.amount).toFixed(2) : existing.amount,
        updatedAt: new Date("2026-03-16T10:00:00.000Z"),
      };
      records.set(id, updated);
      const current = receiptRowsByRecordId.get(id) || [];
      let nextRows = current.slice();
      if (options?.removeAllReceipts) {
        const archivedAt = new Date("2026-03-16T10:00:00.000Z");
        nextRows = nextRows.map((receipt) => (
          receipt.deletedAt ? receipt : { ...receipt, deletedAt: archivedAt }
        ));
      } else if (options?.removeReceiptIds?.length) {
        const removedIds = new Set(options.removeReceiptIds.map((value) => String(value || "").trim()).filter(Boolean));
        const archivedAt = new Date("2026-03-16T10:00:00.000Z");
        nextRows = nextRows.map((receipt) => (
          removedIds.has(receipt.id) && !receipt.deletedAt
            ? { ...receipt, deletedAt: archivedAt }
            : receipt
        ));
      }
      if (options?.receiptUpdates?.length) {
        nextRows = nextRows.map((receipt) => {
          if (receipt.deletedAt) {
            return receipt;
          }
          const update = options.receiptUpdates?.find((item) => item.receiptId === receipt.id);
          if (!update) {
            return receipt;
          }
          return {
            ...receipt,
            receiptAmount:
              update.receiptAmountCents === undefined || update.receiptAmountCents === null
                ? null
                : formatAmountFromCents(update.receiptAmountCents),
            extractedAmount:
              update.extractedAmountCents === undefined || update.extractedAmountCents === null
                ? null
                : formatAmountFromCents(update.extractedAmountCents),
            extractionStatus: normalizeCollectionReceiptExtractionStatus(update.extractionStatus),
            extractionConfidence:
              update.extractionConfidence === undefined || update.extractionConfidence === null
                ? null
                : Number(update.extractionConfidence),
            receiptDate: String(update.receiptDate || "").trim() || null,
            receiptReference: String(update.receiptReference || "").trim() || null,
          };
        });
      }
      if (options?.newReceipts?.length) {
        const appendedRows = options.newReceipts.map((receipt, index) => ({
          id: `receipt-${id}-update-${nextRows.length + index + 1}`,
          collectionRecordId: id,
          storagePath: String(receipt.storagePath || ""),
          originalFileName: String(receipt.originalFileName || ""),
          originalMimeType: String(receipt.originalMimeType || "application/octet-stream"),
          originalExtension: String(receipt.originalExtension || ""),
          fileSize: Number(receipt.fileSize || 0),
          receiptAmount:
            receipt.receiptAmountCents === undefined || receipt.receiptAmountCents === null
              ? null
              : formatAmountFromCents(receipt.receiptAmountCents),
          extractedAmount:
            receipt.extractedAmountCents === undefined || receipt.extractedAmountCents === null
              ? null
              : formatAmountFromCents(receipt.extractedAmountCents),
          extractionStatus: normalizeCollectionReceiptExtractionStatus(receipt.extractionStatus),
          extractionConfidence:
            receipt.extractionConfidence === undefined || receipt.extractionConfidence === null
              ? null
              : Number(receipt.extractionConfidence),
          receiptDate: String(receipt.receiptDate || "").trim() || null,
          receiptReference: String(receipt.receiptReference || "").trim() || null,
          fileHash: String(receipt.fileHash || "").trim().toLowerCase() || null,
          createdAt: new Date("2026-03-16T10:00:00.000Z"),
          deletedAt: null,
        }));
        nextRows = [...nextRows, ...appendedRows];
      }
      receiptRowsByRecordId.set(id, nextRows);
      syncRecordReceiptState(id);
      return hydrateRecord(updated);
    },
    deleteCollectionRecord: async (
      id: string,
      options?: { expectedUpdatedAt?: Date },
    ) => {
      deleteCalls.push({ id, options });
      const existing = records.get(id);
      if (!existing) {
        return false;
      }
      if (
        options?.expectedUpdatedAt
        && existing.updatedAt
        && existing.updatedAt.getTime() !== options.expectedUpdatedAt.getTime()
      ) {
        return false;
      }
      records.delete(id);
      receiptRowsByRecordId.delete(id);
      return true;
    },
  } as unknown as PostgresStorage;

  return {
    storage,
    auditLogs,
    createCalls,
    listCalls,
    summaryCalls,
    updateCalls,
    createReceiptCalls,
    deleteCalls,
    deleteReceiptCalls,
  };
}

// Write scenarios start after successful nickname authentication; read tests can
// continue exercising their explicit no-session/legacy ownership behavior.
export function createVerifiedCollectionStorageDouble(
  options?: Parameters<typeof createCoreCollectionStorageDouble>[0],
) {
  return createCoreCollectionStorageDouble({ sessionNickname: "Collector Alpha", ...options });
}
