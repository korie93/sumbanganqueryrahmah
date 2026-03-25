import assert from "node:assert/strict";
import test from "node:test";
import { CollectionRecordService } from "../collection/collection-record.service";

type Receipt = {
  id: string;
  storagePath: string;
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
              storagePath: "/uploads/receipt-a1.pdf",
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
      limit?: number;
      offset?: number;
    }) => {
      const nicknameSet = new Set(
        (Array.isArray(filters?.nicknames) ? filters.nicknames : [])
          .map((value) => String(value || "").toLowerCase()),
      );
      const from = String(filters?.from || "");
      const to = String(filters?.to || "");
      const matched = Array.from(recordsByNickname.entries())
        .filter(([nickname]) => nicknameSet.size === 0 || nicknameSet.has(nickname))
        .flatMap(([, records]) => records)
        .filter((record) => {
          if (from && record.paymentDate < from) return false;
          if (to && record.paymentDate > to) return false;
          return true;
        })
        .sort((left, right) => {
          const leftTime = left.createdAt instanceof Date ? left.createdAt.getTime() : new Date(left.createdAt).getTime();
          const rightTime = right.createdAt instanceof Date ? right.createdAt.getTime() : new Date(right.createdAt).getTime();
          if (leftTime !== rightTime) return leftTime - rightTime;
          return left.id.localeCompare(right.id);
        });
      const limit = Number.isFinite(Number(filters?.limit)) ? Number(filters?.limit) : matched.length;
      const offset = Number.isFinite(Number(filters?.offset)) ? Number(filters?.offset) : 0;
      return matched.slice(offset, offset + limit);
    },
  };

  return new CollectionRecordService(storage as any);
}

function createAggregateOptimizedCollectionDailyService() {
  const nicknameProfiles = [
    {
      id: "nickname-gamma",
      nickname: "Collector Gamma",
      isActive: true,
      roleScope: "user",
      createdBy: "superuser",
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
    },
  ];

  let summaryCallCount = 0;
  let listCallCount = 0;

  const storage = {
    getCollectionStaffNicknames: async () => nicknameProfiles,
    getCollectionStaffNicknameByName: async (nickname: string) =>
      nicknameProfiles.find((item) => item.nickname.toLowerCase() === String(nickname).toLowerCase()) || null,
    getCollectionDailyTarget: async () => ({
      id: "target-gamma",
      username: "collector gamma",
      year: 2026,
      month: 3,
      monthlyTarget: 1000,
      createdBy: "admin",
      updatedBy: "admin",
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
      updatedAt: new Date("2026-03-01T00:00:00.000Z"),
    }),
    listCollectionDailyCalendar: async (params: { year: number; month: number }) =>
      buildCalendarMonth(params.year, params.month, [1, 2]),
    summarizeCollectionRecordsByNicknameAndPaymentDate: async () => {
      summaryCallCount += 1;
      return [
        {
          nickname: "Collector Gamma",
          paymentDate: "2026-03-01",
          totalRecords: 2,
          totalAmount: 750,
        },
      ];
    },
    listCollectionRecords: async () => {
      listCallCount += 1;
      return [];
    },
  };

  return {
    service: new CollectionRecordService(storage as any),
    getSummaryCallCount: () => summaryCallCount,
    getListCallCount: () => listCallCount,
  };
}

function createBatchedAggregateCollectionDailyService() {
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

  const summaryCalls: Array<{ from?: string; to?: string; nicknames?: string[] }> = [];
  let listCallCount = 0;

  const storage = {
    getCollectionStaffNicknames: async () => nicknameProfiles,
    getCollectionStaffNicknameByName: async (nickname: string) =>
      nicknameProfiles.find((item) => item.nickname.toLowerCase() === String(nickname).toLowerCase()) || null,
    getCollectionDailyTarget: async (params: { username: string }) => ({
      id: `target-${String(params.username).toLowerCase().replace(/\s+/g, "-")}`,
      username: String(params.username).toLowerCase(),
      year: 2026,
      month: 3,
      monthlyTarget: 1000,
      createdBy: "admin",
      updatedBy: "admin",
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
      updatedAt: new Date("2026-03-01T00:00:00.000Z"),
    }),
    listCollectionDailyCalendar: async (params: { year: number; month: number }) =>
      buildCalendarMonth(params.year, params.month, [1, 2]),
    summarizeCollectionRecordsByNicknameAndPaymentDate: async (filters?: {
      from?: string;
      to?: string;
      nicknames?: string[];
    }) => {
      summaryCalls.push({
        from: filters?.from,
        to: filters?.to,
        nicknames: Array.isArray(filters?.nicknames) ? [...filters.nicknames] : [],
      });
      return [
        {
          nickname: "Collector Alpha",
          paymentDate: "2026-03-01",
          totalRecords: 1,
          totalAmount: 300,
        },
        {
          nickname: "Collector Beta",
          paymentDate: "2026-03-02",
          totalRecords: 2,
          totalAmount: 900,
        },
      ];
    },
    listCollectionRecords: async () => {
      listCallCount += 1;
      return [];
    },
  };

  return {
    service: new CollectionRecordService(storage as any),
    getSummaryCalls: () => summaryCalls,
    getListCallCount: () => listCallCount,
  };
}

