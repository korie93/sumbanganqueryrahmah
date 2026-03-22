import assert from "node:assert/strict";
import test from "node:test";
import { CollectionRecordService } from "../collection/collection-record.service";

type Receipt = {
  id: string;
  originalFileName: string;
  originalMimeType: string;
  fileSize: number;
  createdAt: Date;
};

type RecordShape = {
  id: string;
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
  batch: "P10" | "P25" | "MDD02" | "MDD10" | "MDD18" | "MDD25";
  paymentDate: string;
  amount: string;
  receiptFile: string | null;
  receipts: Receipt[];
  createdByLogin: string;
  collectionStaffNickname: string;
  createdAt: Date;
};

function buildCalendarMonth(year: number, month: number, workingDays: number[]) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const workingSet = new Set(workingDays);
  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const isWorkingDay = workingSet.has(day);
    return {
      id: `cal-${day}`,
      year,
      month,
      day,
      isWorkingDay,
      isHoliday: !isWorkingDay,
      holidayName: isWorkingDay ? null : "OFF",
      createdBy: "admin",
      updatedBy: "admin",
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
      updatedAt: new Date("2026-03-01T00:00:00.000Z"),
    };
  });
}

function createCollectionDailyService() {
  const recordsByNickname = new Map<string, RecordShape[]>([
    [
      "collector alpha",
      [
        {
          id: "alpha-1",
          customerName: "Alpha Customer 1",
          icNumber: "900101010001",
          customerPhone: "0121111111",
          accountNumber: "ACC-A1",
          batch: "P10",
          paymentDate: "2026-03-01",
          amount: "1000",
          receiptFile: "/uploads/receipt-a1.pdf",
          receipts: [
            {
              id: "receipt-alpha-1",
              originalFileName: "receipt-a1.pdf",
              originalMimeType: "application/pdf",
              fileSize: 1024,
              createdAt: new Date("2026-03-01T10:00:00.000Z"),
            },
          ],
          createdByLogin: "alpha.user",
          collectionStaffNickname: "Collector Alpha",
          createdAt: new Date("2026-03-01T10:00:00.000Z"),
        },
        {
          id: "alpha-2",
          customerName: "Alpha Customer 2",
          icNumber: "900101010002",
          customerPhone: "0122222222",
          accountNumber: "ACC-A2",
          batch: "P10",
          paymentDate: "2026-03-02",
          amount: "3000",
          receiptFile: null,
          receipts: [],
          createdByLogin: "alpha.user",
          collectionStaffNickname: "Collector Alpha",
          createdAt: new Date("2026-03-02T10:00:00.000Z"),
        },
      ],
    ],
    [
      "collector beta",
      [
        {
          id: "beta-1",
          customerName: "Beta Customer 1",
          icNumber: "900101020001",
          customerPhone: "0131111111",
          accountNumber: "ACC-B1",
          batch: "P25",
          paymentDate: "2026-03-01",
          amount: "200",
          receiptFile: null,
          receipts: [],
          createdByLogin: "diviya.user",
          collectionStaffNickname: "Collector Beta",
          createdAt: new Date("2026-03-01T11:00:00.000Z"),
        },
        {
          id: "beta-2",
          customerName: "Beta Customer 2",
          icNumber: "900101020002",
          customerPhone: "0132222222",
          accountNumber: "ACC-B2",
          batch: "P25",
          paymentDate: "2026-03-02",
          amount: "1500",
          receiptFile: null,
          receipts: [],
          createdByLogin: "beta.user",
          collectionStaffNickname: "Collector Beta",
          createdAt: new Date("2026-03-02T11:00:00.000Z"),
        },
      ],
    ],
  ]);

  const nicknameProfiles = [
    {
      id: "nickname-alpha",
      nickname: "Collector Alpha",
      isActive: true,
      roleScope: "user",
      createdBy: "superuser",
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
    },
    {
      id: "nickname-beta",
      nickname: "Collector Beta",
      isActive: true,
      roleScope: "user",
      createdBy: "superuser",
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
    },
  ];

  const storage = {
    getCollectionStaffNicknames: async () => nicknameProfiles,
    getCollectionStaffNicknameByName: async (nickname: string) =>
      nicknameProfiles.find((item) => item.nickname.toLowerCase() === String(nickname).toLowerCase()) || null,
    getCollectionNicknameSessionByActivity: async (activityId: string) => {
      if (activityId !== "activity-user-alpha") {
        return null;
      }
      return {
        activityId,
        username: "alpha.user",
        userRole: "user",
        nickname: "Collector Alpha",
        verifiedAt: new Date("2026-03-01T00:00:00.000Z"),
        updatedAt: new Date("2026-03-01T00:00:00.000Z"),
      };
    },
    getCollectionDailyTarget: async (params: { username: string }) => {
      const normalized = String(params.username || "").toLowerCase();
      if (normalized === "collector alpha") {
        return {
          id: "target-alpha",
          username: "collector alpha",
          year: 2026,
          month: 3,
          monthlyTarget: 4000,
          createdBy: "admin",
          updatedBy: "admin",
          createdAt: new Date("2026-03-01T00:00:00.000Z"),
          updatedAt: new Date("2026-03-01T00:00:00.000Z"),
        };
      }
      if (normalized === "collector beta") {
        return {
          id: "target-beta",
          username: "collector beta",
          year: 2026,
          month: 3,
          monthlyTarget: 2000,
          createdBy: "admin",
          updatedBy: "admin",
          createdAt: new Date("2026-03-01T00:00:00.000Z"),
          updatedAt: new Date("2026-03-01T00:00:00.000Z"),
        };
      }
      return undefined;
    },
    listCollectionDailyCalendar: async (params: { year: number; month: number }) =>
      buildCalendarMonth(params.year, params.month, [1, 2]),
    listCollectionRecords: async (filters?: {
      from?: string;
      to?: string;
      nicknames?: string[];
    }) => {
      const nickname = String(filters?.nicknames?.[0] || "").toLowerCase();
      const records = recordsByNickname.get(nickname) || [];
      const from = String(filters?.from || "");
      const to = String(filters?.to || "");
      return records.filter((record) => {
        if (from && record.paymentDate < from) return false;
        if (to && record.paymentDate > to) return false;
        return true;
      });
    },
  };

  return new CollectionRecordService(storage as any);
}

