import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLikePattern,
  escapeLikePattern,
  MAX_LIKE_PATTERN_INPUT_LENGTH,
  normalizeLikePatternInput,
} from "../sql-like-utils";

test("escapeLikePattern neutralizes LIKE wildcards and escape characters", () => {
  assert.equal(escapeLikePattern("plain"), "plain");
  assert.equal(escapeLikePattern("100%_match\\value"), "100\\%\\_match\\\\value");
  assert.equal(
    escapeLikePattern("%_%\\\\admin\\\\_%"),
    "\\%\\_\\%\\\\\\\\admin\\\\\\\\\\_\\%",
  );
  assert.equal(escapeLikePattern(""), "");
  assert.equal(escapeLikePattern(null), "");
  assert.equal(escapeLikePattern(undefined), "");
});

test("buildLikePattern applies the expected wildcard placement around escaped input", () => {
  assert.equal(buildLikePattern("ali", "contains"), "%ali%");
  assert.equal(buildLikePattern("ali", "startsWith"), "ali%");
  assert.equal(buildLikePattern("ali", "endsWith"), "%ali");
  assert.equal(buildLikePattern("100%_match", "contains"), "%100\\%\\_match%");
  assert.equal(buildLikePattern("%drop_table%", "startsWith"), "\\%drop\\_table\\%%");
  assert.equal(buildLikePattern("_tail\\", "endsWith"), "%\\_tail\\\\");
  assert.equal(buildLikePattern("", "contains"), "%%");
});

test("buildLikePattern preserves literal quote characters while escaping LIKE control characters", () => {
  const value = "O'Reilly_%\\report";
  assert.equal(
    buildLikePattern(value, "contains"),
    "%O'Reilly\\_\\%\\\\report%",
  );
});

test("buildLikePattern normalizes unicode lookalikes before escaping LIKE control characters", () => {
  assert.equal(
    buildLikePattern("１００％＿done", "contains"),
    "%100\\%\\_done%",
  );
});

test("buildLikePattern trims and caps long search values before wildcard placement", () => {
  assert.equal(buildLikePattern("  ali  ", "contains"), "%ali%");
  assert.equal(
    normalizeLikePatternInput("a".repeat(MAX_LIKE_PATTERN_INPUT_LENGTH + 25)).length,
    MAX_LIKE_PATTERN_INPUT_LENGTH,
  );
  assert.equal(
    buildLikePattern("a".repeat(MAX_LIKE_PATTERN_INPUT_LENGTH + 25), "startsWith"),
    `${"a".repeat(MAX_LIKE_PATTERN_INPUT_LENGTH)}%`,
  );
});

test("buildLikePattern rejects null bytes before constructing SQL patterns", () => {
  assert.throws(
    () => buildLikePattern("alice\0admin", "contains"),
    /must not contain null bytes/i,
  );
});

test("buildLikePattern keeps SQL injection text as literal bound pattern content", () => {
  assert.equal(
    buildLikePattern("'; DROP TABLE users; --", "contains"),
    "%'; DROP TABLE users; --%",
  );
});
