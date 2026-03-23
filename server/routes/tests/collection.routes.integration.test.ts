import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { hashPassword } from "../../auth/passwords";
import { registerCollectionRoutes } from "../collection.routes";
import type { PostgresStorage } from "../../storage-postgres";
import {
  allowAllTabs,
  createJsonTestApp,
  createTestAuthenticateToken,
  createTestRequireRole,
  startTestServer,
  stopTestServer,
} from "./http-test-utils";

type AuditEntry = {
  action: string;
  performedBy?: string;
  targetResource?: string;
  details?: string;
};

type CollectionRecordShape = {
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

function createCollectionStorageDouble(options: {
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

function createCoreCollectionStorageDouble(options?: {
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
  const receiptRowsByRecordId = new Map<string, Array<{
    id: string;
    collectionRecordId: string;
    storagePath: string;
    originalFileName: string;
    originalMimeType: string;
    originalExtension: string;
    fileSize: number;
    createdAt: Date;
  }>>();
  for (const [recordId, receipts] of Object.entries(options?.receiptRowsByRecordId || {})) {
    receiptRowsByRecordId.set(recordId, receipts);
  }

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
      return insertedRows;
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
  };
}

function createCollectionSummaryStorageDouble(options?: {
  sessionNickname?: string | null;
}) {
  const monthlySummaryCalls: Array<Record<string, unknown>> = [];
  const nicknameActiveChecks: string[] = [];
  const nicknameSummaryCalls: Array<Record<string, unknown>> = [];
  const nicknameListCalls: Array<Record<string, unknown>> = [];
  const activeNicknames = [
    {
      id: "nickname-1",
      nickname: "Collector Alpha",
      isActive: true,
      roleScope: "both",
      createdBy: "superuser",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      id: "nickname-2",
      nickname: "Collector Beta",
      isActive: true,
      roleScope: "both",
      createdBy: "superuser",
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
    },
  ];
  const nicknameSet = new Set(activeNicknames.map((item) => item.nickname.toLowerCase()));

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
    getCollectionStaffNicknames: async (_filters?: Record<string, unknown>) => activeNicknames,
    getCollectionMonthlySummary: async (filters: Record<string, unknown>) => {
      monthlySummaryCalls.push(filters);
      return [
        { month: 1, monthName: "January", totalRecords: 2, totalAmount: 300 },
        { month: 2, monthName: "February", totalRecords: 1, totalAmount: 150.5 },
      ];
    },
    isCollectionStaffNicknameActive: async (nickname: string) => {
      nicknameActiveChecks.push(nickname);
      return nicknameSet.has(String(nickname).toLowerCase());
    },
    summarizeCollectionRecords: async (filters: Record<string, unknown>) => {
      nicknameSummaryCalls.push(filters);
      return {
        totalRecords: 3,
        totalAmount: 450.5,
      };
    },
    summarizeCollectionRecordsByNickname: async (filters: Record<string, unknown>) => {
      return [
        {
          nickname: "Collector Alpha",
          totalRecords: 3,
          totalAmount: 450.5,
        },
      ];
    },
    listCollectionRecords: async (filters: Record<string, unknown>) => {
      nicknameListCalls.push(filters);
      return [
        {
          id: "collection-summary-1",
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
        },
      ];
    },
  } as unknown as PostgresStorage;

  return {
    storage,
    monthlySummaryCalls,
    nicknameActiveChecks,
    nicknameSummaryCalls,
    nicknameListCalls,
  };
}

function createAdminCollectionSummaryStorageDouble() {
  const monthlySummaryCalls: Array<Record<string, unknown>> = [];
  const nicknameSummaryCalls: Array<Record<string, unknown>> = [];
  const nicknameListCalls: Array<Record<string, unknown>> = [];
  const sessionActivityCalls: string[] = [];
  const groupLeaderCalls: string[] = [];
  const staffNicknameLookups: string[] = [];
  const allowedNicknames = ["Collector Alpha", "Collector Beta"];

  const storage = {
    getCollectionNicknameSessionByActivity: async (activityId: string) => {
      sessionActivityCalls.push(activityId);
      return {
        activityId,
        username: "admin.user",
        userRole: "admin",
        nickname: "Collector Alpha",
        verifiedAt: new Date("2026-03-10T00:00:00.000Z"),
        updatedAt: new Date("2026-03-10T00:00:00.000Z"),
      };
    },
    getCollectionAdminGroupVisibleNicknameValuesByLeader: async (leaderNickname: string) => {
      groupLeaderCalls.push(leaderNickname);
      return allowedNicknames;
    },
    getCollectionStaffNicknameByName: async (nickname: string) => {
      staffNicknameLookups.push(nickname);
      if (!allowedNicknames.includes(nickname)) {
        return null;
      }

      return {
        id: `nickname-${nickname.toLowerCase().replace(/\s+/g, "-")}`,
        nickname,
        isActive: true,
        roleScope: "both",
        createdBy: "superuser",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      };
    },
    getCollectionMonthlySummary: async (filters: Record<string, unknown>) => {
      monthlySummaryCalls.push(filters);
      return [{ month: 3, monthName: "March", totalRecords: 2, totalAmount: 420.75 }];
    },
    summarizeCollectionRecords: async (filters: Record<string, unknown>) => {
      nicknameSummaryCalls.push(filters);
      return {
        totalRecords: 2,
        totalAmount: 420.75,
      };
    },
    summarizeCollectionRecordsByNickname: async (filters: Record<string, unknown>) => {
      return [
        {
          nickname: "Collector Beta",
          totalRecords: 2,
          totalAmount: 420.75,
        },
      ];
    },
    listCollectionRecords: async (filters: Record<string, unknown>) => {
      nicknameListCalls.push(filters);
      return [
        {
          id: "collection-admin-summary-1",
          customerName: "Admin Scoped Customer",
          icNumber: "900101015555",
          customerPhone: "0123456789",
          accountNumber: "ACC-3001",
          batch: "P10",
          paymentDate: "2026-03-10",
          amount: "210.25",
          receiptFile: null,
          receipts: [],
          createdByLogin: "staff.user",
          collectionStaffNickname: "Collector Beta",
          createdAt: new Date("2026-03-10T09:00:00.000Z"),
        },
      ];
    },
  } as unknown as PostgresStorage;

  return {
    storage,
    allowedNicknames,
    monthlySummaryCalls,
    nicknameSummaryCalls,
    nicknameListCalls,
    sessionActivityCalls,
    groupLeaderCalls,
    staffNicknameLookups,
  };
}

function createAdminCollectionNoVisibilityStorageDouble() {
  const monthlySummaryCalls: Array<Record<string, unknown>> = [];
  const nicknameSummaryCalls: Array<Record<string, unknown>> = [];
  const nicknameListCalls: Array<Record<string, unknown>> = [];
  const sessionActivityCalls: string[] = [];
  const groupLeaderCalls: string[] = [];
  const staffNicknameLookups: string[] = [];

  const storage = {
    getCollectionNicknameSessionByActivity: async (activityId: string) => {
      sessionActivityCalls.push(activityId);
      return null;
    },
    getCollectionAdminGroupVisibleNicknameValuesByLeader: async (leaderNickname: string) => {
      groupLeaderCalls.push(leaderNickname);
      return [];
    },
    getCollectionStaffNicknameByName: async (nickname: string) => {
      staffNicknameLookups.push(nickname);
      return null;
    },
    getCollectionMonthlySummary: async (filters: Record<string, unknown>) => {
      monthlySummaryCalls.push(filters);
      return [{ month: 3, monthName: "March", totalRecords: 99, totalAmount: 9999 }];
    },
    summarizeCollectionRecords: async (filters: Record<string, unknown>) => {
      nicknameSummaryCalls.push(filters);
      return {
        totalRecords: 99,
        totalAmount: 9999,
      };
    },
    listCollectionRecords: async (filters: Record<string, unknown>) => {
      nicknameListCalls.push(filters);
      return [
        {
          id: "collection-admin-no-visibility-1",
          customerName: "Should Not Load",
          icNumber: "900101015555",
          customerPhone: "0123456789",
          accountNumber: "ACC-4001",
          batch: "P10",
          paymentDate: "2026-03-10",
          amount: "9999.00",
          receiptFile: null,
          receipts: [],
          createdByLogin: "staff.user",
          collectionStaffNickname: "Collector Hidden",
          createdAt: new Date("2026-03-10T09:00:00.000Z"),
        },
      ];
    },
  } as unknown as PostgresStorage;

  return {
    storage,
    monthlySummaryCalls,
    nicknameSummaryCalls,
    nicknameListCalls,
    sessionActivityCalls,
    groupLeaderCalls,
    staffNicknameLookups,
  };
}

test("DELETE /api/collection/purge-old rejects non-superuser access before service work begins", async () => {
  const actorPasswordHash = await hashPassword("SuperSecret123");
  const { storage, getPurgeCallCount, auditLogs } = createCollectionStorageDouble({
    actorPasswordHash,
  });
  const app = createJsonTestApp();

  registerCollectionRoutes(app, {
    storage,
    authenticateToken: createTestAuthenticateToken({
      userId: "admin-1",
      username: "admin.user",
      role: "admin",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/collection/purge-old`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ currentPassword: "SuperSecret123" }),
    });

    assert.equal(response.status, 403);
    assert.equal(getPurgeCallCount(), 0);
    assert.equal(auditLogs.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("DELETE /api/collection/purge-old logs a rejected attempt when the superuser password is wrong", async () => {
  const actorPasswordHash = await hashPassword("SuperSecret123");
  const { storage, getPurgeCallCount, auditLogs } = createCollectionStorageDouble({
    actorPasswordHash,
  });
  const app = createJsonTestApp();

  registerCollectionRoutes(app, {
    storage,
    authenticateToken: createTestAuthenticateToken({
      userId: "superuser-1",
      username: "superuser",
      role: "superuser",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/collection/purge-old`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ currentPassword: "WrongPassword999" }),
    });

    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.match(String(payload.message), /password login superuser tidak sah/i);
    assert.equal(getPurgeCallCount(), 0);
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].action, "COLLECTION_RECORDS_PURGE_REJECTED");
    assert.match(String(auditLogs[0].details), /invalid superuser password/i);
  } finally {
    await stopTestServer(server);
  }
});

