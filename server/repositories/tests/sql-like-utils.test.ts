import assert from "node:assert/strict";
import test from "node:test";
import { buildLikePattern, escapeLikePattern } from "../sql-like-utils";

test("escapeLikePattern neutralizes LIKE wildcards and escape characters", () => {
  assert.equal(escapeLikePattern("plain"), "plain");
  assert.equal(escapeLikePattern("100%_match\\value"), "100\\%\\_match\\\\value");
});

test("buildLikePattern applies the expected wildcard placement around escaped input", () => {
  assert.equal(buildLikePattern("ali", "contains"), "%ali%");
  assert.equal(buildLikePattern("ali", "startsWith"), "ali%");
  assert.equal(buildLikePattern("ali", "endsWith"), "%ali");
  assert.equal(buildLikePattern("100%_match", "contains"), "%100\\%\\_match%");
});
