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
  const recordsByUser = new Map<string, RecordShape[]>([
    [
      "alpha",
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
          createdByLogin: "alpha",
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
          createdByLogin: "alpha",
          collectionStaffNickname: "Collector Alpha",
          createdAt: new Date("2026-03-02T10:00:00.000Z"),
        },
      ],
    ],
    [
      "beta",
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
          createdByLogin: "beta",
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
          createdByLogin: "beta",
          collectionStaffNickname: "Collector Beta",
          createdAt: new Date("2026-03-02T11:00:00.000Z"),
        },
      ],
    ],
  ]);

  const storage = {
    listCollectionDailyUsers: async () => [
      { id: "user-alpha", username: "alpha", role: "user" },
      { id: "user-beta", username: "beta", role: "user" },
    ],
    getCollectionDailyTarget: async (params: { username: string }) => {
      if (params.username === "alpha") {
        return {
          id: "target-alpha",
          username: "alpha",
          year: 2026,
          month: 3,
          monthlyTarget: 4000,
          createdBy: "admin",
          updatedBy: "admin",
          createdAt: new Date("2026-03-01T00:00:00.000Z"),
          updatedAt: new Date("2026-03-01T00:00:00.000Z"),
        };
      }
      if (params.username === "beta") {
        return {
          id: "target-beta",
          username: "beta",
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
      createdByLogin?: string;
    }) => {
      const username = String(filters?.createdByLogin || "").toLowerCase();
      const userRecords = recordsByUser.get(username) || [];
      const from = String(filters?.from || "");
      const to = String(filters?.to || "");
      return userRecords.filter((record) => {
        if (from && record.paymentDate < from) return false;
        if (to && record.paymentDate > to) return false;
        return true;
      });
    },
  };

  return new CollectionRecordService(storage as any);
}

test("Collection daily overview supports multi-user aggregation", async () => {
  const service = createCollectionDailyService();
  const response = await service.getDailyOverview(
    { username: "admin.user", role: "admin", userId: "admin-1" } as any,
    { year: "2026", month: "3", usernames: "alpha,beta" },
  );

  assert.equal(response.ok, true);
  assert.deepEqual(response.usernames, ["alpha", "beta"]);
  assert.equal(response.summary.monthlyTarget, 6000);
  assert.equal(response.summary.collectedAmount, 5700);
  assert.equal(response.summary.balancedAmount, 300);
  assert.equal(response.summary.dailyTarget, 3000);

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
    { username: "admin.user", role: "admin", userId: "admin-1" } as any,
    { date: "2026-03-01", usernames: "alpha,beta", page: "1", pageSize: "1" },
  );

  assert.equal(pageOne.ok, true);
  assert.equal(pageOne.pagination.totalRecords, 2);
  assert.equal(pageOne.pagination.totalPages, 2);
  assert.equal(pageOne.records.length, 1);
  assert.equal(pageOne.records[0].id, "alpha-1");
  assert.equal(pageOne.records[0].receipts.length, 1);
  assert.equal(pageOne.records[0].receipts[0].originalFileName, "receipt-a1.pdf");

  const pageTwo = await service.getDailyDayDetails(
    { username: "admin.user", role: "admin", userId: "admin-1" } as any,
    { date: "2026-03-01", usernames: "alpha,beta", page: "2", pageSize: "1" },
  );
  assert.equal(pageTwo.records.length, 1);
  assert.equal(pageTwo.records[0].id, "beta-1");
  assert.equal(pageTwo.records[0].receipts.length, 0);
});

test("Collection daily user role cannot request other usernames", async () => {
  const service = createCollectionDailyService();

  await assert.rejects(
    service.getDailyOverview(
      { username: "alpha", role: "user", userId: "user-alpha" } as any,
      { year: "2026", month: "3", usernames: "alpha,beta" },
    ),
    /User hanya boleh melihat data sendiri/i,
  );
});
