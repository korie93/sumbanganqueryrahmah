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
