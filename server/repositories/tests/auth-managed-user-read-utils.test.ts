import assert from "node:assert/strict";
import test from "node:test";
import {
  collectOffsetChunkRows,
  collectPagedResults,
} from "../auth-managed-user-read-pagination-utils";
import {
  buildManagedUsersWhereSql,
  buildPendingPasswordResetWhereSql,
  readTotalRowCount,
} from "../auth-managed-user-read-query-utils";
import { collectBoundValues, collectSqlText } from "./sql-test-utils";

test("auth managed user read helpers build managed-user WHERE clauses consistently", () => {
  const query = buildManagedUsersWhereSql({
    search: " alice ",
    role: "admin",
    status: "locked",
  });
  const sqlText = collectSqlText(query).replace(/\s+/g, " ").trim();
  const boundValues = collectBoundValues(query);

  assert.match(sqlText, /role IN \('admin', 'user'\)/);
  assert.match(sqlText, /username ILIKE /);
  assert.match(sqlText, /role = /);
  assert.match(sqlText, /locked_at IS NOT NULL/);
  assert.match(sqlText, /COALESCE\(is_banned, false\) = false/);
  assert.ok(boundValues.includes("%alice%"));
  assert.ok(boundValues.includes("admin"));
});

test("auth managed user read helpers build pending-reset WHERE clauses consistently", () => {
  const query = buildPendingPasswordResetWhereSql({
    search: " bob ",
    status: "active",
  });
  const sqlText = collectSqlText(query).replace(/\s+/g, " ").trim();
  const boundValues = collectBoundValues(query);

  assert.match(sqlText, /r\.approved_by IS NULL/);
  assert.match(sqlText, /r\.used_at IS NULL/);
  assert.match(sqlText, /u\.username ILIKE /);
  assert.match(sqlText, /u\.status = /);
  assert.match(sqlText, /COALESCE\(u\.is_banned, false\) = false/);
  assert.ok(boundValues.includes("%bob%"));
  assert.ok(boundValues.includes("active"));
});

test("auth managed user pagination helpers stop after the final chunk or page", async () => {
  const chunkOffsets: number[] = [];
  const chunkRows = await collectOffsetChunkRows(
    async (offset) => {
      chunkOffsets.push(offset);
      if (offset === 0) return [{ id: 1 }, { id: 2 }];
      if (offset === 2) return [{ id: 3 }];
      return [];
    },
    2,
  );

  assert.deepEqual(chunkOffsets, [0, 2]);
  assert.deepEqual(chunkRows, [{ id: 1 }, { id: 2 }, { id: 3 }]);

  const visitedPages: number[] = [];
  const pageRows = await collectPagedResults(
    async (page) => {
      visitedPages.push(page);
      if (page === 1) {
        return { users: [{ id: "a" }, { id: "b" }], pageSize: 2, total: 3 };
      }
      return { users: [{ id: "c" }], pageSize: 2, total: 3 };
    },
    (result) => result.users,
  );

  assert.deepEqual(visitedPages, [1, 2]);
  assert.deepEqual(pageRows, [{ id: "a" }, { id: "b" }, { id: "c" }]);
});

test("auth managed user read helpers normalize total rows safely", () => {
  assert.equal(readTotalRowCount({ total: "15" }), 15);
  assert.equal(readTotalRowCount({ total: 4 }), 4);
  assert.equal(readTotalRowCount(undefined), 0);
});