function createMutableCollectionDailyService() {
  const records = new Map<string, RecordShape>();
  records.set("move-1", {
    id: "move-1",
    customerName: "Moved Customer",
    icNumber: "900101030001",
    customerPhone: "0141111111",
    accountNumber: "ACC-M1",
    batch: "P10",
    paymentDate: "2026-03-02",
    amount: "1000.00",
    receiptFile: null,
    receipts: [],
    createdByLogin: "diviya.user",
    collectionStaffNickname: "Collector Alpha",
    createdAt: new Date("2026-03-02T09:00:00.000Z"),
  });
  records.set("beta-stable-1", {
    id: "beta-stable-1",
    customerName: "Stable Beta",
    icNumber: "900101030002",
    customerPhone: "0142222222",
    accountNumber: "ACC-B9",
    batch: "P25",
    paymentDate: "2026-03-02",
    amount: "200.00",
    receiptFile: null,
    receipts: [],
    createdByLogin: "beta.user",
    collectionStaffNickname: "Collector Beta",
    createdAt: new Date("2026-03-02T11:00:00.000Z"),
  });

  const nicknameProfiles = [
    {
      id: "nickname-alpha",
      nickname: "Collector Alpha",
      isActive: true,
      roleScope: "user",
      createdBy: "superuser",
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
    },
    {
      id: "nickname-beta",
      nickname: "Collector Beta",
      isActive: true,
      roleScope: "user",
      createdBy: "superuser",
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
    },
  ];

  const storage = {
    getCollectionStaffNicknames: async () => nicknameProfiles,
    getCollectionStaffNicknameByName: async (nickname: string) =>
      nicknameProfiles.find((item) => item.nickname.toLowerCase() === String(nickname).toLowerCase()) || null,
    getCollectionDailyTarget: async (params: { username: string; year: number; month: number }) => {
      const normalized = String(params.username || "").toLowerCase();
      if (params.year !== 2026 || params.month !== 3) {
        return undefined;
      }
      if (normalized !== "collector alpha" && normalized !== "collector beta") {
        return undefined;
      }
      return {
        id: `target-${normalized.replace(/\s+/g, "-")}`,
        username: normalized,
        year: 2026,
        month: 3,
        monthlyTarget: 5000,
        createdBy: "superuser",
        updatedBy: "superuser",
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        updatedAt: new Date("2026-03-01T00:00:00.000Z"),
      };
    },
    listCollectionDailyCalendar: async (params: { year: number; month: number }) =>
      buildCalendarMonth(params.year, params.month, [1, 2, 3, 4, 5]),
    listCollectionRecords: async (filters?: { from?: string; to?: string; nicknames?: string[] }) => {
      const from = String(filters?.from || "");
      const to = String(filters?.to || "");
      const nicknameSet = new Set(
        (Array.isArray(filters?.nicknames) ? filters.nicknames : [])
          .map((value) => String(value || "").toLowerCase()),
      );
      return Array.from(records.values()).filter((record) => {
        const paymentDate = String(record.paymentDate || "");
        if (from && paymentDate < from) return false;
        if (to && paymentDate > to) return false;
        if (nicknameSet.size > 0 && !nicknameSet.has(record.collectionStaffNickname.toLowerCase())) {
          return false;
        }
        return true;
      });
    },
    getCollectionRecordById: async (id: string) => records.get(id) || null,
    updateCollectionRecord: async (id: string, data: Record<string, unknown>) => {
      const existing = records.get(id);
      if (!existing) {
        return null;
      }
      const updated: RecordShape = {
        ...existing,
        customerName:
          data.customerName !== undefined ? String(data.customerName) : existing.customerName,
        icNumber: data.icNumber !== undefined ? String(data.icNumber) : existing.icNumber,
        customerPhone:
          data.customerPhone !== undefined ? String(data.customerPhone) : existing.customerPhone,
        accountNumber:
          data.accountNumber !== undefined ? String(data.accountNumber) : existing.accountNumber,
        batch: data.batch !== undefined ? (String(data.batch) as RecordShape["batch"]) : existing.batch,
        paymentDate:
          data.paymentDate !== undefined ? String(data.paymentDate) : existing.paymentDate,
        amount:
          data.amount !== undefined ? Number(data.amount || 0).toFixed(2) : existing.amount,
        receiptFile:
          Object.prototype.hasOwnProperty.call(data, "receiptFile")
            ? (data.receiptFile as string | null)
            : existing.receiptFile,
        createdByLogin:
          data.createdByLogin !== undefined ? String(data.createdByLogin) : existing.createdByLogin,
        collectionStaffNickname:
          data.collectionStaffNickname !== undefined
            ? String(data.collectionStaffNickname)
            : existing.collectionStaffNickname,
      };
      records.set(id, updated);
      return updated;
    },
    createAuditLog: async () => ({ id: "audit-1" }),
  };

  return new CollectionRecordService(storage as any);
}

