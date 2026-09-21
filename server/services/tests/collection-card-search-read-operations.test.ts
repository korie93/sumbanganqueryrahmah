import assert from "node:assert/strict";
import test from "node:test";
import type { AuthenticatedUser } from "../../auth/guards";
import { CollectionRecordListReadOperations } from "../collection/collection-record-list-read-operations";
import type { CollectionStoragePort } from "../collection/collection-service-support";

const CARD = "00009007199254740993";
const TEAM_ID = "11111111-1111-4111-8111-111111111111";
const LEADER_ID = "22222222-2222-4222-8222-222222222222";
const ALPHA_ID = "33333333-3333-4333-8333-333333333333";
const BETA_ID = "44444444-4444-4444-8444-444444444444";
const LINKS = [{ sourceImportId: "source-a", sourceDataRowId: "source-row-a", sourceObligationKey: "account:a" }];

function auth(role: AuthenticatedUser["role"]): AuthenticatedUser {
  return { role, username: `${role}.test`, userId: `${role}-id`, activityId: `${role}-activity` };
}

function setup(options: { sessionNickname?: string; noAdminVisibility?: boolean; resolverError?: Error } = {}) {
  const resolutionCalls: Array<Record<string, unknown>> = [];
  const summaryCalls: Array<Record<string, unknown>> = [];
  const listCalls: Array<Record<string, unknown>> = [];
  const auditCalls: Array<Record<string, unknown>> = [];
  const storage = {
    getCollectionNicknameSessionByActivity: async (activityId: string) => {
      const role = activityId.split("-")[0];
      const nickname = role === "admin"
        ? options.noAdminVisibility ? undefined : "Leader"
        : options.sessionNickname;
      return nickname ? { username: `${role}.test`, userRole: role, nickname } : null;
    },
    getCollectionAdminGroupVisibleNicknameValuesByLeader: async () => ["Leader", "Collector Alpha"],
    getCollectionStaffNicknames: async () => [
      { id: LEADER_ID, nickname: "Leader", isActive: true, roleScope: "admin" },
      { id: ALPHA_ID, nickname: "Collector Alpha", isActive: true, roleScope: "user" },
      { id: BETA_ID, nickname: "Collector Beta", isActive: true, roleScope: "user" },
    ],
    getCollectionAdminGroups: async () => [{
      id: TEAM_ID,
      leaderNicknameId: LEADER_ID,
      leaderNickname: "Leader",
      leaderIsActive: true,
      memberNicknameIds: [ALPHA_ID, BETA_ID],
      memberNicknames: ["Collector Alpha", "Collector Beta"],
    }],
    resolveCollectionRecordCardSearchLinks: async (filters: Record<string, unknown>) => {
      resolutionCalls.push(structuredClone(filters));
      if (options.resolverError) throw options.resolverError;
      return LINKS;
    },
    summarizeCollectionRecords: async (filters: Record<string, unknown>) => {
      summaryCalls.push(filters);
      return { totalRecords: 41, totalAmount: 410 };
    },
    listCollectionRecords: async (filters: Record<string, unknown>) => {
      listCalls.push(filters);
      return [{ id: "authorized-record-41", cardNumber: CARD }];
    },
    createAuditLog: async (entry: Record<string, unknown>) => {
      auditCalls.push(entry);
      return { id: "audit", ...entry };
    },
  } as unknown as CollectionStoragePort;
  return {
    operations: new CollectionRecordListReadOperations(storage),
    resolutionCalls,
    summaryCalls,
    listCalls,
    auditCalls,
  };
}

function query() {
  return {
    search: `  ${CARD}  `,
    from: "2026-09-01",
    to: "2026-09-30",
    sourceImportId: "source-a",
    aging: "D4",
    classification: "cp",
    receiptValidationStatus: "flagged",
    duplicateOnly: "1",
    sortBy: "paymentDate",
    sortDirection: "asc",
    page: "3",
    pageSize: "20",
    cardSearchSourceLinks: [{ sourceImportId: "attacker-source", sourceDataRowId: "attacker-row", sourceObligationKey: "attacker-key" }],
    createdByLogin: "another.user",
  };
}

function assertSharedSearchScope(state: ReturnType<typeof setup>) {
  assert.equal(state.resolutionCalls.length, 1);
  const resolved = state.resolutionCalls[0];
  assert.equal(resolved.search, CARD);
  assert.equal(resolved.from, "2026-09-01");
  assert.equal(resolved.to, "2026-09-30");
  assert.deepEqual(resolved.sourceImportIds, ["source-a"]);
  assert.deepEqual(resolved.agingBuckets, ["D4"]);
  assert.deepEqual(resolved.classifications, ["cp"]);
  assert.equal(resolved.receiptValidationStatus, "flagged");
  assert.equal(resolved.duplicateOnly, true);
  assert.equal(resolved.sortBy, "paymentDate");
  assert.equal(resolved.sortDirection, "asc");
  assert.equal(resolved.limit, undefined);
  assert.equal(resolved.offset, undefined);
  assert.equal(resolved.cardSearchSourceLinks, undefined);
  assert.equal(state.summaryCalls.length, 1);
  assert.equal(state.listCalls.length, 1);
  assert.deepEqual(state.summaryCalls[0], { ...resolved, cardSearchSourceLinks: LINKS });
  assert.deepEqual(state.listCalls[0], { ...state.summaryCalls[0], limit: 20, offset: 40 });
  assert.equal(state.summaryCalls[0].cardSearchSourceLinks, state.listCalls[0].cardSearchSourceLinks);
  assert.equal(state.auditCalls.length, 1);
  assert.doesNotMatch(String(state.auditCalls[0].details), new RegExp(CARD));
}

