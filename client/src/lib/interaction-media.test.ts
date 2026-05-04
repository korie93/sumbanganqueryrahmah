import assert from "node:assert/strict";
import test from "node:test";

import { shouldAutoFocusPublicAuthField } from "@/lib/interaction-media";

function createWindowDouble(matchesByQuery: Record<string, boolean>): Pick<Window, "matchMedia"> {
  return {
    matchMedia(query: string) {
      return {
        matches: Boolean(matchesByQuery[query]),
      } as MediaQueryList;
    },
  };
}

test("shouldAutoFocusPublicAuthField requires both fine pointer and hover support", () => {
  assert.equal(
    shouldAutoFocusPublicAuthField(createWindowDouble({
      "(pointer: fine)": true,
      "(hover: hover)": true,
    })),
    true,
  );
  assert.equal(
    shouldAutoFocusPublicAuthField(createWindowDouble({
      "(pointer: fine)": true,
      "(hover: hover)": false,
    })),
    false,
  );
  assert.equal(
    shouldAutoFocusPublicAuthField(createWindowDouble({
      "(pointer: fine)": false,
      "(hover: hover)": true,
    })),
    false,
  );
});

test("shouldAutoFocusPublicAuthField stays disabled when media queries are unavailable", () => {
  assert.equal(shouldAutoFocusPublicAuthField(undefined), false);
  assert.equal(
    shouldAutoFocusPublicAuthField({
      matchMedia() {
        throw new Error("matchMedia unavailable");
      },
    }),
    false,
  );
});