function createLegacyReceiptCleanupService() {
  const records = new Map<string, RecordShape>();
  records.set("legacy-1", {
    id: "legacy-1",
    customerName: "Legacy Receipt Customer",
    icNumber: "900101040001",
    customerPhone: "0151111111",
    accountNumber: "ACC-L1",
    batch: "P10",
    paymentDate: "2026-03-02",
    amount: "800.00",
    receiptFile: "/uploads/collection-receipts/legacy-only.pdf",
    receipts: [],
    createdByLogin: "legacy.user",
    collectionStaffNickname: "Collector Alpha",
    createdAt: new Date("2026-03-02T09:00:00.000Z"),
  });

  const updateCalls: Array<Record<string, unknown>> = [];

  const storage = {
    getCollectionRecordById: async (id: string) => records.get(id) || null,
    deleteAllCollectionRecordReceipts: async () => [],
    deleteCollectionRecordReceipts: async () => [],
    createCollectionRecordReceipts: async () => [],
    updateCollectionRecord: async (id: string, data: Record<string, unknown>) => {
      updateCalls.push({ ...data });
      const existing = records.get(id);
      if (!existing) return null;
      const updated: RecordShape = {
        ...existing,
        receiptFile: Object.prototype.hasOwnProperty.call(data, "receiptFile")
          ? (data.receiptFile as string | null)
          : existing.receiptFile,
      };
      records.set(id, updated);
      return updated;
    },
    createAuditLog: async () => ({ id: "audit-legacy-1" }),
  };

  return {
    service: new CollectionRecordService(storage as any),
    records,
    updateCalls,
  };
}