function createPaginatedDayDetailsCollectionDailyService() {
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

  const listCalls: Array<{
    from?: string;
    to?: string;
    nicknames?: string[];
    limit?: number;
    offset?: number;
  }> = [];

  const records: RecordShape[] = [
    {
      id: "alpha-day-1",
      customerName: "Alpha Day Customer",
      icNumber: "900101060001",
      customerPhone: "0171111111",
      accountNumber: "ACC-DA1",
      batch: "P10",
      paymentDate: "2026-03-01",
      amount: "200.00",
      receiptFile: null,
      receipts: [],
      createdByLogin: "alpha.user",
      collectionStaffNickname: "Collector Alpha",
      createdAt: new Date("2026-03-01T09:00:00.000Z"),
    },
    {
      id: "beta-day-1",
      customerName: "Beta Day Customer",
      icNumber: "900101060002",
      customerPhone: "0172222222",
      accountNumber: "ACC-DB1",
      batch: "P25",
      paymentDate: "2026-03-01",
      amount: "300.00",
      receiptFile: null,
      receipts: [],
      createdByLogin: "beta.user",
      collectionStaffNickname: "Collector Beta",
      createdAt: new Date("2026-03-01T10:00:00.000Z"),
    },
  ];

  const storage = {
    getCollectionStaffNicknames: async () => nicknameProfiles,
    getCollectionStaffNicknameByName: async (nickname: string) =>
      nicknameProfiles.find((item) => item.nickname.toLowerCase() === String(nickname).toLowerCase()) || null,
    getCollectionDailyTarget: async (params: { username: string }) => ({
      id: `target-${String(params.username).toLowerCase().replace(/\s+/g, "-")}`,
      username: String(params.username).toLowerCase(),
      year: 2026,
      month: 3,
      monthlyTarget: 1000,
      createdBy: "admin",
      updatedBy: "admin",
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
      updatedAt: new Date("2026-03-01T00:00:00.000Z"),
    }),
    listCollectionDailyCalendar: async (params: { year: number; month: number }) =>
      buildCalendarMonth(params.year, params.month, [1, 2]),
    summarizeCollectionRecordsByNicknameAndPaymentDate: async () => [
      {
        nickname: "Collector Alpha",
        paymentDate: "2026-03-01",
        totalRecords: 1,
        totalAmount: 200,
      },
      {
        nickname: "Collector Beta",
        paymentDate: "2026-03-01",
        totalRecords: 1,
        totalAmount: 300,
      },
    ],
    listCollectionRecords: async (filters?: {
      from?: string;
      to?: string;
      nicknames?: string[];
      limit?: number;
      offset?: number;
    }) => {
      listCalls.push({
        from: filters?.from,
        to: filters?.to,
        nicknames: Array.isArray(filters?.nicknames) ? [...filters.nicknames] : [],
        limit: filters?.limit,
        offset: filters?.offset,
      });

      const allowedNicknames = new Set(
        (Array.isArray(filters?.nicknames) ? filters.nicknames : [])
          .map((value) => String(value || "").toLowerCase()),
      );
      const matched = records.filter((record) =>
        record.paymentDate === filters?.from
        && record.paymentDate === filters?.to
        && (allowedNicknames.size === 0 || allowedNicknames.has(record.collectionStaffNickname.toLowerCase())),
      );
      const limit = Number.isFinite(Number(filters?.limit)) ? Number(filters?.limit) : matched.length;
      const offset = Number.isFinite(Number(filters?.offset)) ? Number(filters?.offset) : 0;
      return matched.slice(offset, offset + limit);
    },
  };

  return {
    service: new CollectionRecordService(storage as any),
    getListCalls: () => listCalls,
  };
}

