import assert from "node:assert/strict";
import test from "node:test";
import type {
  CollectionAdminGroup,
  CollectionStaffNickname,
} from "../../storage-postgres";
import { buildActiveCollectionTeams } from "../collection/collection-team-scope";

const now = new Date("2026-09-04T00:00:00.000Z");

function nickname(
  id: string,
  value: string,
  isActive = true,
  roleScope: CollectionStaffNickname["roleScope"] = "both",
): CollectionStaffNickname {
  return {
    id,
    nickname: value,
    isActive,
    roleScope,
    createdBy: "superuser",
    createdAt: now,
  };
}

function group(overrides: Partial<CollectionAdminGroup> = {}): CollectionAdminGroup {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    leaderNickname: "SW.LEADER_1",
    leaderNicknameId: "leader-1",
    leaderIsActive: true,
    leaderRoleScope: "admin",
    memberNicknames: ["SW.ACTIVE_2", "SW.INACTIVE_3"],
    memberNicknameIds: ["member-2", "member-3"],
    createdBy: "superuser",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test("buildActiveCollectionTeams uses persisted group ids and includes only explicitly assigned active members", () => {
  const teams = buildActiveCollectionTeams(
    [group()],
    [
      nickname("leader-1", "SW.LEADER_1"),
      nickname("member-2", "SW.ACTIVE_2"),
      nickname("member-3", "SW.INACTIVE_3", false),
    ],
  );

  assert.deepEqual(teams, [{
    id: "11111111-1111-4111-8111-111111111111",
    leaderNickname: "SW.LEADER_1",
    nicknames: ["SW.ACTIVE_2"],
    nicknameIds: ["member-2"],
    staffCount: 1,
  }]);
});

test("buildActiveCollectionTeams excludes groups whose persisted leader is inactive", () => {
  const teams = buildActiveCollectionTeams(
    [group({ leaderIsActive: false })],
    [nickname("leader-1", "SW.LEADER_1", false)],
  );

  assert.deepEqual(teams, []);
});

test("buildActiveCollectionTeams preserves a zero-member team as a zero-record scope", () => {
  const teams = buildActiveCollectionTeams(
    [group({
      memberNicknames: ["SW.INACTIVE_3"],
      memberNicknameIds: ["member-3"],
    })],
    [
      nickname("leader-1", "SW.LEADER_1"),
      nickname("member-3", "SW.INACTIVE_3", false),
    ],
  );

  assert.deepEqual(teams[0]?.nicknames, []);
  assert.equal(teams[0]?.staffCount, 0);
});

test("buildActiveCollectionTeams resolves current names by stable nickname ids", () => {
  const teams = buildActiveCollectionTeams(
    [group({
      leaderNickname: "STALE.LEADER",
      leaderNicknameId: "leader-1",
      memberNicknames: ["STALE.MEMBER"],
      memberNicknameIds: ["member-2"],
    })],
    [
      nickname("leader-1", "SW.CURRENT_LEADER", true, "admin"),
      nickname("member-2", "SW.CURRENT_MEMBER", true, "user"),
    ],
  );

  assert.deepEqual(teams, [{
    id: "11111111-1111-4111-8111-111111111111",
    leaderNickname: "SW.CURRENT_LEADER",
    nicknames: ["SW.CURRENT_MEMBER"],
    nicknameIds: ["member-2"],
    staffCount: 1,
  }]);
});

test("buildActiveCollectionTeams never widens scope from matching text when stable ids are missing", () => {
  const teams = buildActiveCollectionTeams(
    [group({
      leaderNicknameId: null,
      memberNicknames: ["SW.ACTIVE_2"],
      memberNicknameIds: [],
    })],
    [
      nickname("leader-1", "SW.LEADER_1", true, "admin"),
      nickname("member-2", "SW.ACTIVE_2", true, "user"),
    ],
  );

  assert.deepEqual(teams, []);
});

test("buildActiveCollectionTeams excludes malformed ids and leaders without leader role scope", () => {
  const activeNicknames = [
    nickname("leader-1", "SW.LEADER_1", true, "user"),
    nickname("member-2", "SW.ACTIVE_2", true, "user"),
  ];

  assert.deepEqual(buildActiveCollectionTeams([group()], activeNicknames), []);
  assert.deepEqual(buildActiveCollectionTeams([
    group({
      id: "not-a-team-id",
      leaderRoleScope: "admin",
    }),
  ], [
    nickname("leader-1", "SW.LEADER_1", true, "admin"),
    nickname("member-2", "SW.ACTIVE_2", true, "user"),
  ]), []);
});

test("buildActiveCollectionTeams deduplicates member ids and excludes the leader id", () => {
  const teams = buildActiveCollectionTeams(
    [group({
      memberNicknames: ["STALE", "STALE", "SW.LEADER_1"],
      memberNicknameIds: ["member-2", "member-2", "leader-1"],
    })],
    [
      nickname("leader-1", "SW.LEADER_1", true, "admin"),
      nickname("member-2", "SW.ACTIVE_2", true, "user"),
    ],
  );

  assert.deepEqual(teams[0]?.nicknames, ["SW.ACTIVE_2"]);
  assert.equal(teams[0]?.staffCount, 1);
});

test("persisted Bukhari and Haizal teams retain independent 7/9-member scopes", () => {
  const bukhariMembers = Array.from({ length: 7 }, (_, index) => `BUKHARI.STAFF_${index + 1}`);
  const haizalMembers = Array.from({ length: 9 }, (_, index) => `HAIZAL.STAFF_${index + 1}`);
  const teams = buildActiveCollectionTeams([
    group({
      id: "11111111-1111-4111-8111-111111111111",
      leaderNickname: "SW.BUKHARI_924",
      leaderNicknameId: "leader-bukhari",
      memberNicknames: bukhariMembers,
      memberNicknameIds: bukhariMembers.map((_, index) => `b-${index + 1}`),
    }),
    group({
      id: "22222222-2222-4222-8222-222222222222",
      leaderNickname: "SW.HAIZAL_1331",
      leaderNicknameId: "leader-haizal",
      memberNicknames: haizalMembers,
      memberNicknameIds: haizalMembers.map((_, index) => `h-${index + 1}`),
    }),
  ], [
    nickname("leader-bukhari", "SW.BUKHARI_924"),
    nickname("leader-haizal", "SW.HAIZAL_1331"),
    ...bukhariMembers.map((value, index) => nickname(`b-${index + 1}`, value)),
    ...haizalMembers.map((value, index) => nickname(`h-${index + 1}`, value)),
  ]);

  assert.equal(teams.find((team) => team.leaderNickname === "SW.BUKHARI_924")?.staffCount, 7);
  assert.equal(teams.find((team) => team.leaderNickname === "SW.HAIZAL_1331")?.staffCount, 9);
  assert.equal(
    teams[0]?.nicknames.some((member) => member.startsWith("HAIZAL.")),
    false,
  );
});
