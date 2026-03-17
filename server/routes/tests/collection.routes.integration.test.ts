import assert from "node:assert/strict";
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

function createCoreCollectionStorageDouble() {
  const auditLogs: AuditEntry[] = [];
  const createCalls: Array<Record<string, unknown>> = [];
  const listCalls: Array<Record<string, unknown>> = [];
  const summaryCalls: Array<Record<string, unknown>> = [];
  const updateCalls: Array<{ id: string; data: Record<string, unknown> }> = [];
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
  };
  records.set(seedRecord.id, seedRecord);

  const storage = {
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
      return [seedRecord];
    },
    updateCollectionRecord: async (id: string, data: Record<string, unknown>) => {
      updateCalls.push({ id, data });
      const existing = records.get(id);
      if (!existing) {
        return null;
      }
      const updated: CollectionRecordShape = {
        ...existing,
        ...data,
        amount: data.amount !== undefined ? Number(data.amount).toFixed(2) : existing.amount,
      };
      records.set(id, updated);
      return updated;
    },
  } as unknown as PostgresStorage;

  return {
    storage,
    auditLogs,
    createCalls,
    listCalls,
    summaryCalls,
    updateCalls,
  };
}

function createCollectionSummaryStorageDouble() {
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