function createFallbackPagedDailyOverviewService() {
  const nicknameProfiles = [
    {
      id: "nickname-fallback",
      nickname: "Collector Fallback",
      isActive: true,
      roleScope: "user",
      createdBy: "superuser",
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
    },
  ];

  const records: RecordShape[] = Array.from({ length: 1005 }, (_, index) => ({
    id: `fallback-${index + 1}`,
    customerName: `Fallback Customer ${index + 1}`,
    icNumber: `90010108${String(index + 1).padStart(4, "0")}`,
    customerPhone: `019${String(index + 1).padStart(7, "0")}`,
    accountNumber: `ACC-FB-${index + 1}`,
    batch: "P10",
    paymentDate: "2026-03-01",
    amount: "1.00",
    receiptFile: null,
    receipts: [],
    createdByLogin: "fallback.user",
    collectionStaffNickname: "Collector Fallback",
    createdAt: new Date(`2026-03-01T${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}:00.000Z`),
  }));
  const listCalls: Array<{
    from?: string;
    to?: string;
    nicknames?: string[];
    limit?: number;
    offset?: number;
  }> = [];

  const storage = {
    getCollectionStaffNicknames: async () => nicknameProfiles,
    getCollectionStaffNicknameByName: async (nickname: string) =>
      nicknameProfiles.find((item) => item.nickname.toLowerCase() === String(nickname).toLowerCase()) || null,
    getCollectionDailyTarget: async () => ({
      id: "target-fallback",
      username: "collector fallback",
      year: 2026,
      month: 3,
      monthlyTarget: 2000,
      createdBy: "admin",
      updatedBy: "admin",
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
      updatedAt: new Date("2026-03-01T00:00:00.000Z"),
    }),
    listCollectionDailyCalendar: async (params: { year: number; month: number }) =>
      buildCalendarMonth(params.year, params.month, [1, 2]),
    listCollectionRecords: async (filters?: {
      from?: string;
      to?: string;
      nicknames?: string[];
      limit?: number;
      offset?: number;
    }) => {
      listCalls.push({
        from: filters?.from,
        to: filters?.to,
        nicknames: Array.isArray(filters?.nicknames) ? [...filters?.nicknames] : [],
        limit: filters?.limit,
        offset: filters?.offset,
      });
      const allowedNicknames = new Set(
        (Array.isArray(filters?.nicknames) ? filters.nicknames : [])
          .map((value) => String(value || "").toLowerCase()),
      );
      const matched = records.filter((record) =>
        (!filters?.from || record.paymentDate >= filters.from)
        && (!filters?.to || record.paymentDate <= filters.to)
        && (allowedNicknames.size === 0 || allowedNicknames.has(record.collectionStaffNickname.toLowerCase())),
      );
      const limit = Number.isFinite(Number(filters?.limit)) ? Number(filters?.limit) : matched.length;
      const offset = Number.isFinite(Number(filters?.offset)) ? Number(filters?.offset) : 0;
      return matched.slice(offset, offset + limit);
    },
  };

  return {
    service: new CollectionRecordService(storage as any),
    getListCalls: () => listCalls,
  };
}

