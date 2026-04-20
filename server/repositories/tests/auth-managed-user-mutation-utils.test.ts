import assert from "node:assert/strict";
import test from "node:test";
import {
  accountActivationTokens,
  backupJobs,
  backups,
  collectionRecords,
  passwordResetRequests,
  users,
} from "../../../shared/schema-postgres";
import { db } from "../../db-postgres";
import {
  buildManagedUserDeletedAccountUpdate,
  deleteManagedUserAccount,
} from "../auth-managed-user-mutation-utils";

class MockDeleteBuilder {
  private whereCalled = false;

  constructor(
    private readonly table: object,
    private readonly calls: object[],
  ) {}

  where() {
    this.whereCalled = true;
    return this;
  }

  returning() {
    this.calls.push({
      kind: "delete",
      table: this.table,
      whereCalled: this.whereCalled,
    });
    return Promise.resolve(this.table === users ? [{ id: "managed-1" }] : []);
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    this.calls.push({
      kind: "delete",
      table: this.table,
      whereCalled: this.whereCalled,
    });
    return Promise.resolve(undefined).then(onfulfilled, onrejected);
  }
}

class MockUpdateBuilder {
  private values: Record<string, unknown> = {};

  constructor(
    private readonly table: object,
    private readonly calls: Array<{ table: object; values: Record<string, unknown> }>,
  ) {}

  set(values: Record<string, unknown>) {
    this.values = values;
    return this;
  }

  where() {
    return this;
  }

  returning() {
    this.calls.push({
      table: this.table,
      values: this.values,
    });
    return Promise.resolve([{ id: "managed-1" }]);
  }
}

function createMockTransaction(results: Map<object, unknown[]>) {
  const deleteCalls: object[] = [];
  const updateCalls: Array<{ table: object; values: Record<string, unknown> }> = [];

  const tx = {
    select() {
      return {
        from(table: object) {
          return {
            where() {
              return {
                limit() {
                  return Promise.resolve(results.get(table) ?? []);
                },
              };
            },
          };
        },
      };
    },
    update(table: object) {
      return new MockUpdateBuilder(table, updateCalls);
    },
    delete(table: object) {
      return new MockDeleteBuilder(table, deleteCalls);
    },
  };

  return {
    deleteCalls,
    tx,
    updateCalls,
  };
}

test("deleteManagedUserAccount hard-deletes manageable accounts that have no protected dependencies", async (t) => {
  const { tx, deleteCalls, updateCalls } = createMockTransaction(new Map<object, unknown[]>([
    [users, [{ id: "managed-1", username: "alpha.user" }]],
    [collectionRecords, []],
    [backups, []],
    [backupJobs, []],
  ]));

  t.mock.method(db, "transaction", (async (operation) => operation(tx as never)) as typeof db.transaction);

  const deleted = await deleteManagedUserAccount("managed-1");

  assert.equal(deleted, true);
  assert.equal(updateCalls.length, 0);
  assert.deepEqual(deleteCalls, [
    { kind: "delete", table: accountActivationTokens, whereCalled: true },
    { kind: "delete", table: passwordResetRequests, whereCalled: true },
    { kind: "delete", table: users, whereCalled: true },
  ]);
});

test("deleteManagedUserAccount tombstones manageable accounts that still own protected operational records", async (t) => {
  const { tx, deleteCalls, updateCalls } = createMockTransaction(new Map<object, unknown[]>([
    [users, [{ id: "managed-1", username: "alpha.user" }]],
    [collectionRecords, [{ id: "record-1" }]],
    [backups, []],
    [backupJobs, []],
  ]));

  t.mock.method(db, "transaction", (async (operation) => operation(tx as never)) as typeof db.transaction);

  const deleted = await deleteManagedUserAccount("managed-1");

  assert.equal(deleted, true);
  assert.deepEqual(deleteCalls, [
    { kind: "delete", table: accountActivationTokens, whereCalled: true },
    { kind: "delete", table: passwordResetRequests, whereCalled: true },
  ]);
  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0]?.table, users);
  assert.equal(updateCalls[0]?.values.status, "disabled");
  assert.equal(updateCalls[0]?.values.lockedReason, "account_deleted");
  assert.equal(updateCalls[0]?.values.lockedBySystem, true);
  assert.equal(updateCalls[0]?.values.email, null);
  assert.equal(updateCalls[0]?.values.fullName, null);

  const expectedShape = buildManagedUserDeletedAccountUpdate(new Date("2026-04-20T00:00:00.000Z"));
  assert.equal(typeof expectedShape.updatedAt?.toISOString, "function");
});
