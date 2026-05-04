import assert from "node:assert/strict";
import test from "node:test";
import { buildHybridPaginationMeta, buildOffsetPaginationMeta } from "../pagination";

test("buildOffsetPaginationMeta emits the shared offset pagination contract", () => {
  assert.deepEqual(
    buildOffsetPaginationMeta({
      page: 2,
      limit: 25,
      total: 51,
    }),
    {
      mode: "offset",
      page: 2,
      pageSize: 25,
      limit: 25,
      offset: 25,
      total: 51,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    },
  );
});

test("buildHybridPaginationMeta keeps cursor and offset compatibility in one shape", () => {
  assert.deepEqual(
    buildHybridPaginationMeta({
      page: 3,
      pageSize: 50,
      total: 151,
      offset: 100,
      nextCursor: "cursor-4",
    }),
    {
      mode: "hybrid",
      page: 3,
      pageSize: 50,
      limit: 50,
      offset: 100,
      total: 151,
      totalPages: 4,
      nextCursor: "cursor-4",
      hasNextPage: true,
      hasPreviousPage: true,
    },
  );
});
