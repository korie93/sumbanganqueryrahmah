import assert from "node:assert/strict";
import test from "node:test";
import { registerCollectionRoutes } from "../collection.routes";
import type {
  CollectionAdminGroup,
  CollectionStaffNickname,
  PostgresStorage,
} from "../../storage-postgres";
import {
  allowAllTabs,
  createJsonTestApp,
  createTestAuthenticateToken,
  createTestRequireRole,
  startTestServer,
  stopTestServer,
} from "./http-test-utils";

const ACTIVE_TEAM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MISSING_TEAM_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BUKHARI_TEAM_ID = "33333333-3333-4333-8333-333333333333";
const HAIZAL_TEAM_ID = "44444444-4444-4444-8444-444444444444";
const INACTIVE_TEAM_ID = "55555555-5555-4555-8555-555555555555";
const ZERO_MEMBER_TEAM_ID = "66666666-6666-4666-8666-666666666666";
const NOW = new Date("2026-09-01T00:00:00.000Z");

function nickname(
  id: string,
  value: string,
  roleScope: CollectionStaffNickname["roleScope"],
  isActive = true,
): CollectionStaffNickname {
  return {
    id,
    nickname: value,
    isActive,
    roleScope,
    createdBy: "superuser",
    createdAt: NOW,
  };
}