test("Collection daily overview supports multi-staff aggregation", async () => {
  const service = createCollectionDailyService();
  const response = await service.getDailyOverview(
    { username: "superuser", role: "superuser", userId: "superuser-1" } as any,
    { year: "2026", month: "3", usernames: "Collector Alpha,Collector Beta" },
  );

  assert.equal(response.ok, true);
  assert.deepEqual(response.usernames, ["Collector Alpha", "Collector Beta"]);
  assert.equal(response.summary.monthlyTarget, 6000);
  assert.equal(response.summary.collectedAmount, 5700);
  assert.equal(response.summary.balancedAmount, 300);
  assert.equal(response.summary.dailyTarget, 3000);
  assert.equal(response.summary.expectedProgressAmount, 6000);
  assert.equal(response.summary.progressVarianceAmount, -300);

  const dayOne = response.days.find((day) => day.date === "2026-03-01");
  const dayTwo = response.days.find((day) => day.date === "2026-03-02");
  assert.ok(dayOne);
  assert.ok(dayTwo);
  assert.equal(dayOne.target, 3000);
  assert.equal(dayOne.amount, 1200);
  assert.equal(dayOne.status, "yellow");
  assert.equal(dayTwo.target, 4800);
  assert.equal(dayTwo.amount, 4500);
  assert.equal(dayTwo.status, "yellow");
});

test("Collection daily day-details returns paginated records with receipt metadata", async () => {
  const service = createCollectionDailyService();
  const pageOne = await service.getDailyDayDetails(
    { username: "superuser", role: "superuser", userId: "superuser-1" } as any,
    { date: "2026-03-01", usernames: "Collector Alpha,Collector Beta", page: "1", pageSize: "1" },
  );

  assert.equal(pageOne.ok, true);
  assert.equal(pageOne.pagination.totalRecords, 2);
  assert.equal(pageOne.pagination.totalPages, 2);
  assert.equal(pageOne.records.length, 1);
  assert.equal(pageOne.records[0].id, "alpha-1");
  assert.equal(pageOne.records[0].receipts.length, 1);
  assert.equal(pageOne.records[0].receipts[0].originalFileName, "receipt-a1.pdf");
  assert.equal(pageOne.message, "Collection recorded but daily target not achieved.");

  const pageTwo = await service.getDailyDayDetails(
    { username: "superuser", role: "superuser", userId: "superuser-1" } as any,
    { date: "2026-03-01", usernames: "Collector Alpha,Collector Beta", page: "2", pageSize: "1" },
  );
  assert.equal(pageTwo.records.length, 1);
  assert.equal(pageTwo.records[0].id, "beta-1");
  assert.equal(pageTwo.records[0].username, "diviya.user");
  assert.equal(pageTwo.records[0].receipts.length, 0);
});

