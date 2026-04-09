import assert from "node:assert/strict";
import test from "node:test";

import type { AuthenticatedUser } from "../../auth/guards";
import type {
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