for (const role of ["superuser", "manager"] as const) {
  test(`Collection Card search resolves once after ${role} filters and ignores client-supplied internal links`, async () => {
    const state = setup();
    const result = await state.operations.listRecords(auth(role), query());
    assertSharedSearchScope(state);
    assert.equal(state.resolutionCalls[0].createdByLogin, undefined);
    assert.equal(state.resolutionCalls[0].nicknames, undefined);
    assert.equal(result.total, 41);
    assert.equal(result.pagination.total, 41);
    assert.equal(result.records[0]?.cardNumber, CARD);
    assert.equal(result.page, 3);
  });
}

test("Collection Card search preserves user ownership despite requested other staff", async () => {
  const state = setup();
  await state.operations.listRecords(auth("user"), { ...query(), nickname: "Collector Beta" });
  assertSharedSearchScope(state);
  assert.equal(state.resolutionCalls[0].createdByLogin, "user.test");
  assert.equal(state.resolutionCalls[0].nicknames, undefined);
});

test("Collection Card search preserves the active user nickname scope", async () => {
  const state = setup({ sessionNickname: "Collector Alpha" });
  await state.operations.listRecords(auth("user"), { ...query(), nickname: "Collector Beta" });
  assertSharedSearchScope(state);
  assert.equal(state.resolutionCalls[0].createdByLogin, undefined);
  assert.deepEqual(state.resolutionCalls[0].nicknames, ["Collector Alpha"]);
});

test("Collection Card search resolves only after admin visibility is narrowed", async () => {
  const state = setup();
  await state.operations.listRecords(auth("admin"), query());
  assertSharedSearchScope(state);
  assert.deepEqual(state.resolutionCalls[0].nicknames, ["Leader", "Collector Alpha"]);
});

test("Collection Card search with no admin visibility never resolves candidates", async () => {
  const state = setup({ noAdminVisibility: true });
  const result = await state.operations.listRecords(auth("admin"), query());
  assert.equal(result.total, 0);
  assert.deepEqual(result.records, []);
  assert.deepEqual(state.resolutionCalls, []);
  assert.deepEqual(state.summaryCalls, []);
  assert.deepEqual(state.listCalls, []);
});

test("Collection Card search resolves after team and staff intersection", async () => {
  const state = setup();
  await state.operations.listRecords(auth("manager"), {
    ...query(), leaderId: TEAM_ID, nickname: "Collector Alpha",
  });
  assertSharedSearchScope(state);
  assert.deepEqual(state.resolutionCalls[0].nicknames, ["Collector Alpha"]);
  assert.deepEqual(state.resolutionCalls[0].staffNicknameIds, [ALPHA_ID]);
});

test("Collection Card search rejects disallowed admin and user team scopes before resolving", async () => {
  for (const role of ["user", "admin"] as const) {
    const state = setup();
    await assert.rejects(state.operations.listRecords(auth(role), { ...query(), leaderId: TEAM_ID }),
      /Team Leader scope is available only/);
    assert.deepEqual(state.resolutionCalls, []);
  }
  const state = setup();
  await assert.rejects(state.operations.listRecords(auth("admin"), { ...query(), nickname: "Collector Beta" }),
    /Invalid nickname filter/);
  assert.deepEqual(state.resolutionCalls, []);
});

test("Collection empty search avoids source resolution and ignores client-supplied source links", async () => {
  const state = setup();
  await state.operations.listRecords(auth("superuser"), { ...query(), search: "   " });
  assert.deepEqual(state.resolutionCalls, []);
  assert.equal(state.summaryCalls[0].search, undefined);
  assert.equal(state.summaryCalls[0].cardSearchSourceLinks, undefined);
  assert.equal(state.listCalls[0].cardSearchSourceLinks, undefined);
});

test("Collection candidate resolution failure stops both reads instead of widening results", async () => {
  const state = setup({ resolverError: new Error("Synthetic candidate failure") });
  await assert.rejects(state.operations.listRecords(auth("superuser"), query()), /Synthetic candidate failure/);
  assert.equal(state.resolutionCalls.length, 1);
  assert.deepEqual(state.summaryCalls, []);
  assert.deepEqual(state.listCalls, []);
});
