import type { PostgresStorage } from "../../storage-postgres";

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
  batch: string;
  paymentDate: string;
  amount: string;
  receiptFile: string | null;
  receipts: unknown[];
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
  createdAt: Date;
};

export function createCollectionStorageDouble(options: {
  actorPasswordHash: string;
}) {
  const auditLogs: AuditEntry[] = [];
  let purgeCallCount = 0;

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
    purgeCollectionRecordsOlderThan: async (_cutoffDate: string) => {
      purgeCallCount += 1;
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
  };
}

export function createCoreCollectionStorageDouble(options?: {
  sessionNickname?: string | null;
  seedRecordOverrides?: Partial<CollectionRecordShape>;
  receiptRowsByRecordId?: Record<string, Array<{
    id: string;
    collectionRecordId: string;
    storagePath: string;
    originalFileName: string;
    originalMimeType: string;
    originalExtension: string;
    fileSize: number;
    createdAt: Date;
  }>>;
}) {
  const auditLogs: AuditEntry[] = [];
  const createCalls: Array<Record<string, unknown>> = [];
  const listCalls: Array<Record<string, unknown>> = [];
  const summaryCalls: Array<Record<string, unknown>> = [];
  const updateCalls: Array<{
    id: string;
    data: Record<string, unknown>;
    options?: { expectedUpdatedAt?: Date };
  }> = [];
  const deleteCalls: Array<{
    id: string;
    options?: { expectedUpdatedAt?: Date };
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
    batch: "P10",
    paymentDate: "2026-03-01",
    amount: "120.50",
    receiptFile: null,
    receipts: [],
    createdByLogin: "staff.user",
    collectionStaffNickname: "Collector Alpha",
    createdAt: new Date("2026-03-01T09:00:00.000Z"),
    updatedAt: new Date("2026-03-01T09:00:00.000Z"),
    ...options?.seedRecordOverrides,
  };
  records.set(seedRecord.id, seedRecord);
  const receiptRowsByRecordId = new Map<string, CollectionReceiptShape[]>();
  for (const [recordId, receipts] of Object.entries(options?.receiptRowsByRecordId || {})) {
    receiptRowsByRecordId.set(recordId, receipts);
  }

  const syncRecordReceiptFile = (recordId: string) => {
    const existing = records.get(recordId);
    if (!existing) {
      return;
    }

    const receipts = receiptRowsByRecordId.get(recordId) || [];
    records.set(recordId, {
      ...existing,
      receiptFile: receipts[0]?.storagePath || null,
    });
  };

  const storage = {
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
    createCollectionRecord: async (data: Record<string, unknown>) => {
      createCalls.push(data);
      const created: CollectionRecordShape = {
        id: `collection-${records.size + 1}`,
        customerName: String(data.customerName),
        icNumber: String(data.icNumber),
        customerPhone: String(data.customerPhone),
        accountNumber: String(data.accountNumber),
        batch: String(data.batch),
        paymentDate: String(data.paymentDate),
        amount: Number(data.amount).toFixed(2),
        receiptFile: (data.receiptFile as string | null | undefined) ?? null,
        receipts: [],
        createdByLogin: String(data.createdByLogin),
        collectionStaffNickname: String(data.collectionStaffNickname),
        createdAt: new Date("2026-03-15T10:00:00.000Z"),
        updatedAt: new Date("2026-03-15T10:00:00.000Z"),
      };
      records.set(created.id, created);
      return created;
    },
    getCollectionRecordById: async (id: string) => records.get(id) ?? null,
    createAuditLog: async (entry: AuditEntry) => {
      auditLogs.push(entry);
      return { id: `audit-${auditLogs.length}`, ...entry };
    },
    summarizeCollectionRecords: async (filters: Record<string, unknown>) => {
      summaryCalls.push(filters);
      return {
        totalRecords: 1,
        totalAmount: 120.5,
      };
    },
    listCollectionRecords: async (filters: Record<string, unknown>) => {
      listCalls.push(filters);
      return Array.from(records.values());
    },
    listCollectionRecordReceipts: async (recordId: string) => receiptRowsByRecordId.get(recordId) || [],
    getCollectionRecordReceiptById: async (recordId: string, receiptId: string) =>
      (receiptRowsByRecordId.get(recordId) || []).find((receipt) => receipt.id === receiptId) || null,
    createCollectionRecordReceipts: async (
      recordId: string,
      receipts: Array<{
        storagePath: string;
        originalFileName: string;
        originalMimeType: string;
        originalExtension: string;
        fileSize: number;
      }>,
    ) => {
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
          createdAt: new Date("2026-03-16T10:00:00.000Z"),
        };
        current.push(created);
        insertedRows.push(created);
      }
      receiptRowsByRecordId.set(recordId, current);
      syncRecordReceiptFile(recordId);
      return insertedRows;
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
      const deletedRows = current.filter((receipt) => normalizedReceiptIds.includes(receipt.id));
      receiptRowsByRecordId.set(
        recordId,
        current.filter((receipt) => !normalizedReceiptIds.includes(receipt.id)),
      );
      syncRecordReceiptFile(recordId);
      return deletedRows;
    },
    updateCollectionRecord: async (
      id: string,
      data: Record<string, unknown>,
      options?: { expectedUpdatedAt?: Date },
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
      const updated: CollectionRecordShape = {
        ...existing,
        ...data,
        amount: data.amount !== undefined ? Number(data.amount).toFixed(2) : existing.amount,
        updatedAt: new Date("2026-03-16T10:00:00.000Z"),
      };
      records.set(id, updated);
      return updated;
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
    deleteCalls,
    deleteReceiptCalls,
  };
}