function createNicknameSummaryPaginationService() {
  const listCalls: Array<{
    from?: string;
    to?: string;
    nicknames?: string[];
    limit?: number;
    offset?: number;
  }> = [];
  const records: RecordShape[] = Array.from({ length: 300 }, (_, index) => ({
    id: `nickname-summary-${index + 1}`,
    customerName: `Summary Customer ${index + 1}`,
    icNumber: `90010107${String(index + 1).padStart(4, "0")}`,
    customerPhone: `018${String(index + 1).padStart(7, "0")}`,
    accountNumber: `ACC-NS-${index + 1}`,
    batch: "P10",
    paymentDate: "2026-03-01",
    amount: "10.00",
    receiptFile: null,
    receipts: [],
    createdByLogin: "alpha.user",
    collectionStaffNickname: "Collector Alpha",
    createdAt: new Date(`2026-03-01T${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}:00.000Z`),
  }));

  const storage = {
    isCollectionStaffNicknameActive: async (nickname: string) => String(nickname).toLowerCase() === "collector alpha",
    summarizeCollectionRecordsByNickname: async () => [
      {
        nickname: "Collector Alpha",
        totalRecords: 300,
        totalAmount: 3000,
      },
    ],
    listCollectionRecords: async (filters?: {
      from?: string;
      to?: string;
      nicknames?: string[];
      limit?: number;
      offset?: number;
    }) => {
      listCalls.push({
        from: filters?.from,
        to: filters?.to,
        nicknames: Array.isArray(filters?.nicknames) ? [...filters.nicknames] : [],
        limit: filters?.limit,
        offset: filters?.offset,
      });
      const limit = Number.isFinite(Number(filters?.limit)) ? Number(filters?.limit) : records.length;
      const offset = Number.isFinite(Number(filters?.offset)) ? Number(filters?.offset) : 0;
      return records.slice(offset, offset + limit);
    },
  };

  return {
    service: new CollectionRecordService(storage as any),
    getListCalls: () => listCalls,
  };
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
    deleteCollectionRecord: async (id: string) => records.delete(id),
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

function createMutableCollectionSummaryService() {
  const records = new Map<string, RecordShape>();
  records.set("alpha-march-1", {
    id: "alpha-march-1",
    customerName: "Alpha March Customer",
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
  });
  records.set("beta-march-1", {
    id: "beta-march-1",
    customerName: "Beta March Customer",
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
  });
  records.set("alpha-april-1", {
    id: "alpha-april-1",
    customerName: "Alpha April Customer",
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
      const byDate = String(left.paymentDate).localeCompare(String(right.paymentDate));
      if (byDate !== 0) return byDate;
      return left.id.localeCompare(right.id);
    });

    return rows;
  };

  const storage = {
    getCollectionStaffNicknames: async () => nicknameProfiles,
    getCollectionStaffNicknameByName: async (nickname: string) =>
      nicknameProfiles.find((item) => item.nickname.toLowerCase() === String(nickname).toLowerCase()) || null,
    isCollectionStaffNicknameActive: async (nickname: string) =>
      nicknameProfiles.some((item) => item.nickname.toLowerCase() === String(nickname).toLowerCase() && item.isActive),
    getCollectionMonthlySummary: async (filters: {
      year: number;
      nicknames?: string[];
      createdByLogin?: string;
    }) => {
      const nicknameSet = normalizeNicknameSet(filters.nicknames);
      const createdByLogin = String(filters.createdByLogin || "").toLowerCase();
      const rows = Array.from(records.values()).filter((record) => {
        const paymentYear = Number.parseInt(String(record.paymentDate).slice(0, 4), 10);
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
        const month = Number.parseInt(String(row.paymentDate).slice(5, 7), 10);
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
    }) => {
      const rows = filterRecords(filters);
      return {
        totalRecords: rows.length,
        totalAmount: Math.round(
          (rows.reduce((sum, row) => sum + Number(row.amount || 0), 0) + Number.EPSILON) * 100,
        ) / 100,
      };
    },
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
      const limit = Number.isFinite(Number(filters?.limit))
        ? Math.max(1, Number(filters?.limit))
        : rows.length;
      const offset = Number.isFinite(Number(filters?.offset))
        ? Math.max(0, Number(filters?.offset))
        : 0;
      return rows.slice(offset, offset + limit);
    },
    getCollectionRecordById: async (id: string) => records.get(id) || null,
    updateCollectionRecord: async (id: string, data: Record<string, unknown>) => {
      const existing = records.get(id);
      if (!existing) {
        return null;
      }
      const updated: RecordShape = {
        ...existing,
        paymentDate:
          data.paymentDate !== undefined ? String(data.paymentDate) : existing.paymentDate,
        amount:
          data.amount !== undefined ? Number(data.amount || 0).toFixed(2) : existing.amount,
        collectionStaffNickname:
          data.collectionStaffNickname !== undefined
            ? String(data.collectionStaffNickname)
            : existing.collectionStaffNickname,
        customerName:
          data.customerName !== undefined ? String(data.customerName) : existing.customerName,
        icNumber: data.icNumber !== undefined ? String(data.icNumber) : existing.icNumber,
        customerPhone:
          data.customerPhone !== undefined ? String(data.customerPhone) : existing.customerPhone,
        accountNumber:
          data.accountNumber !== undefined ? String(data.accountNumber) : existing.accountNumber,
        batch:
          data.batch !== undefined ? (String(data.batch) as RecordShape["batch"]) : existing.batch,
      };
      records.set(id, updated);
      return updated;
    },
    deleteCollectionRecord: async (id: string) => records.delete(id),
    createAuditLog: async () => ({ id: "audit-summary-1" }),
  };

  return {
    service: new CollectionRecordService(storage as any),
    records,
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
  assert.equal(pageOne.records[0].receipts[0].storagePath, "/uploads/receipt-a1.pdf");
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

test("Collection daily overview prefers aggregate summaries over full record loading when available", async () => {
  const { service, getListCallCount, getSummaryCallCount } = createAggregateOptimizedCollectionDailyService();

  const response = await service.getDailyOverview(
    { username: "superuser", role: "superuser", userId: "superuser-1" } as any,
    { year: "2026", month: "3", usernames: "Collector Gamma" },
  );

  assert.equal(response.ok, true);
  assert.equal(getSummaryCallCount(), 1);
  assert.equal(getListCallCount(), 0);
  assert.equal(response.summary.collectedAmount, 750);
  assert.equal(response.days.find((day) => day.date === "2026-03-01")?.amount, 750);
  assert.equal(response.days.find((day) => day.date === "2026-03-01")?.customerCount, 2);
});

test("Collection daily overview batches aggregate summary loading across multiple selected staff", async () => {
  const { service, getSummaryCalls, getListCallCount } = createBatchedAggregateCollectionDailyService();

  const response = await service.getDailyOverview(
    { username: "superuser", role: "superuser", userId: "superuser-1" } as any,
    { year: "2026", month: "3", usernames: "Collector Alpha,Collector Beta" },
  );

  assert.equal(response.ok, true);
  assert.equal(getListCallCount(), 0);
  assert.equal(getSummaryCalls().length, 1);
  assert.deepEqual(getSummaryCalls()[0], {
    from: "2026-03-01",
    to: "2026-03-31",
    nicknames: ["Collector Alpha", "Collector Beta"],
  });
  assert.equal(response.summary.collectedAmount, 1200);
  assert.equal(response.days.find((day) => day.date === "2026-03-01")?.amount, 300);
  assert.equal(response.days.find((day) => day.date === "2026-03-02")?.amount, 900);
});

test("Collection daily day-details paginates with a single combined record query", async () => {
  const { service, getListCalls } = createPaginatedDayDetailsCollectionDailyService();

  const response = await service.getDailyDayDetails(
    { username: "superuser", role: "superuser", userId: "superuser-1" } as any,
    { date: "2026-03-01", usernames: "Collector Alpha,Collector Beta", page: "2", pageSize: "1" },
  );

  assert.equal(response.ok, true);
  assert.equal(getListCalls().length, 1);
  assert.deepEqual(getListCalls()[0], {
    from: "2026-03-01",
    to: "2026-03-01",
    nicknames: ["Collector Alpha", "Collector Beta"],
    limit: 1,
    offset: 1,
  });
  assert.equal(response.pagination.totalRecords, 2);
  assert.equal(response.pagination.totalPages, 2);
  assert.equal(response.records.length, 1);
  assert.equal(response.records[0].id, "beta-day-1");
});

test("Collection daily overview fallback paginates record loading when aggregate summaries are unavailable", async () => {
  const { service, getListCalls } = createFallbackPagedDailyOverviewService();

  const response = await service.getDailyOverview(
    { username: "superuser", role: "superuser", userId: "superuser-1" } as any,
    { year: "2026", month: "3", usernames: "Collector Fallback" },
  );

  assert.equal(response.ok, true);
  assert.equal(getListCalls().length, 2);
  assert.deepEqual(getListCalls()[0], {
    from: "2026-03-01",
    to: "2026-03-31",
    nicknames: ["Collector Fallback"],
    limit: 1000,
    offset: 0,
  });
  assert.deepEqual(getListCalls()[1], {
    from: "2026-03-01",
    to: "2026-03-31",
    nicknames: ["Collector Fallback"],
    limit: 1000,
    offset: 1000,
  });
  assert.equal(response.summary.collectedAmount, 1005);
  assert.equal(response.days.find((day) => day.date === "2026-03-01")?.amount, 1005);
  assert.equal(response.days.find((day) => day.date === "2026-03-01")?.customerCount, 1005);
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

test("Collection daily overview recalculates correctly after record deletion", async () => {
  const service = createMutableCollectionDailyService();
  const authUser = { username: "superuser", role: "superuser", userId: "superuser-1" } as any;

  const before = await service.getDailyOverview(authUser, {
    year: "2026",
    month: "3",
    usernames: "Collector Alpha,Collector Beta",
  });
  assert.equal(before.summary.collectedAmount, 1200);
  assert.equal(before.days.find((day) => day.date === "2026-03-02")?.amount, 1200);

  await service.deleteRecord(authUser, "move-1");

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
  assert.equal(betaAfter.summary.collectedAmount, 200);
  assert.equal(betaAfter.summary.remainingTarget, 4800);
  assert.equal(combinedAfter.summary.collectedAmount, 200);
  assert.equal(combinedAfter.days.find((day) => day.date === "2026-03-02")?.amount, 200);
});

test("Collection summary and nickname summary recalculate after reassignment/date/amount edits", async () => {
  const { service } = createMutableCollectionSummaryService();
  const authUser = { username: "superuser", role: "superuser", userId: "superuser-1" } as any;

  const beforeSummary = await service.getSummary(authUser, { year: "2026" } as any);
  const beforeJanuary = beforeSummary.summary.find((entry) => entry.month === 1);
  const beforeFebruary = beforeSummary.summary.find((entry) => entry.month === 2);
  assert.equal(beforeJanuary?.totalAmount, 1200);
  assert.equal(beforeFebruary?.totalAmount, 700);

  const beforeNicknameJanuary = await service.getNicknameSummary(authUser, {
    from: "2026-01-01",
    to: "2026-01-31",
    nicknames: "Collector Alpha,Collector Beta",
    summaryOnly: "true",
  } as any);
  const beforeAlphaJanuary = beforeNicknameJanuary.nicknameTotals.find((item) => item.nickname === "Collector Alpha");
  const beforeBetaJanuary = beforeNicknameJanuary.nicknameTotals.find((item) => item.nickname === "Collector Beta");
  assert.equal(beforeNicknameJanuary.totalAmount, 1200);
  assert.equal(beforeAlphaJanuary?.totalAmount, 1000);
  assert.equal(beforeBetaJanuary?.totalAmount, 200);

  await service.updateRecord(authUser, "alpha-march-1", {
    collectionStaffNickname: "Collector Beta",
    paymentDate: "2026-02-02",
    amount: "1500",
  });

  const afterSummary = await service.getSummary(authUser, { year: "2026" } as any);
  const afterJanuary = afterSummary.summary.find((entry) => entry.month === 1);
  const afterFebruary = afterSummary.summary.find((entry) => entry.month === 2);
  assert.equal(afterJanuary?.totalAmount, 200);
  assert.equal(afterFebruary?.totalAmount, 2200);

  const afterNicknameJanuary = await service.getNicknameSummary(authUser, {
    from: "2026-01-01",
    to: "2026-01-31",
    nicknames: "Collector Alpha,Collector Beta",
    summaryOnly: "true",
  } as any);
  const afterAlphaJanuary = afterNicknameJanuary.nicknameTotals.find((item) => item.nickname === "Collector Alpha");
  const afterBetaJanuary = afterNicknameJanuary.nicknameTotals.find((item) => item.nickname === "Collector Beta");
  assert.equal(afterNicknameJanuary.totalAmount, 200);
  assert.equal(afterAlphaJanuary?.totalAmount, 0);
  assert.equal(afterBetaJanuary?.totalAmount, 200);

  const afterNicknameFebruary = await service.getNicknameSummary(authUser, {
    from: "2026-02-01",
    to: "2026-02-28",
    nicknames: "Collector Alpha,Collector Beta",
    summaryOnly: "true",
  } as any);
  const afterAlphaFebruary = afterNicknameFebruary.nicknameTotals.find((item) => item.nickname === "Collector Alpha");
  const afterBetaFebruary = afterNicknameFebruary.nicknameTotals.find((item) => item.nickname === "Collector Beta");
  assert.equal(afterNicknameFebruary.totalAmount, 2200);
  assert.equal(afterAlphaFebruary?.totalAmount, 700);
  assert.equal(afterBetaFebruary?.totalAmount, 1500);
});

test("Collection summary and nickname summary recalculate correctly after record deletion", async () => {
  const { service } = createMutableCollectionSummaryService();
  const authUser = { username: "superuser", role: "superuser", userId: "superuser-1" } as any;

  const beforeSummary = await service.getSummary(authUser, { year: "2026" } as any);
  const beforeJanuary = beforeSummary.summary.find((entry) => entry.month === 1);
  assert.equal(beforeJanuary?.totalAmount, 1200);

  const beforeNicknameJanuary = await service.getNicknameSummary(authUser, {
    from: "2026-01-01",
    to: "2026-01-31",
    nicknames: "Collector Alpha,Collector Beta",
    summaryOnly: "true",
  } as any);
  const beforeAlphaJanuary = beforeNicknameJanuary.nicknameTotals.find((item) => item.nickname === "Collector Alpha");
  const beforeBetaJanuary = beforeNicknameJanuary.nicknameTotals.find((item) => item.nickname === "Collector Beta");
  assert.equal(beforeNicknameJanuary.totalAmount, 1200);
  assert.equal(beforeAlphaJanuary?.totalAmount, 1000);
  assert.equal(beforeBetaJanuary?.totalAmount, 200);

  await service.deleteRecord(authUser, "beta-march-1");

  const afterSummary = await service.getSummary(authUser, { year: "2026" } as any);
  const afterJanuary = afterSummary.summary.find((entry) => entry.month === 1);
  assert.equal(afterJanuary?.totalAmount, 1000);

  const afterNicknameJanuary = await service.getNicknameSummary(authUser, {
    from: "2026-01-01",
    to: "2026-01-31",
    nicknames: "Collector Alpha,Collector Beta",
    summaryOnly: "true",
  } as any);
  const afterAlphaJanuary = afterNicknameJanuary.nicknameTotals.find((item) => item.nickname === "Collector Alpha");
  const afterBetaJanuary = afterNicknameJanuary.nicknameTotals.find((item) => item.nickname === "Collector Beta");
  assert.equal(afterNicknameJanuary.totalAmount, 1000);
  assert.equal(afterAlphaJanuary?.totalAmount, 1000);
  assert.equal(afterBetaJanuary?.totalAmount, 0);
});

test("Collection list pagination keeps month totals stable and month-scoped", async () => {
  const { service } = createMutableCollectionSummaryService();
  const authUser = { username: "superuser", role: "superuser", userId: "superuser-1" } as any;

  const pageOne = await service.listRecords(authUser, {
    from: "2026-01-01",
    to: "2026-01-31",
    limit: "1",
    offset: "0",
  } as any);
  const pageTwo = await service.listRecords(authUser, {
    from: "2026-01-01",
    to: "2026-01-31",
    limit: "1",
    offset: "1",
  } as any);

  assert.equal(pageOne.total, 2);
  assert.equal(pageOne.totalAmount, 1200);
  assert.equal(pageOne.records.length, 1);
  assert.equal(pageTwo.total, 2);
  assert.equal(pageTwo.totalAmount, 1200);
  assert.equal(pageTwo.records.length, 1);
  assert.notEqual(pageOne.records[0].id, pageTwo.records[0].id);
});

test("Nickname summary detail rows clamp pagination to a safer record cap", async () => {
  const { service, getListCalls } = createNicknameSummaryPaginationService();
  const authUser = { username: "superuser", role: "superuser", userId: "superuser-1" } as any;

  const response = await service.getNicknameSummary(authUser, {
    from: "2026-03-01",
    to: "2026-03-31",
    nicknames: "Collector Alpha",
    limit: "9999",
    offset: "25",
  } as any);

  assert.equal(response.ok, true);
  assert.equal(response.totalRecords, 300);
  assert.equal(response.totalAmount, 3000);
  assert.equal(getListCalls().length, 1);
  assert.deepEqual(getListCalls()[0], {
    from: "2026-03-01",
    to: "2026-03-31",
    nicknames: ["Collector Alpha"],
    limit: 250,
    offset: 25,
  });
  assert.equal(response.records.length, 250);
  assert.equal(response.records[0].id, "nickname-summary-26");
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
