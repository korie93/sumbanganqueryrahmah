import assert from "node:assert/strict";
import test from "node:test";
import {
  createDailySummaryEntry,
  roundDailyOverviewMoney,
  type DailyResolvedUser,
} from "../collection/collection-daily-overview-shared";
import { getDailyTargetForOwner } from "../collection/collection-daily-target-operations";
import {
  parseRequestedDailyUsernames,
  resolveDailySelectedUsers,
} from "../collection/collection-daily-user-operations";
import type { CollectionStoragePort } from "../collection/collection-service-support";

test("daily overview helpers normalize money and summary map entries", () => {
  assert.equal(roundDailyOverviewMoney(1.005), 1.01);
  const entry = createDailySummaryEntry();
  assert.equal(entry.amountByDate.size, 0);
  assert.equal(entry.customerCountByDate.size, 0);
});

test("daily overview query parser merges username aliases and removes duplicates", () => {
  assert.deepEqual(
    parseRequestedDailyUsernames({
      usernames: ["Alice, Bob", "ALICE"],
      nickname: "charlie",
      staff: ["Bob", "Dana"],
    }),
    ["alice", "bob", "charlie", "dana"],
  );
});

test("daily overview selected user resolver keeps normal users scoped to their own nickname", () => {
  const users: DailyResolvedUser[] = [
    { id: "alice-id", username: "Alice", role: "user" },
    { id: "bob-id", username: "Bob", role: "user" },
  ];

  assert.deepEqual(
    resolveDailySelectedUsers(
      { username: "alice-login", role: "user" },
      [],
      users,
      "Alice",
    ),
    [users[0]],
  );

  assert.throws(
    () => resolveDailySelectedUsers(
      { username: "alice-login", role: "user" },
      ["bob"],
      users,
      "Alice",
    ),
    /User hanya boleh melihat data sendiri/,
  );
});

test("daily overview selected user resolver defaults admin to preferred or first visible user", () => {
  const users: DailyResolvedUser[] = [
    { id: "alice-id", username: "Alice", role: "user" },
    { id: "bob-id", username: "Bob", role: "user" },
  ];

  assert.deepEqual(
    resolveDailySelectedUsers(
      { username: "admin-login", role: "admin" },
      [],
      users,
      "Bob",
    ),
    [users[1]],
  );

  assert.deepEqual(
    resolveDailySelectedUsers(
      { username: "admin-login", role: "admin" },
      [],
      users,
      "missing",
    ),
    [users[0]],
  );

  assert.throws(
    () => resolveDailySelectedUsers(
      { username: "admin-login", role: "admin" },
      ["missing"],
      users,
    ),
    /Invalid staff nickname filter: missing/,
  );
});

test("daily overview target lookup falls back to login username when nickname target is missing", async () => {
  const calls: string[] = [];
  const storage = {
    async getCollectionDailyTarget(params: { username: string; year: number; month: number }) {
      calls.push(params.username);
      return params.username === "alice-login"
        ? { username: params.username, year: params.year, month: params.month, monthlyTarget: 5000 }
        : undefined;
    },
  } as unknown as CollectionStoragePort;

  const target = await getDailyTargetForOwner(storage, "Alice", 2026, 4, [
    "Alice",
    "alice-login",
    "alice-login",
  ]);

  assert.deepEqual(calls, ["Alice", "alice-login"]);
  assert.equal(target?.monthlyTarget, 5000);
});