test("DELETE /api/collection/purge-old purges and audits when the superuser password is valid", async () => {
  const actorPasswordHash = await hashPassword("SuperSecret123");
  const { storage, getPurgeCallCount, auditLogs } = createCollectionStorageDouble({
    actorPasswordHash,
  });
  const app = createJsonTestApp();

  registerCollectionRoutes(app, {
    storage,
    authenticateToken: createTestAuthenticateToken({
      userId: "superuser-1",
      username: "superuser",
      role: "superuser",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/collection/purge-old`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ currentPassword: "SuperSecret123" }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.deletedRecords, 2);
    assert.equal(payload.totalAmount, 450.75);
    assert.equal(getPurgeCallCount(), 1);
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].action, "COLLECTION_RECORDS_PURGED");
    assert.equal(auditLogs[0].performedBy, "superuser");
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/collection creates a collection record and writes an audit log", async () => {
  const { storage, createCalls, auditLogs } = createCoreCollectionStorageDouble();
  const app = createJsonTestApp();

  registerCollectionRoutes(app, {
    storage,
    authenticateToken: createTestAuthenticateToken({
      userId: "user-1",
      username: "staff.user",
      role: "user",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/collection`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customerName: "Bob Lee",
        icNumber: "880202026666",
        customerPhone: "0129876543",
        accountNumber: "ACC-2002",
        batch: "P25",
        paymentDate: "2026-03-15",
        amount: 245.9,
        collectionStaffNickname: "Collector Alpha",
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.record.customerName, "Bob Lee");
    assert.equal(payload.record.batch, "P25");
    assert.equal(createCalls.length, 1);
    assert.equal(createCalls[0].createdByLogin, "staff.user");
    assert.equal(createCalls[0].amount, 245.9);
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].action, "COLLECTION_RECORD_CREATED");
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/collection rejects future payment dates", async () => {
  const { storage } = createCoreCollectionStorageDouble();
  const app = createJsonTestApp();

  registerCollectionRoutes(app, {
    storage,
    authenticateToken: createTestAuthenticateToken({
      userId: "user-1",
      username: "staff.user",
      role: "user",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/collection`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customerName: "Future Customer",
        icNumber: "880202026666",
        customerPhone: "0129876543",
        accountNumber: "ACC-2999",
        batch: "P25",
        paymentDate: "2999-01-01",
        amount: 100,
        collectionStaffNickname: "Collector Alpha",
      }),
    });

    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.match(String(payload.message), /future/i);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/collection/list applies pagination and user-scoped filters", async () => {
  const { storage, listCalls, summaryCalls } = createCoreCollectionStorageDouble();
  const app = createJsonTestApp();

  registerCollectionRoutes(app, {
    storage,
    authenticateToken: createTestAuthenticateToken({
      userId: "user-1",
      username: "staff.user",
      role: "user",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(
      `${baseUrl}/api/collection/list?from=2026-03-01&to=2026-03-31&search=BATCH-001&limit=20&offset=40`,
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.limit, 20);
    assert.equal(payload.offset, 40);
    assert.equal(summaryCalls.length, 1);
    assert.equal(summaryCalls[0].createdByLogin, "staff.user");
    assert.equal(summaryCalls[0].search, "BATCH-001");
    assert.equal(listCalls.length, 1);
    assert.equal(listCalls[0].limit, 20);
    assert.equal(listCalls[0].offset, 40);
    assert.equal(listCalls[0].createdByLogin, "staff.user");
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/collection/list scopes user requests to the active staff nickname session", async () => {
  const { storage, listCalls, summaryCalls } = createCoreCollectionStorageDouble({
    sessionNickname: "Collector Alpha",
  });
  const app = createJsonTestApp();

  registerCollectionRoutes(app, {
    storage,
    authenticateToken: createTestAuthenticateToken({
      userId: "user-1",
      username: "staff.user",
      role: "user",
      activityId: "activity-user-collection-1",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/collection/list?from=2026-03-01&to=2026-03-31`);

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(summaryCalls.length, 1);
    assert.equal(summaryCalls[0].createdByLogin, undefined);
    assert.deepEqual(summaryCalls[0].nicknames, ["Collector Alpha"]);
    assert.equal(listCalls.length, 1);
    assert.equal(listCalls[0].createdByLogin, undefined);
    assert.deepEqual(listCalls[0].nicknames, ["Collector Alpha"]);
  } finally {
    await stopTestServer(server);
  }
});

test("PATCH /api/collection/:id updates a record and writes an audit log", async () => {
  const { storage, updateCalls, auditLogs } = createCoreCollectionStorageDouble();
  const app = createJsonTestApp();

  registerCollectionRoutes(app, {
    storage,
    authenticateToken: createTestAuthenticateToken({
      userId: "user-1",
      username: "staff.user",
      role: "user",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/collection/collection-1`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: "55.30",
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.record.amount, "55.30");
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].id, "collection-1");
    assert.equal(updateCalls[0].data.amount, 55.3);
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].action, "COLLECTION_RECORD_UPDATED");
  } finally {
    await stopTestServer(server);
  }
});

test("PATCH /api/collection/:id rejects stale expectedUpdatedAt values with 409 conflict", async () => {
  const { storage, updateCalls, auditLogs } = createCoreCollectionStorageDouble();
  const app = createJsonTestApp();

  registerCollectionRoutes(app, {
    storage,
    authenticateToken: createTestAuthenticateToken({
      userId: "user-1",
      username: "staff.user",
      role: "user",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/collection/collection-1`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: "55.30",
        expectedUpdatedAt: "2026-02-01T00:00:00.000Z",
      }),
    });

    assert.equal(response.status, 409);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.match(String(payload.message), /changed since you opened/i);
    assert.equal(updateCalls.length, 0);
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].action, "COLLECTION_RECORD_VERSION_CONFLICT");
  } finally {
    await stopTestServer(server);
  }
});

