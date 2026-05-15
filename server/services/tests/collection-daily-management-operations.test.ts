import assert from "node:assert/strict";
import test from "node:test";

import type { AuthenticatedUser } from "../../auth/guards";
import type {
  CollectionDailyCalendarDay,
  CollectionDailyTarget,
  CollectionStaffNickname,
} from "../../storage-postgres-collection-types";
import { CollectionDailyManagementOperations } from "../collection/collection-daily-management-operations";
import type { CollectionStoragePort } from "../collection/collection-service-support";

const adminUser: AuthenticatedUser = {
  username: "super.user",
  role: "superuser",
  activityId: "activity-1",
};

function createOperations(storage: Partial<CollectionStoragePort>) {
  return new CollectionDailyManagementOperations(
    storage as CollectionStoragePort,
    (user) => {
      if (!user) {
        throw new Error("Unauthenticated");
      }
      return user;
    },
  );
}

function buildNickname(): CollectionStaffNickname {
  return {
    id: "nickname-1",
    nickname: "Alice",
    isActive: true,
    roleScope: "user",
    createdBy: "super.user",
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
  };
}

function buildNicknameWithName(nickname: string): CollectionStaffNickname {
  return {
    ...buildNickname(),
    id: `nickname-${nickname.toLowerCase()}`,
    nickname,
  };
}

test("upsertDailyTarget accepts grouped MYR input and stores normalized numeric target", async () => {
  let capturedTarget: {
    username: string;
    year: number;
    month: number;
    monthlyTarget: number;
    actor: string;
  } | null = null;

  const operations = createOperations({
    async getCollectionStaffNicknames() {
      return [buildNickname()];
    },
    async upsertCollectionDailyTarget(params) {
      capturedTarget = {
        username: params.username,
        year: params.year,
        month: params.month,
        monthlyTarget: params.monthlyTarget,
        actor: params.actor,
      };
      const timestamp = new Date("2026-04-01T00:00:00.000Z");
      return {
        id: "target-1",
        username: params.username,
        year: params.year,
        month: params.month,
        monthlyTarget: params.monthlyTarget,
        createdBy: params.actor,
        updatedBy: params.actor,
        createdAt: timestamp,
        updatedAt: timestamp,
      } satisfies CollectionDailyTarget;
    },
  });

  const response = await operations.upsertDailyTarget(adminUser, {
    username: "Alice",
    year: "2026",
    month: "4",
    monthlyTarget: "1,200.50",
  });

  assert.deepEqual(capturedTarget, {
    username: "alice",
    year: 2026,
    month: 4,
    monthlyTarget: 1200.5,
    actor: "super.user",
  });
  assert.equal(response.target.monthlyTarget, 1200.5);
});

test("upsertDailyTarget rejects malformed MYR input instead of coercing it", async () => {
  const operations = createOperations({
    async getCollectionStaffNicknames() {
      return [buildNickname()];
    },
    async upsertCollectionDailyTarget() {
      throw new Error("should not be called");
    },
  });

  await assert.rejects(
    async () => operations.upsertDailyTarget(adminUser, {
      username: "Alice",
      year: "2026",
      month: "4",
      monthlyTarget: "12.345",
    }),
    /Monthly target must be a non-negative number\./,
  );
});

test("upsertDailyCalendar stores holiday leave type per selected nickname only", async () => {
  const captured: Array<{
    username: string;
    year: number;
    month: number;
    days: Array<{
      day: number;
      status?: string | undefined;
      leaveType?: string | null | undefined;
      note?: string | null | undefined;
    }>;
  }> = [];

  const operations = createOperations({
    async getCollectionStaffNicknames() {
      return [buildNicknameWithName("Ali"), buildNicknameWithName("Abu")];
    },
    async upsertCollectionDailyCalendarDays(params) {
      captured.push({
        username: params.username,
        year: params.year,
        month: params.month,
        days: params.days,
      });
      const day = params.days[0];
      const timestamp = new Date("2026-05-15T00:00:00.000Z");
      return [{
        id: `calendar-${params.username}-${day?.day ?? 0}`,
        username: params.username,
        date: `${params.year}-${String(params.month).padStart(2, "0")}-${String(day?.day ?? 1).padStart(2, "0")}`,
        year: params.year,
        month: params.month,
        day: day?.day ?? 1,
        status: day?.status ?? "WORKING",
        leaveType: day?.leaveType ?? null,
        note: day?.note ?? null,
        isWorkingDay: day?.isWorkingDay ?? true,
        isHoliday: day?.isHoliday ?? false,
        holidayName: day?.holidayName ?? null,
        createdBy: params.actor,
        updatedBy: params.actor,
        createdAt: timestamp,
        updatedAt: timestamp,
      } satisfies CollectionDailyCalendarDay];
    },
  });

  await operations.upsertDailyCalendar(adminUser, {
    username: "Ali",
    year: "2026",
    month: "5",
    days: [{
      day: "15",
      status: "HOLIDAY",
      leaveType: "AL",
      note: "Annual leave",
    }],
  });
  await operations.upsertDailyCalendar(adminUser, {
    username: "Abu",
    year: "2026",
    month: "5",
    days: [{
      day: "15",
      status: "HOLIDAY",
      leaveType: "MC",
      note: "Medical leave",
    }],
  });

  assert.deepEqual(captured.map((entry) => entry.username), ["ali", "abu"]);
  assert.equal(captured[0]?.days[0]?.leaveType, "AL");
  assert.equal(captured[0]?.days[0]?.note, "Annual leave");
  assert.equal(captured[1]?.days[0]?.leaveType, "MC");
  assert.equal(captured[1]?.days[0]?.note, "Medical leave");
});

test("upsertDailyCalendar requires superuser and holiday leave type", async () => {
  let called = false;
  const operations = createOperations({
    async getCollectionStaffNicknames() {
      return [buildNicknameWithName("Ali")];
    },
    async upsertCollectionDailyCalendarDays() {
      called = true;
      throw new Error("should not be called");
    },
  });

  await assert.rejects(
    async () => operations.upsertDailyCalendar({ ...adminUser, role: "admin" }, {
      username: "Ali",
      year: "2026",
      month: "5",
      days: [{ day: "15", status: "WORKING" }],
    }),
    /Update daily calendar hanya untuk superuser\./,
  );

  await assert.rejects(
    async () => operations.upsertDailyCalendar(adminUser, {
      username: "Ali",
      year: "2026",
      month: "5",
      days: [{ day: "15", status: "HOLIDAY" }],
    }),
    /Leave type is required when status is Holiday\/Leave\./,
  );

  assert.equal(called, false);
});

test("deleteDailyCalendar removes only the selected nickname date override", async () => {
  let captured: { username: string; year: number; month: number; day: number } | null = null;
  const operations = createOperations({
    async getCollectionStaffNicknames() {
      return [buildNicknameWithName("Ali"), buildNicknameWithName("Abu")];
    },
    async deleteCollectionDailyCalendarDay(params) {
      captured = params;
      return true;
    },
  });

  const response = await operations.deleteDailyCalendar(adminUser, {
    username: "Abu",
    year: "2026",
    month: "5",
    day: "15",
  });

  assert.deepEqual(captured, {
    username: "abu",
    year: 2026,
    month: 5,
    day: 15,
  });
  assert.deepEqual(response, { ok: true, deleted: true });
});
