import assert from "node:assert/strict";
import test from "node:test";
import {
  getCollectionNicknameForcedChangeToast,
  getCollectionNicknameSetupDescription,
} from "@/pages/collection-report/collection-nickname-auth-feedback";

test("getCollectionNicknameSetupDescription explains forced password changes clearly", () => {
  assert.match(
    getCollectionNicknameSetupDescription("forced-change"),
    /password sementara telah disahkan/i,
  );
  assert.match(
    getCollectionNicknameSetupDescription("first-time"),
    /tetapkan kata laluan baharu untuk nickname ini/i,
  );
});

test("getCollectionNicknameForcedChangeToast returns an informational follow-up message", () => {
  const toast = getCollectionNicknameForcedChangeToast();

  assert.equal(toast.title, "Password Sementara Disahkan");
  assert.match(toast.description, /password sementara diterima/i);
});