test("Collection daily user role cannot request other staff nicknames", async () => {
  const service = createCollectionDailyService();

  await assert.rejects(
    service.getDailyOverview(
      { username: "alpha.user", role: "user", userId: "user-alpha", activityId: "activity-user-alpha" } as any,
      { year: "2026", month: "3", usernames: "Collector Alpha,Collector Beta" },
    ),
    /User hanya boleh melihat data sendiri/i,
  );
});

test("Collection daily overview recalculates immediately after record ownership/date/amount edits", async () => {
  const service = createMutableCollectionDailyService();
  const authUser = { username: "superuser", role: "superuser", userId: "superuser-1" } as any;

  const before = await service.getDailyOverview(authUser, {
    year: "2026",
    month: "3",
    usernames: "Collector Alpha,Collector Beta",
  });
  assert.equal(before.summary.collectedAmount, 1200);
  assert.equal(before.days.find((day) => day.date === "2026-03-02")?.amount, 1200);

  await service.updateRecord(authUser, "move-1", {
    collectionStaffNickname: "Collector Beta",
    paymentDate: "2026-03-03",
    amount: "1500",
  });

  const alphaAfter = await service.getDailyOverview(authUser, {
    year: "2026",
    month: "3",
    usernames: "Collector Alpha",
  });
  const betaAfter = await service.getDailyOverview(authUser, {
    year: "2026",
    month: "3",
    usernames: "Collector Beta",
  });
  const combinedAfter = await service.getDailyOverview(authUser, {
    year: "2026",
    month: "3",
    usernames: "Collector Alpha,Collector Beta",
  });

  assert.equal(alphaAfter.summary.collectedAmount, 0);
  assert.equal(alphaAfter.summary.remainingTarget, 5000);
  assert.equal(betaAfter.summary.collectedAmount, 1700);
  assert.equal(betaAfter.summary.remainingTarget, 3300);
  assert.equal(combinedAfter.summary.collectedAmount, 1700);
  assert.equal(combinedAfter.days.find((day) => day.date === "2026-03-02")?.amount, 200);
  assert.equal(combinedAfter.days.find((day) => day.date === "2026-03-03")?.amount, 1500);
});

test("Collection daily overview moves totals across month boundaries after payment-date edits", async () => {
  const service = createMutableCollectionDailyService();
  const authUser = { username: "superuser", role: "superuser", userId: "superuser-1" } as any;

  const marchBefore = await service.getDailyOverview(authUser, {
    year: "2026",
    month: "3",
    usernames: "Collector Alpha,Collector Beta",
  });
  assert.equal(marchBefore.summary.collectedAmount, 1200);

  await service.updateRecord(authUser, "move-1", {
    paymentDate: "2026-02-28",
  });

  const marchAfter = await service.getDailyOverview(authUser, {
    year: "2026",
    month: "3",
    usernames: "Collector Alpha,Collector Beta",
  });
  const februaryAfter = await service.getDailyOverview(authUser, {
    year: "2026",
    month: "2",
    usernames: "Collector Alpha,Collector Beta",
  });

  assert.equal(marchAfter.summary.collectedAmount, 200);
  assert.equal(februaryAfter.summary.collectedAmount, 1000);
  assert.equal(marchAfter.days.find((day) => day.date === "2026-03-02")?.amount, 200);
  assert.equal(februaryAfter.days.find((day) => day.date === "2026-02-28")?.amount, 1000);
});

test("Collection record update clears legacy receipt_file when removeReceipt is requested on legacy-only rows", async () => {
  const { service, records, updateCalls } = createLegacyReceiptCleanupService();
  const authUser = { username: "superuser", role: "superuser", userId: "superuser-1" } as any;

  const response = await service.updateRecord(authUser, "legacy-1", {
    removeReceipt: true,
  });

  assert.equal(response.ok, true);
  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].receiptFile, null);
  assert.equal(records.get("legacy-1")?.receiptFile, null);
});
