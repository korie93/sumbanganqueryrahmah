import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPaginatedResponse,
  buildPaginationMetadata,
  clampOffsetPaginationToTotal,
  parseOffsetPaginationQuery,
  toDbOffset,
} from "./pagination";

test("parseOffsetPaginationQuery accepts pageSize aliases and clamps limits", () => {
  const parsed = parseOffsetPaginationQuery(
    { page: "3", pageSize: "250" },
    { defaultLimit: 5, maxLimit: 100 },
  );

  assert.deepEqual(parsed, {
    page: 3,
    limit: 100,
    pageSize: 100,
  });
});

test("parseOffsetPaginationQuery falls back for invalid query values", () => {
  const parsed = parseOffsetPaginationQuery(
    { page: "nope", limit: "also-nope" },
    { defaultLimit: 15, maxLimit: 50 },
  );

  assert.deepEqual(parsed, {
    page: 1,
    limit: 15,
    pageSize: 15,
  });
});

test("offset helpers clamp page to the available total", () => {
  const pagination = clampOffsetPaginationToTotal(
    parseOffsetPaginationQuery({ page: "9", limit: "10" }),
    25,
  );
  const metadata = buildPaginationMetadata(25, pagination);

  assert.deepEqual(toDbOffset(pagination), { offset: 20, limit: 10 });
  assert.deepEqual(metadata, {
    page: 3,
    pageSize: 10,
    limit: 10,
    total: 25,
    totalPages: 3,
    hasNext: false,
    hasPrev: true,
  });
});

test("buildPaginatedResponse uses the canonical response envelope", () => {
  const response = buildPaginatedResponse(["row-a"], 1, {
    page: 1,
    limit: 20,
  });

  assert.deepEqual(response, {
    data: ["row-a"],
    pagination: {
      page: 1,
      pageSize: 20,
      limit: 20,
      total: 1,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    },
  });
});