test("DELETE /api/collection/:id rejects stale expectedUpdatedAt values with 409 conflict", async () => {
  const { storage, deleteCalls, auditLogs } = createCoreCollectionStorageDouble();
  const app = createJsonTestApp();

  registerCollectionRoutes(app, {
    storage,
    authenticateToken: createTestAuthenticateToken({
      userId: "user-1",
      username: "staff.user",
      role: "user",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/collection/collection-1`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expectedUpdatedAt: "2026-02-01T00:00:00.000Z",
      }),
    });

    assert.equal(response.status, 409);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.match(String(payload.message), /changed since you opened/i);
    assert.equal(deleteCalls.length, 0);
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].action, "COLLECTION_RECORD_VERSION_CONFLICT");
  } finally {
    await stopTestServer(server);
  }
});

test("PATCH /api/collection/:id rejects user updates when the active staff nickname no longer owns the record", async () => {
  const { storage, updateCalls, auditLogs } = createCoreCollectionStorageDouble({
    sessionNickname: "Collector Beta",
  });
  const app = createJsonTestApp();

  registerCollectionRoutes(app, {
    storage,
    authenticateToken: createTestAuthenticateToken({
      userId: "user-1",
      username: "staff.user",
      role: "user",
      activityId: "activity-user-collection-2",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/collection/collection-1`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: "55.30",
      }),
    });

    assert.equal(response.status, 403);
    assert.equal(updateCalls.length, 0);
    assert.equal(auditLogs.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("PATCH /api/collection/:id rejects future payment dates", async () => {
  const { storage } = createCoreCollectionStorageDouble();
  const app = createJsonTestApp();

  registerCollectionRoutes(app, {
    storage,
    authenticateToken: createTestAuthenticateToken({
      userId: "user-1",
      username: "staff.user",
      role: "user",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/collection/collection-1`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        paymentDate: "2999-01-01",
      }),
    });

    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.match(String(payload.message), /future/i);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/collection/:id/receipt/view rejects users who no longer own the record nickname", async () => {
  const { storage } = createCoreCollectionStorageDouble({
    sessionNickname: "Collector Beta",
    seedRecordOverrides: {
      receiptFile: "/uploads/collection-receipts/missing.pdf",
    },
  });
  const app = createJsonTestApp();

  registerCollectionRoutes(app, {
    storage,
    authenticateToken: createTestAuthenticateToken({
      userId: "user-1",
      username: "staff.user",
      role: "user",
      activityId: "activity-user-collection-receipt-1",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/collection/collection-1/receipt/view`);
    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.match(String(payload.message), /forbidden/i);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/collection/:id/receipt/download returns 404 when receipt file is missing", async () => {
  const { storage } = createCoreCollectionStorageDouble({
    sessionNickname: "Collector Alpha",
    seedRecordOverrides: {
      receiptFile: "/uploads/collection-receipts/missing.pdf",
    },
  });
  const app = createJsonTestApp();

  registerCollectionRoutes(app, {
    storage,
    authenticateToken: createTestAuthenticateToken({
      userId: "user-1",
      username: "staff.user",
      role: "user",
      activityId: "activity-user-collection-receipt-2",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/collection/collection-1/receipt/download`);
    assert.equal(response.status, 404);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.match(String(payload.message), /receipt file not found/i);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/collection/:id/receipt/view promotes legacy receipt_file into relation-backed receipts", async () => {
  const uploadsDir = path.resolve(process.cwd(), "uploads", "collection-receipts");
  const storedFileName = `route-test-legacy-receipt-${Date.now()}-${Math.random().toString(16).slice(2)}.pdf`;
  const storedReceiptPath = `/uploads/collection-receipts/${storedFileName}`;
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.writeFile(path.join(uploadsDir, storedFileName), Buffer.from("%PDF-1.7\n%legacy\n"));

  const { storage } = createCoreCollectionStorageDouble({
    sessionNickname: "Collector Alpha",
    seedRecordOverrides: {
      receiptFile: storedReceiptPath,
    },
  });
  const app = createJsonTestApp();

  registerCollectionRoutes(app, {
    storage,
    authenticateToken: createTestAuthenticateToken({
      userId: "user-1",
      username: "staff.user",
      role: "user",
      activityId: "activity-user-collection-receipt-legacy",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const primaryResponse = await fetch(`${baseUrl}/api/collection/collection-1/receipt/view`);
    assert.equal(primaryResponse.status, 200);
    assert.equal(primaryResponse.headers.get("content-type"), "application/pdf");

    const promotedResponse = await fetch(
      `${baseUrl}/api/collection/collection-1/receipts/receipt-collection-1-1/view`,
    );
    assert.equal(promotedResponse.status, 200);
    assert.equal(promotedResponse.headers.get("content-type"), "application/pdf");
  } finally {
    await stopTestServer(server);
    await fs.unlink(path.join(uploadsDir, storedFileName)).catch(() => undefined);
  }
});

test("GET /api/collection/:id/receipts/:receiptId/view does not fallback to legacy receipt_file when receiptId is unknown", async () => {
  const uploadsDir = path.resolve(process.cwd(), "uploads", "collection-receipts");
  const storedFileName = `route-test-receipt-${Date.now()}-${Math.random().toString(16).slice(2)}.pdf`;
  const storedReceiptPath = `/uploads/collection-receipts/${storedFileName}`;
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.writeFile(path.join(uploadsDir, storedFileName), Buffer.from("%PDF-1.7\n%test\n"));

  const { storage } = createCoreCollectionStorageDouble({
    sessionNickname: "Collector Alpha",
    seedRecordOverrides: {
      receiptFile: storedReceiptPath,
    },
  });
  const app = createJsonTestApp();

  registerCollectionRoutes(app, {
    storage,
    authenticateToken: createTestAuthenticateToken({
      userId: "user-1",
      username: "staff.user",
      role: "user",
      activityId: "activity-user-collection-receipt-3",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/collection/collection-1/receipts/missing-receipt/view`);
    assert.equal(response.status, 404);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.match(String(payload.message), /receipt file not found/i);
  } finally {
    await stopTestServer(server);
    await fs.unlink(path.join(uploadsDir, storedFileName)).catch(() => undefined);
  }
});

test("GET /api/collection/summary passes year and nickname filters to the summary query", async () => {
  const { storage, monthlySummaryCalls } = createCollectionSummaryStorageDouble();
  const app = createJsonTestApp();

  registerCollectionRoutes(app, {
    storage,
    authenticateToken: createTestAuthenticateToken({
      userId: "superuser-1",
      username: "superuser",
      role: "superuser",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(
      `${baseUrl}/api/collection/summary?year=2026&nicknames=Collector%20Alpha,Collector%20Beta`,
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.year, 2026);
    assert.equal(payload.summary.length, 2);
    assert.equal(monthlySummaryCalls.length, 1);
    assert.equal(monthlySummaryCalls[0].year, 2026);
    assert.deepEqual(monthlySummaryCalls[0].nicknames, ["Collector Alpha", "Collector Beta"]);
    assert.equal(monthlySummaryCalls[0].createdByLogin, undefined);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/collection/summary scopes user requests to the active staff nickname session", async () => {
  const { storage, monthlySummaryCalls } = createCollectionSummaryStorageDouble({
    sessionNickname: "Collector Alpha",
  });
  const app = createJsonTestApp();

  registerCollectionRoutes(app, {
    storage,
    authenticateToken: createTestAuthenticateToken({
      userId: "user-1",
      username: "staff.user",
      role: "user",
      activityId: "activity-user-summary-1",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/collection/summary?year=2026`);

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(monthlySummaryCalls.length, 1);
    assert.equal(monthlySummaryCalls[0].createdByLogin, undefined);
    assert.deepEqual(monthlySummaryCalls[0].nicknames, ["Collector Alpha"]);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/collection/summary scopes admin requests to the visible nickname group when no nickname filter is provided", async () => {
  const { storage, allowedNicknames, monthlySummaryCalls, sessionActivityCalls, groupLeaderCalls, staffNicknameLookups } =
    createAdminCollectionSummaryStorageDouble();
  const app = createJsonTestApp();

  registerCollectionRoutes(app, {
    storage,
    authenticateToken: createTestAuthenticateToken({
      userId: "admin-1",
      username: "admin.user",
      role: "admin",
      activityId: "activity-admin-1",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/collection/summary?year=2026`);

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.year, 2026);
    assert.equal(payload.summary.length, 1);
    assert.deepEqual(sessionActivityCalls, ["activity-admin-1"]);
    assert.deepEqual(groupLeaderCalls, ["Collector Alpha"]);
    assert.deepEqual(monthlySummaryCalls, [
      {
        year: 2026,
        nicknames: allowedNicknames,
        createdByLogin: undefined,
      },
    ]);
    assert.equal(staffNicknameLookups.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/collection/summary returns an empty summary for admins without nickname session visibility", async () => {
  const { storage, monthlySummaryCalls, sessionActivityCalls, groupLeaderCalls, staffNicknameLookups } =
    createAdminCollectionNoVisibilityStorageDouble();
  const app = createJsonTestApp();

  registerCollectionRoutes(app, {
    storage,
    authenticateToken: createTestAuthenticateToken({
      userId: "admin-2",
      username: "admin.user",
      role: "admin",
      activityId: "activity-admin-empty-1",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/collection/summary?year=2026`);

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.year, 2026);
    assert.equal(payload.summary.length, 12);
    assert.deepEqual(payload.summary[0], {
      month: 1,
      monthName: "January",
      totalRecords: 0,
      totalAmount: 0,
    });
    assert.deepEqual(payload.summary[11], {
      month: 12,
      monthName: "December",
      totalRecords: 0,
      totalAmount: 0,
    });
    assert.deepEqual(sessionActivityCalls, ["activity-admin-empty-1"]);
    assert.equal(groupLeaderCalls.length, 0);
    assert.equal(staffNicknameLookups.length, 0);
    assert.equal(monthlySummaryCalls.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/collection/nickname-summary honors summaryOnly and avoids loading record rows", async () => {
  const { storage, nicknameActiveChecks, nicknameSummaryCalls, nicknameListCalls } = createCollectionSummaryStorageDouble();
  const app = createJsonTestApp();

  registerCollectionRoutes(app, {
    storage,
    authenticateToken: createTestAuthenticateToken({
      userId: "superuser-1",
      username: "superuser",
      role: "superuser",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(
      `${baseUrl}/api/collection/nickname-summary?from=2026-03-01&to=2026-03-31&nicknames=Collector%20Alpha&summaryOnly=1`,
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.deepEqual(payload.nicknames, ["Collector Alpha"]);
    assert.equal(payload.totalRecords, 3);
    assert.equal(payload.totalAmount, 450.5);
    assert.deepEqual(payload.records, []);
    assert.deepEqual(nicknameActiveChecks, ["Collector Alpha"]);
    assert.equal(nicknameSummaryCalls.length, 1);
    assert.equal(nicknameSummaryCalls[0].from, "2026-03-01");
    assert.equal(nicknameSummaryCalls[0].to, "2026-03-31");
    assert.deepEqual(nicknameSummaryCalls[0].nicknames, ["Collector Alpha"]);
    assert.equal(nicknameListCalls.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/collection/nickname-summary returns an empty payload immediately when no nicknames are selected", async () => {
  const { storage, nicknameActiveChecks, nicknameSummaryCalls, nicknameListCalls } = createCollectionSummaryStorageDouble();
  const app = createJsonTestApp();

  registerCollectionRoutes(app, {
    storage,
    authenticateToken: createTestAuthenticateToken({
      userId: "superuser-1",
      username: "superuser",
      role: "superuser",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/collection/nickname-summary?from=2026-03-01&to=2026-03-31`);

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.deepEqual(payload.nicknames, []);
    assert.equal(payload.totalRecords, 0);
    assert.equal(payload.totalAmount, 0);
    assert.deepEqual(payload.records, []);
    assert.equal(nicknameActiveChecks.length, 0);
    assert.equal(nicknameSummaryCalls.length, 0);
    assert.equal(nicknameListCalls.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/collection/nickname-summary rejects admin filters outside the visible nickname scope", async () => {
  const { storage, nicknameSummaryCalls, nicknameListCalls, sessionActivityCalls, groupLeaderCalls } =
    createAdminCollectionSummaryStorageDouble();
  const app = createJsonTestApp();

  registerCollectionRoutes(app, {
    storage,
    authenticateToken: createTestAuthenticateToken({
      userId: "admin-1",
      username: "admin.user",
      role: "admin",
      activityId: "activity-admin-2",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(
      `${baseUrl}/api/collection/nickname-summary?from=2026-03-01&to=2026-03-31&nicknames=Collector%20Gamma`,
    );

    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.match(String(payload.message), /invalid nickname filter/i);
    assert.deepEqual(sessionActivityCalls, ["activity-admin-2"]);
    assert.deepEqual(groupLeaderCalls, ["Collector Alpha"]);
    assert.equal(nicknameSummaryCalls.length, 0);
    assert.equal(nicknameListCalls.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/collection/nickname-summary allows admin-visible nicknames and skips record loading when summaryOnly is enabled", async () => {
  const { storage, nicknameSummaryCalls, nicknameListCalls, sessionActivityCalls, groupLeaderCalls } =
    createAdminCollectionSummaryStorageDouble();
  const app = createJsonTestApp();

  registerCollectionRoutes(app, {
    storage,
    authenticateToken: createTestAuthenticateToken({
      userId: "admin-1",
      username: "admin.user",
      role: "admin",
      activityId: "activity-admin-3",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(
      `${baseUrl}/api/collection/nickname-summary?from=2026-03-01&to=2026-03-31&nicknames=Collector%20Beta&summaryOnly=1`,
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.deepEqual(payload.nicknames, ["Collector Beta"]);
    assert.equal(payload.totalRecords, 2);
    assert.equal(payload.totalAmount, 420.75);
    assert.deepEqual(payload.records, []);
    assert.deepEqual(sessionActivityCalls, ["activity-admin-3"]);
    assert.deepEqual(groupLeaderCalls, ["Collector Alpha"]);
    assert.deepEqual(nicknameSummaryCalls, [
      {
        from: "2026-03-01",
        to: "2026-03-31",
        nicknames: ["Collector Beta"],
      },
    ]);
    assert.equal(nicknameListCalls.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/collection/list returns an empty payload for admins without nickname session visibility", async () => {
  const { storage, monthlySummaryCalls, nicknameSummaryCalls, nicknameListCalls, sessionActivityCalls, groupLeaderCalls, staffNicknameLookups } =
    createAdminCollectionNoVisibilityStorageDouble();
  const app = createJsonTestApp();

  registerCollectionRoutes(app, {
    storage,
    authenticateToken: createTestAuthenticateToken({
      userId: "admin-2",
      username: "admin.user",
      role: "admin",
      activityId: "activity-admin-empty-2",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(
      `${baseUrl}/api/collection/list?from=2026-03-01&to=2026-03-31&search=P10&limit=20&offset=40`,
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.deepEqual(payload.records, []);
    assert.equal(payload.total, 0);
    assert.equal(payload.totalAmount, 0);
    assert.equal(payload.limit, 20);
    assert.equal(payload.offset, 40);
    assert.deepEqual(sessionActivityCalls, ["activity-admin-empty-2"]);
    assert.equal(groupLeaderCalls.length, 0);
    assert.equal(staffNicknameLookups.length, 0);
    assert.equal(monthlySummaryCalls.length, 0);
    assert.equal(nicknameSummaryCalls.length, 0);
    assert.equal(nicknameListCalls.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("PATCH /api/collection/:id rejects a stale rapid second edit and keeps daily, summary, and nickname totals aligned", async () => {
  const records = new Map<string, CollectionRecordShape>([
    [
      "alpha-jan-1",
      {
        id: "alpha-jan-1",
        customerName: "Alpha January Customer",
        icNumber: "900101050001",
        customerPhone: "0161111111",
        accountNumber: "ACC-SA1",
        batch: "P10",
        paymentDate: "2026-01-10",
        amount: "1000.00",
        receiptFile: null,
        receipts: [],
        createdByLogin: "alpha.user",
        collectionStaffNickname: "Collector Alpha",
        createdAt: new Date("2026-01-10T09:00:00.000Z"),
        updatedAt: new Date("2026-01-10T09:00:00.000Z"),
      },
    ],
    [
      "beta-jan-1",
      {
        id: "beta-jan-1",
        customerName: "Beta January Customer",
        icNumber: "900101050002",
        customerPhone: "0162222222",
        accountNumber: "ACC-SB1",
        batch: "P25",
        paymentDate: "2026-01-11",
        amount: "200.00",
        receiptFile: null,
        receipts: [],
        createdByLogin: "beta.user",
        collectionStaffNickname: "Collector Beta",
        createdAt: new Date("2026-01-11T09:00:00.000Z"),
        updatedAt: new Date("2026-01-11T09:00:00.000Z"),
      },
    ],
    [
      "alpha-feb-1",
      {
        id: "alpha-feb-1",
        customerName: "Alpha February Customer",
        icNumber: "900101050003",
        customerPhone: "0163333333",
        accountNumber: "ACC-SA2",
        batch: "P10",
        paymentDate: "2026-02-01",
        amount: "700.00",
        receiptFile: null,
        receipts: [],
        createdByLogin: "alpha.user",
        collectionStaffNickname: "Collector Alpha",
        createdAt: new Date("2026-02-01T09:00:00.000Z"),
        updatedAt: new Date("2026-02-01T09:00:00.000Z"),
      },
    ],
  ]);
  let updateSequence = 0;

  const nicknameProfiles = [
    {
      id: "nickname-alpha",
      nickname: "Collector Alpha",
      isActive: true,
      roleScope: "both",
      createdBy: "superuser",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      id: "nickname-beta",
      nickname: "Collector Beta",
      isActive: true,
      roleScope: "both",
      createdBy: "superuser",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ];
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const normalizeNicknameSet = (values?: string[]) =>
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean),
    );

  const filterRecords = (filters?: {
    from?: string;
    to?: string;
    search?: string;
    createdByLogin?: string;
    nicknames?: string[];
    limit?: number;
    offset?: number;
  }) => {
    const from = String(filters?.from || "");
    const to = String(filters?.to || "");
    const createdByLogin = String(filters?.createdByLogin || "").toLowerCase();
    const search = String(filters?.search || "").trim().toLowerCase();
    const nicknameSet = normalizeNicknameSet(filters?.nicknames);
    const rows = Array.from(records.values()).filter((record) => {
      if (from && record.paymentDate < from) return false;
      if (to && record.paymentDate > to) return false;
      if (createdByLogin && String(record.createdByLogin || "").toLowerCase() !== createdByLogin) {
        return false;
      }
      if (nicknameSet.size > 0 && !nicknameSet.has(record.collectionStaffNickname.toLowerCase())) {
        return false;
      }
      if (search) {
        const haystack = [
          record.customerName,
          record.accountNumber,
          record.icNumber,
          record.customerPhone,
          record.collectionStaffNickname,
          record.createdByLogin,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(search)) {
          return false;
        }
      }
      return true;
    });

    rows.sort((left, right) => {
      const byDate = left.paymentDate.localeCompare(right.paymentDate);
      if (byDate !== 0) return byDate;
      return left.id.localeCompare(right.id);
    });

    return rows;
  };

  const summarizeRows = (rows: CollectionRecordShape[]) => ({
    totalRecords: rows.length,
    totalAmount:
      Math.round((rows.reduce((sum, row) => sum + Number(row.amount || 0), 0) + Number.EPSILON) * 100) / 100,
  });

  const storage = {
    getCollectionNicknameSessionByActivity: async () => null,
    getCollectionStaffNicknames: async () => nicknameProfiles,
    getCollectionStaffNicknameByName: async (nickname: string) =>
      nicknameProfiles.find((item) => item.nickname.toLowerCase() === String(nickname).toLowerCase()) || null,
    isCollectionStaffNicknameActive: async (nickname: string) =>
      nicknameProfiles.some((item) => item.nickname.toLowerCase() === String(nickname).toLowerCase() && item.isActive),
    getCollectionDailyTarget: async (params: { username: string; year: number; month: number }) => {
      if (params.year !== 2026 || (params.month !== 1 && params.month !== 2)) return null;
      return {
        id: `target-${params.username}-${params.year}-${params.month}`,
        username: String(params.username || "").toLowerCase(),
        year: params.year,
        month: params.month,
        monthlyTarget: 5000,
        createdBy: "superuser",
        updatedBy: "superuser",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      };
    },
    listCollectionDailyCalendar: async () => [],
    getCollectionMonthlySummary: async (filters: {
      year: number;
      createdByLogin?: string;
      nicknames?: string[];
    }) => {
      const nicknameSet = normalizeNicknameSet(filters.nicknames);
      const createdByLogin = String(filters.createdByLogin || "").toLowerCase();
      const rows = Array.from(records.values()).filter((record) => {
        const paymentYear = Number.parseInt(record.paymentDate.slice(0, 4), 10);
        if (paymentYear !== filters.year) return false;
        if (nicknameSet.size > 0 && !nicknameSet.has(record.collectionStaffNickname.toLowerCase())) {
          return false;
        }
        if (createdByLogin && String(record.createdByLogin || "").toLowerCase() !== createdByLogin) {
          return false;
        }
        return true;
      });

      const byMonth = new Map<number, { totalRecords: number; totalAmount: number }>();
      for (const row of rows) {
        const month = Number.parseInt(row.paymentDate.slice(5, 7), 10);
        const current = byMonth.get(month) || { totalRecords: 0, totalAmount: 0 };
        current.totalRecords += 1;
        current.totalAmount += Number(row.amount || 0);
        byMonth.set(month, current);
      }

      return Array.from(byMonth.entries())
        .sort((left, right) => left[0] - right[0])
        .map(([month, aggregate]) => ({
          month,
          monthName: monthNames[month - 1] || `Month ${month}`,
          totalRecords: aggregate.totalRecords,
          totalAmount: Math.round((aggregate.totalAmount + Number.EPSILON) * 100) / 100,
        }));
    },
    summarizeCollectionRecords: async (filters?: {
      from?: string;
      to?: string;
      search?: string;
      createdByLogin?: string;
      nicknames?: string[];
    }) => summarizeRows(filterRecords(filters)),
    summarizeCollectionRecordsByNickname: async (filters?: {
      from?: string;
      to?: string;
      search?: string;
      createdByLogin?: string;
      nicknames?: string[];
    }) => {
      const rows = filterRecords(filters);
      const byNickname = new Map<string, { totalRecords: number; totalAmount: number }>();
      for (const row of rows) {
        const key = row.collectionStaffNickname;
        const current = byNickname.get(key) || { totalRecords: 0, totalAmount: 0 };
        current.totalRecords += 1;
        current.totalAmount += Number(row.amount || 0);
        byNickname.set(key, current);
      }

      return Array.from(byNickname.entries())
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([nickname, aggregate]) => ({
          nickname,
          totalRecords: aggregate.totalRecords,
          totalAmount: Math.round((aggregate.totalAmount + Number.EPSILON) * 100) / 100,
        }));
    },
    listCollectionRecords: async (filters?: {
      from?: string;
      to?: string;
      search?: string;
      createdByLogin?: string;
      nicknames?: string[];
      limit?: number;
      offset?: number;
    }) => {
      const rows = filterRecords(filters);
      const limit = Number.isFinite(Number(filters?.limit)) ? Math.max(1, Number(filters?.limit)) : rows.length;
      const offset = Number.isFinite(Number(filters?.offset)) ? Math.max(0, Number(filters?.offset)) : 0;
      return rows.slice(offset, offset + limit);
    },
    getCollectionRecordById: async (id: string) => records.get(id) || null,
    updateCollectionRecord: async (
      id: string,
      data: Record<string, unknown>,
      options?: { expectedUpdatedAt?: Date },
    ) => {
      const existing = records.get(id);
      if (!existing) return null;
      if (
        options?.expectedUpdatedAt
        && (existing.updatedAt || existing.createdAt).getTime() !== options.expectedUpdatedAt.getTime()
      ) {
        return null;
      }
      const updated: CollectionRecordShape = {
        ...existing,
        customerName:
          data.customerName !== undefined ? String(data.customerName) : existing.customerName,
        icNumber: data.icNumber !== undefined ? String(data.icNumber) : existing.icNumber,
        customerPhone:
          data.customerPhone !== undefined ? String(data.customerPhone) : existing.customerPhone,
        accountNumber:
          data.accountNumber !== undefined ? String(data.accountNumber) : existing.accountNumber,
        batch: data.batch !== undefined ? String(data.batch) : existing.batch,
        paymentDate:
          data.paymentDate !== undefined ? String(data.paymentDate) : existing.paymentDate,
        amount:
          data.amount !== undefined ? Number(data.amount || 0).toFixed(2) : existing.amount,
        collectionStaffNickname:
          data.collectionStaffNickname !== undefined
            ? String(data.collectionStaffNickname)
            : existing.collectionStaffNickname,
        updatedAt: new Date(Date.UTC(2026, 1, 15, 8, 0, updateSequence++)),
      };
      records.set(id, updated);
      return updated;
    },
    createAuditLog: async (_entry: AuditEntry) => ({ id: "audit-mutation-1" }),
  } as unknown as PostgresStorage;

  const app = createJsonTestApp();
  registerCollectionRoutes(app, {
    storage,
    authenticateToken: createTestAuthenticateToken({
      userId: "superuser-1",
      username: "superuser",
      role: "superuser",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const beforeSummaryResponse = await fetch(`${baseUrl}/api/collection/summary?year=2026`);
    assert.equal(beforeSummaryResponse.status, 200);
    const beforeSummaryPayload = await beforeSummaryResponse.json();
    assert.equal(beforeSummaryPayload.ok, true);
    const beforeJanuarySummary = beforeSummaryPayload.summary.find((entry: any) => entry.month === 1);
    const beforeFebruarySummary = beforeSummaryPayload.summary.find((entry: any) => entry.month === 2);
    assert.equal(beforeJanuarySummary?.totalAmount, 1200);
    assert.equal(beforeFebruarySummary?.totalAmount, 700);

    const beforeDailyResponse = await fetch(
      `${baseUrl}/api/collection/daily/overview?year=2026&month=1&usernames=Collector%20Alpha,Collector%20Beta`,
    );
    assert.equal(beforeDailyResponse.status, 200);
    const beforeDailyPayload = await beforeDailyResponse.json();
    assert.equal(beforeDailyPayload.ok, true);
    assert.equal(beforeDailyPayload.summary.collectedAmount, 1200);

    const beforeNicknameResponse = await fetch(
      `${baseUrl}/api/collection/nickname-summary?from=2026-01-01&to=2026-01-31&nicknames=Collector%20Alpha,Collector%20Beta&summaryOnly=1`,
    );
    assert.equal(beforeNicknameResponse.status, 200);
    const beforeNicknamePayload = await beforeNicknameResponse.json();
    const beforeAlphaNickname = beforeNicknamePayload.nicknameTotals.find((item: any) => item.nickname === "Collector Alpha");
    const beforeBetaNickname = beforeNicknamePayload.nicknameTotals.find((item: any) => item.nickname === "Collector Beta");
    assert.equal(beforeNicknamePayload.totalAmount, 1200);
    assert.equal(beforeAlphaNickname?.totalAmount, 1000);
    assert.equal(beforeBetaNickname?.totalAmount, 200);

    const updateResponse = await fetch(`${baseUrl}/api/collection/alpha-jan-1`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        collectionStaffNickname: "Collector Beta",
        paymentDate: "2026-02-02",
        amount: "1500",
        expectedUpdatedAt: "2026-01-10T09:00:00.000Z",
      }),
    });
    assert.equal(updateResponse.status, 200);

    const staleRapidUpdateResponse = await fetch(`${baseUrl}/api/collection/alpha-jan-1`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: "1700",
        expectedUpdatedAt: "2026-01-10T09:00:00.000Z",
      }),
    });
    assert.equal(staleRapidUpdateResponse.status, 409);
    const staleRapidUpdatePayload = await staleRapidUpdateResponse.json();
    assert.equal(staleRapidUpdatePayload.ok, false);
    assert.match(String(staleRapidUpdatePayload.message), /changed since you opened/i);

    const afterSummaryResponse = await fetch(`${baseUrl}/api/collection/summary?year=2026`);
    assert.equal(afterSummaryResponse.status, 200);
    const afterSummaryPayload = await afterSummaryResponse.json();
    const afterJanuarySummary = afterSummaryPayload.summary.find((entry: any) => entry.month === 1);
    const afterFebruarySummary = afterSummaryPayload.summary.find((entry: any) => entry.month === 2);
    assert.equal(afterJanuarySummary?.totalAmount, 200);
    assert.equal(afterFebruarySummary?.totalAmount, 2200);

    const afterJanuaryDailyResponse = await fetch(
      `${baseUrl}/api/collection/daily/overview?year=2026&month=1&usernames=Collector%20Alpha,Collector%20Beta`,
    );
    assert.equal(afterJanuaryDailyResponse.status, 200);
    const afterJanuaryDailyPayload = await afterJanuaryDailyResponse.json();
    assert.equal(afterJanuaryDailyPayload.summary.collectedAmount, 200);

    const afterFebruaryDailyResponse = await fetch(
      `${baseUrl}/api/collection/daily/overview?year=2026&month=2&usernames=Collector%20Alpha,Collector%20Beta`,
    );
    assert.equal(afterFebruaryDailyResponse.status, 200);
    const afterFebruaryDailyPayload = await afterFebruaryDailyResponse.json();
    assert.equal(afterFebruaryDailyPayload.summary.collectedAmount, 2200);

    const afterJanuaryNicknameResponse = await fetch(
      `${baseUrl}/api/collection/nickname-summary?from=2026-01-01&to=2026-01-31&nicknames=Collector%20Alpha,Collector%20Beta&summaryOnly=1`,
    );
    assert.equal(afterJanuaryNicknameResponse.status, 200);
    const afterJanuaryNicknamePayload = await afterJanuaryNicknameResponse.json();
    const afterJanuaryAlpha = afterJanuaryNicknamePayload.nicknameTotals.find((item: any) => item.nickname === "Collector Alpha");
    const afterJanuaryBeta = afterJanuaryNicknamePayload.nicknameTotals.find((item: any) => item.nickname === "Collector Beta");
    assert.equal(afterJanuaryNicknamePayload.totalAmount, 200);
    assert.equal(afterJanuaryAlpha?.totalAmount, 0);
    assert.equal(afterJanuaryBeta?.totalAmount, 200);

    const afterFebruaryNicknameResponse = await fetch(
      `${baseUrl}/api/collection/nickname-summary?from=2026-02-01&to=2026-02-28&nicknames=Collector%20Alpha,Collector%20Beta&summaryOnly=1`,
    );
    assert.equal(afterFebruaryNicknameResponse.status, 200);
    const afterFebruaryNicknamePayload = await afterFebruaryNicknameResponse.json();
    const afterFebruaryAlpha = afterFebruaryNicknamePayload.nicknameTotals.find((item: any) => item.nickname === "Collector Alpha");
    const afterFebruaryBeta = afterFebruaryNicknamePayload.nicknameTotals.find((item: any) => item.nickname === "Collector Beta");
    assert.equal(afterFebruaryNicknamePayload.totalAmount, 2200);
    assert.equal(afterFebruaryAlpha?.totalAmount, 700);
    assert.equal(afterFebruaryBeta?.totalAmount, 1500);
  } finally {
    await stopTestServer(server);
  }
});
