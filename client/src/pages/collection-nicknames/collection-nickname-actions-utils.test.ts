import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCollectionNicknameMemberIds,
  buildNicknamePasswordResetDescription,
  normalizeCollectionNicknameInput,
} from "./collection-nickname-actions-utils";

test("collection nickname action helper filters leader and unknown ids before assignment save", () => {
  const nicknameById = new Map<string, unknown>([
    ["member-1", {}],
    ["member-2", {}],
  ]);

  assert.deepEqual(
    buildCollectionNicknameMemberIds({
      assignedIds: ["member-2", "leader-1", "missing", "member-1", "member-1"],
      excludedId: "leader-1",
      nicknameById,
    }),
    ["member-1", "member-2"],
  );
});

test("collection nickname action helper normalizes nickname input before create or edit", () => {
  assert.equal(normalizeCollectionNicknameInput("  Ali  "), "Ali");
  assert.equal(normalizeCollectionNicknameInput(" A "), null);
  assert.equal(normalizeCollectionNicknameInput(""), null);
});

test("collection nickname action helper keeps reset password copy stable", () => {
  assert.equal(
    buildNicknamePasswordResetDescription({
      nickname: "Ali",
      temporaryPassword: "temp-123",
    }),
    "Ali telah direset. Password sementara: temp-123. Pengguna perlu login menggunakan password ini dan terus tetapkan password baharu.",
  );

  assert.equal(
    buildNicknamePasswordResetDescription({
      nickname: "Ali",
      temporaryPassword: "",
    }),
    "Ali telah direset. Gunakan password sementara semasa yang ditetapkan oleh sistem dan tetapkan password baharu selepas login.",
  );
});
