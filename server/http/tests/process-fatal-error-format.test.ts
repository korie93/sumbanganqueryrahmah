import assert from "node:assert/strict";
import test from "node:test";
import {
  formatProcessFatalDetails,
  sanitizeFatalString,
} from "../../internal/process-fatal-error-format";

test("formatProcessFatalDetails redacts secrets from fatal Error details and metadata", () => {
  const error = new Error("password=hunter2 token=abc123");
  error.stack = "Error: postgresql://user:pass@db.local/app Authorization: Bearer secret.jwt.token";

  const formatted = formatProcessFatalDetails(error);

  assert.doesNotMatch(formatted.details, /hunter2|abc123|user:pass|secret\.jwt\.token/);
  assert.match(formatted.details, /\[REDACTED\]/);
  assert.deepEqual(formatted.metadata, {
    error: {
      name: "Error",
      message: "password=[REDACTED] token=[REDACTED]",
    },
  });
});

test("formatProcessFatalDetails redacts sensitive object fields before inspecting rejection reasons", () => {
  const reason: Record<string, unknown> = {
    kind: "redis-error",
    password: "hunter2",
    nested: {
      accessToken: "abc123",
      connectionString: "postgresql://user:pass@db.local/app",
    },
  };
  reason.self = reason;

  const formatted = formatProcessFatalDetails(reason);

  assert.doesNotMatch(formatted.details, /hunter2|abc123|user:pass/);
  assert.match(formatted.details, /password: '\[REDACTED\]'/);
  assert.match(formatted.details, /self: '\[Circular\]'/);
});

test("sanitizeFatalString redacts bearer tokens, assignments, and URL credentials", () => {
  const sanitized = sanitizeFatalString(
    "Bearer abc.def password=secret connection_string=postgresql://user:pass@db.local/app",
  );

  assert.equal(
    sanitized,
    "Bearer [REDACTED] password=[REDACTED] connection_string=[REDACTED]",
  );
});
