import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { removeBackupFromBackupsResponse } from "./backup-optimistic-updates";
import type { BackupsResponse } from "./types";

function createResponse(overrides: Partial<BackupsResponse> = {}): BackupsResponse {
  return {
    backups: [
      {
        id: "backup-a",
        name: "backup-a.json",
        createdAt: "2026-05-26T00:00:00.000Z",
        createdBy: "admin",
        metadata: null,
      },
      {
        id: "backup-b",
        name: "backup-b.json",
        createdAt: "2026-05-26T01:00:00.000Z",
        createdBy: "admin",
        metadata: null,
      },
    ],
    pagination: {
      page: 1,
      pageSize: 2,
      total: 2,
      totalPages: 1,
    },
    ...overrides,
  };
}

describe("backup optimistic updates", () => {
  it("removes the deleted backup and adjusts pagination totals", () => {
    const response = createResponse({
      pagination: { page: 3, pageSize: 1, total: 3, totalPages: 3 },
    });

    const updated = removeBackupFromBackupsResponse(response, "backup-a");

    assert.equal(updated?.backups.length, 1);
    assert.equal(updated?.backups[0]?.id, "backup-b");
    assert.equal(updated?.pagination.total, 2);
    assert.equal(updated?.pagination.totalPages, 2);
    assert.equal(updated?.pagination.page, 2);
  });

  it("does not mutate the original query response", () => {
    const response = createResponse();

    const updated = removeBackupFromBackupsResponse(response, "backup-a");

    assert.notEqual(updated, response);
    assert.equal(response.backups.length, 2);
    assert.equal(response.pagination.total, 2);
  });

  it("returns the original response when the backup is not present", () => {
    const response = createResponse();

    const updated = removeBackupFromBackupsResponse(response, "missing-backup");

    assert.equal(updated, response);
  });

  it("handles empty and undefined responses safely", () => {
    const emptyResponse = createResponse({
      backups: [],
      pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
    });

    assert.equal(removeBackupFromBackupsResponse(undefined, "backup-a"), undefined);
    assert.equal(removeBackupFromBackupsResponse(emptyResponse, "backup-a"), emptyResponse);
  });
});
