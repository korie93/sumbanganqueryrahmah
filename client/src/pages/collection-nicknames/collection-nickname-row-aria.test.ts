import assert from "node:assert/strict";
import test from "node:test";
import { buildNicknameAssignmentRowAriaLabel } from "@/pages/collection-nicknames/collection-nickname-row-aria";

test("buildNicknameAssignmentRowAriaLabel summarizes nickname assignment state", () => {
  assert.equal(
    buildNicknameAssignmentRowAriaLabel({
      isAssigned: true,
      isLeader: false,
      nickname: {
        id: "nick-1",
        nickname: "Collector Alpha",
        isActive: true,
        roleScope: "both",
        createdBy: "superuser",
        createdAt: "2026-04-14T00:00:00.000Z",
      },
    }),
    "Staff nickname Collector Alpha, scope Admin + User, status active, assigned to selected group",
  );
});