function group(params: {
  id: string;
  leaderNickname: string;
  leaderNicknameId: string;
  memberNicknames: string[];
  memberNicknameIds: string[];
  leaderIsActive?: boolean;
}): CollectionAdminGroup {
  return {
    ...params,
    leaderIsActive: params.leaderIsActive ?? true,
    leaderRoleScope: "admin",
    createdBy: "superuser",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

type TeamTestRecord = {
  id: string;
  collectionStaffNickname: string;
  amount: number;
  accountNumber?: string;
  cardNumber?: string;
};

type TeamStorageOptions = {
  groups?: CollectionAdminGroup[];
  nicknames?: CollectionStaffNickname[];
  records?: TeamTestRecord[];
  dynamicRecords?: boolean;
  totalRecords?: number;
  totalAmount?: number;
};

function buildTeamStorage(options: TeamStorageOptions = {}) {
  const listCalls: Array<Record<string, unknown>> = [];
  const summaryCalls: Array<Record<string, unknown>> = [];
  let groupReadCount = 0;
  let nicknameReadCount = 0;
  let activeNicknameCheckCount = 0;
  const groups = options.groups ?? [group({
    id: ACTIVE_TEAM_ID,
    leaderNickname: "SW.LEADER_1",
    leaderNicknameId: "nickname-leader",
    memberNicknames: ["SW.ACTIVE_2", "SW.INACTIVE_3"],
    memberNicknameIds: ["nickname-active", "nickname-inactive"],
  })];
  const nicknames = options.nicknames ?? [
    nickname("nickname-leader", "SW.LEADER_1", "admin"),
    nickname("nickname-active", "SW.ACTIVE_2", "user"),
  ];
  const records = options.records ?? [];

  const getScopedRecords = (filters: Record<string, unknown>) => {
    const requestedNicknames = Array.isArray(filters.nicknames)
      ? new Set((filters.nicknames as unknown[]).map((value) => String(value).toLowerCase()))
      : null;
    return requestedNicknames
      ? records.filter((record) => requestedNicknames.has(record.collectionStaffNickname.toLowerCase()))
      : records;
  };

  const storage = {
    getCollectionAdminGroups: async () => {
      groupReadCount += 1;
      return groups;
    },
    getCollectionStaffNicknames: async () => {
      nicknameReadCount += 1;
      return nicknames;
    },
    isCollectionStaffNicknameActive: async (value: string) => {
      activeNicknameCheckCount += 1;
      return nicknames.some((entry) => (
        entry.isActive && entry.nickname.toLowerCase() === value.toLowerCase()
      ));
    },
    summarizeCollectionRecords: async (filters: Record<string, unknown>) => {
      summaryCalls.push(filters);
      if (options.dynamicRecords) {
        const scoped = getScopedRecords(filters);
        return {
          totalRecords: scoped.length,
          totalAmount: scoped.reduce((sum, record) => sum + record.amount, 0),
        };
      }
      return {
        totalRecords: options.totalRecords ?? 1,
        totalAmount: options.totalAmount ?? 25,
      };
    },
    listCollectionRecords: async (filters: Record<string, unknown>) => {
      listCalls.push(filters);
      if (!options.dynamicRecords) return records;
      const scoped = getScopedRecords(filters);
      const offset = Number(filters.offset) || 0;
      const limit = Number(filters.limit) || 1000;
      return scoped.slice(offset, offset + limit);
    },
    createAuditLog: async () => ({ id: "audit-team-read" }),
  } as unknown as PostgresStorage;

  return {
    storage,
    listCalls,
    summaryCalls,
    getTeamReadCount: () => groupReadCount + nicknameReadCount,
    getGroupReadCount: () => groupReadCount,
    getNicknameReadCount: () => nicknameReadCount,
    getActiveNicknameCheckCount: () => activeNicknameCheckCount,
  };
}

function registerTeamApp(role: "user" | "admin" | "manager" | "superuser", storage: PostgresStorage) {
  const app = createJsonTestApp();
  registerCollectionRoutes(app, {
    storage,
    authenticateToken: createTestAuthenticateToken({
      userId: `${role}-1`,
      username: `${role}.user`,
      role,
      activityId: `activity-${role}-team`,
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
  });
  return app;
}

function buildBukhariHaizalStorage() {
  const bukhariMembers = Array.from({ length: 7 }, (_, index) => `SW.BUKHARI_STAFF_${index + 1}`);
  const haizalMembers = Array.from({ length: 9 }, (_, index) => `SW.HAIZAL_STAFF_${index + 1}`);
  const bukhariMemberIds = bukhariMembers.map((_, index) => `bukhari-member-${index + 1}`);
  const haizalMemberIds = haizalMembers.map((_, index) => `haizal-member-${index + 1}`);
  const records: TeamTestRecord[] = [
    ...bukhariMembers.map((member, index) => ({
      id: `bukhari-record-${index + 1}`,
      collectionStaffNickname: member,
      amount: 100,
      accountNumber: `000000000000${String(index + 1).padStart(4, "0")}`,
      cardNumber: `437704400107${String(index + 1).padStart(4, "0")}`,
    })),
    ...haizalMembers.map((member, index) => ({
      id: `haizal-record-${index + 1}`,
      collectionStaffNickname: member,
      amount: 200,
      accountNumber: `100000000000${String(index + 1).padStart(4, "0")}`,
      cardNumber: `412345678901${String(index + 1).padStart(4, "0")}`,
    })),
  ];

  return {
    ...buildTeamStorage({
      groups: [
        group({
          id: BUKHARI_TEAM_ID,
          leaderNickname: "SW.BUKHARI_924",
          leaderNicknameId: "leader-bukhari",
          memberNicknames: bukhariMembers,
          memberNicknameIds: bukhariMemberIds,
        }),
        group({
          id: HAIZAL_TEAM_ID,
          leaderNickname: "SW.HAIZAL_1331",
          leaderNicknameId: "leader-haizal",
          memberNicknames: haizalMembers,
          memberNicknameIds: haizalMemberIds,
        }),
      ],
      nicknames: [
        nickname("leader-bukhari", "SW.BUKHARI_924", "admin"),
        nickname("leader-haizal", "SW.HAIZAL_1331", "admin"),
        ...bukhariMembers.map((member, index) => nickname(bukhariMemberIds[index]!, member, "user")),
        ...haizalMembers.map((member, index) => nickname(haizalMemberIds[index]!, member, "user")),
      ],
      records,
      dynamicRecords: true,
    }),
    bukhariMembers,
    haizalMembers,
  };
}

test("manager Team Leader scope composes active team members with other list filters", async () => {
  const {
    storage,
    listCalls,
    summaryCalls,
    getGroupReadCount,
    getNicknameReadCount,
    getActiveNicknameCheckCount,
  } = buildTeamStorage();
  const { server, baseUrl } = await startTestServer(registerTeamApp("manager", storage));

  try {
    const response = await fetch(
      `${baseUrl}/api/collection/list?leaderId=${ACTIVE_TEAM_ID}&from=2026-09-01&to=2026-09-30&nickname=SW.ACTIVE_2&sourceImportId=saved-source-1&aging=D4&classification=abort_cp&page=3&pageSize=25`,
    );
    assert.equal(response.status, 200);
    assert.equal(summaryCalls.length, 1);
    assert.equal(listCalls.length, 1);
    assert.deepEqual(summaryCalls[0]?.nicknames, ["SW.ACTIVE_2"]);
    assert.deepEqual(listCalls[0]?.nicknames, ["SW.ACTIVE_2"]);
    assert.deepEqual(summaryCalls[0]?.staffNicknameIds, ["nickname-active"]);
    assert.deepEqual(listCalls[0]?.staffNicknameIds, ["nickname-active"]);
    assert.equal(summaryCalls[0]?.from, "2026-09-01");
    assert.equal(summaryCalls[0]?.to, "2026-09-30");
    assert.deepEqual(summaryCalls[0]?.sourceImportIds, ["saved-source-1"]);
    assert.deepEqual(summaryCalls[0]?.agingBuckets, ["D4"]);
    assert.deepEqual(summaryCalls[0]?.classifications, ["abort_cp"]);
    assert.equal(listCalls[0]?.limit, 25);
    assert.equal(listCalls[0]?.offset, 50);
    const { limit: _limit, offset: _offset, ...listScope } = listCalls[0] ?? {};
    assert.deepEqual(listScope, summaryCalls[0]);
    assert.equal(getGroupReadCount(), 1);
    assert.equal(getNicknameReadCount(), 1);
    assert.equal(getActiveNicknameCheckCount(), 0);
  } finally {
    await stopTestServer(server);
  }
});

test("missing Team Leader id returns zero records and never falls back to global queries", async () => {
  const { storage, listCalls, summaryCalls } = buildTeamStorage();
  const { server, baseUrl } = await startTestServer(registerTeamApp("superuser", storage));

  try {
    const response = await fetch(`${baseUrl}/api/collection/list?leaderId=${MISSING_TEAM_ID}`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload.records, []);
    assert.equal(payload.total, 0);
    assert.equal(listCalls.length, 0);
    assert.equal(summaryCalls.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("Team Leader UUID matching is canonical and case-insensitive", async () => {
  const { storage, listCalls, summaryCalls } = buildTeamStorage();
  const { server, baseUrl } = await startTestServer(registerTeamApp("manager", storage));

  try {
    const response = await fetch(
      `${baseUrl}/api/collection/list?leaderId=${ACTIVE_TEAM_ID.toUpperCase()}`,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(listCalls[0]?.nicknames, ["SW.ACTIVE_2"]);
    assert.deepEqual(summaryCalls[0]?.nicknames, ["SW.ACTIVE_2"]);
    assert.deepEqual(listCalls[0]?.staffNicknameIds, ["nickname-active"]);
    assert.deepEqual(summaryCalls[0]?.staffNicknameIds, ["nickname-active"]);
  } finally {
    await stopTestServer(server);
  }
});

test("malformed, SQL-injection, and legacy text Team Leader selectors fail before data access", async () => {
  const {
    storage,
    getTeamReadCount,
    listCalls,
    summaryCalls,
  } = buildTeamStorage();
  const { server, baseUrl } = await startTestServer(registerTeamApp("superuser", storage));

  try {
    for (const query of [
      new URLSearchParams({ leaderId: "not-a-uuid" }),
      new URLSearchParams({ leaderId: `${ACTIVE_TEAM_ID}' OR TRUE --` }),
      new URLSearchParams({ teamLeader: "SW.LEADER_1" }),
      new URLSearchParams({ scope: "team" }),
    ]) {
      const response = await fetch(`${baseUrl}/api/collection/list?${query.toString()}`);
      assert.equal(response.status, 400);
    }
    assert.equal(getTeamReadCount(), 0);
    assert.equal(listCalls.length, 0);
    assert.equal(summaryCalls.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("inactive and zero-member teams return zero without global Collection fallback", async () => {
  const inactiveLeaderId = "inactive-leader-id";
  const zeroLeaderId = "zero-leader-id";
  const {
    storage,
    listCalls,
    summaryCalls,
    getGroupReadCount,
    getNicknameReadCount,
  } = buildTeamStorage({
    groups: [
      group({
        id: INACTIVE_TEAM_ID,
        leaderNickname: "SW.INACTIVE_LEADER",
        leaderNicknameId: inactiveLeaderId,
        leaderIsActive: false,
        memberNicknames: ["SW.INACTIVE_TEAM_MEMBER"],
        memberNicknameIds: ["inactive-team-member-id"],
      }),
      group({
        id: ZERO_MEMBER_TEAM_ID,
        leaderNickname: "SW.ZERO_LEADER",
        leaderNicknameId: zeroLeaderId,
        memberNicknames: [],
        memberNicknameIds: [],
      }),
    ],
    nicknames: [
      nickname(inactiveLeaderId, "SW.INACTIVE_LEADER", "admin", false),
      nickname("inactive-team-member-id", "SW.INACTIVE_TEAM_MEMBER", "user"),
      nickname(zeroLeaderId, "SW.ZERO_LEADER", "admin"),
    ],
  });
  const { server, baseUrl } = await startTestServer(registerTeamApp("manager", storage));

  try {
    for (const leaderId of [INACTIVE_TEAM_ID, ZERO_MEMBER_TEAM_ID]) {
      const response = await fetch(`${baseUrl}/api/collection/list?leaderId=${leaderId}`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.deepEqual(payload.records, []);
      assert.equal(payload.total, 0);
      assert.equal(payload.totalAmount, 0);
      assert.equal(payload.pagination.hasNextPage, false);
    }
    assert.equal(getGroupReadCount(), 2);
    assert.equal(getNicknameReadCount(), 2);
    assert.equal(listCalls.length, 0);
    assert.equal(summaryCalls.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

for (const role of ["manager", "superuser"] as const) {
  for (const selected of [
    {
      label: "Bukhari",
      id: BUKHARI_TEAM_ID,
      prefix: "SW.BUKHARI_STAFF_",
      staffCount: 7,
      totalAmount: 700,
    },
    {
      label: "Haizal",
      id: HAIZAL_TEAM_ID,
      prefix: "SW.HAIZAL_STAFF_",
      staffCount: 9,
      totalAmount: 1800,
    },
  ] as const) {
    test(`${role} ${selected.label} Team Leader scope is isolated, counted, paginated, and constant-query`, async () => {
      const {
        storage,
        listCalls,
        summaryCalls,
        getGroupReadCount,
        getNicknameReadCount,
        getActiveNicknameCheckCount,
      } = buildBukhariHaizalStorage();
      const { server, baseUrl } = await startTestServer(registerTeamApp(role, storage));

      try {
        const response = await fetch(
          `${baseUrl}/api/collection/list?leaderId=${selected.id}&page=2&pageSize=3`,
        );
        assert.equal(response.status, 200);
        const payload = await response.json();
        assert.equal(payload.total, selected.staffCount);
        assert.equal(payload.totalAmount, selected.totalAmount);
        assert.equal(payload.pagination.page, 2);
        assert.equal(payload.pagination.pageSize, 3);
        assert.equal(payload.pagination.offset, 3);
        assert.equal(payload.records.length, 3);
        assert.ok(payload.records.every((record: TeamTestRecord) => (
          record.collectionStaffNickname.startsWith(selected.prefix)
        )));
        assert.ok(payload.records.every((record: TeamTestRecord) => (
          typeof record.cardNumber === "string" && record.cardNumber.length === 16
        )));
        assert.equal(listCalls.length, 1);
        assert.equal(summaryCalls.length, 1);
        assert.deepEqual(listCalls[0]?.nicknames, summaryCalls[0]?.nicknames);
        assert.equal((listCalls[0]?.nicknames as string[]).length, selected.staffCount);
        assert.equal(getGroupReadCount(), 1);
        assert.equal(getNicknameReadCount(), 1);
        assert.equal(getActiveNicknameCheckCount(), 0);
      } finally {
        await stopTestServer(server);
      }
    });
  }
}

test("switching Team Leader starts the new scope at page one without stale cross-team rows", async () => {
  const {
    storage,
    listCalls,
    summaryCalls,
    bukhariMembers,
    haizalMembers,
  } = buildBukhariHaizalStorage();
  const { server, baseUrl } = await startTestServer(registerTeamApp("manager", storage));

  try {
    const bukhariResponse = await fetch(
      `${baseUrl}/api/collection/list?leaderId=${BUKHARI_TEAM_ID}&page=2&pageSize=3`,
    );
    assert.equal(bukhariResponse.status, 200);
    const bukhariPayload = await bukhariResponse.json();
    assert.ok(bukhariPayload.records.every((record: TeamTestRecord) => (
      bukhariMembers.includes(record.collectionStaffNickname)
    )));

    const haizalResponse = await fetch(
      `${baseUrl}/api/collection/list?leaderId=${HAIZAL_TEAM_ID}&pageSize=3`,
    );
    assert.equal(haizalResponse.status, 200);
    const haizalPayload = await haizalResponse.json();
    assert.equal(haizalPayload.pagination.page, 1);
    assert.equal(haizalPayload.pagination.offset, 0);
    assert.ok(haizalPayload.records.every((record: TeamTestRecord) => (
      haizalMembers.includes(record.collectionStaffNickname)
    )));
    assert.deepEqual(listCalls.map((call) => call.offset), [3, 0]);
    assert.equal(summaryCalls.length, 2);
    assert.notDeepEqual(listCalls[0]?.nicknames, listCalls[1]?.nicknames);
  } finally {
    await stopTestServer(server);
  }
});

test("Team Leader options expose independent persisted 7/9-member counts without loading Collection rows", async () => {
  const { storage, listCalls, summaryCalls } = buildBukhariHaizalStorage();
  const { server, baseUrl } = await startTestServer(registerTeamApp("superuser", storage));

  try {
    const response = await fetch(`${baseUrl}/api/collection/teams`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      teams: [{
        id: BUKHARI_TEAM_ID,
        leaderNickname: "SW.BUKHARI_924",
        staffCount: 7,
      }, {
        id: HAIZAL_TEAM_ID,
        leaderNickname: "SW.HAIZAL_1331",
        staffCount: 9,
      }],
    });
    assert.equal(listCalls.length, 0);
    assert.equal(summaryCalls.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

for (const role of ["admin", "user"] as const) {
  test(`${role} cannot forge leaderId, teamLeader, or scope=team`, async () => {
    const { storage, getTeamReadCount, listCalls, summaryCalls } = buildTeamStorage();
    const { server, baseUrl } = await startTestServer(registerTeamApp(role, storage));

    try {
      for (const query of [
        `leaderId=${ACTIVE_TEAM_ID}`,
        "teamLeader=SW.LEADER_1",
        "scope=team",
      ]) {
        const response = await fetch(`${baseUrl}/api/collection/list?${query}`);
        assert.equal(response.status, 403);
      }
      assert.equal(getTeamReadCount(), 0);
      assert.equal(listCalls.length, 0);
      assert.equal(summaryCalls.length, 0);
    } finally {
      await stopTestServer(server);
    }
  });
}

for (const role of ["manager", "superuser"] as const) {
  test(`${role} can load read-only active Team Leader options`, async () => {
    const { storage } = buildTeamStorage();
    const { server, baseUrl } = await startTestServer(registerTeamApp(role, storage));

    try {
      const response = await fetch(`${baseUrl}/api/collection/teams`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        ok: true,
        teams: [{
          id: ACTIVE_TEAM_ID,
          leaderNickname: "SW.LEADER_1",
          staffCount: 1,
        }],
      });
    } finally {
      await stopTestServer(server);
    }
  });
}

for (const role of ["admin", "user"] as const) {
  test(`${role} cannot load Team Leader options`, async () => {
    const { storage, getTeamReadCount } = buildTeamStorage();
    const { server, baseUrl } = await startTestServer(registerTeamApp(role, storage));

    try {
      const response = await fetch(`${baseUrl}/api/collection/teams`);
      assert.equal(response.status, 403);
      assert.equal(getTeamReadCount(), 0);
    } finally {
      await stopTestServer(server);
    }
  });
}
