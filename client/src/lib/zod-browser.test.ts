import assert from "node:assert/strict";
import test from "node:test";

// Node runs each test file in its own process. Keep Zod imports dynamic so this
// also detects a blocked capability probe during schema construction, before
// safeParse has a chance to catch the CSP-like error and fall back silently.
test("browser validation constructs and parses schemas without dynamic code generation", async (context) => {
  let dynamicCodeAttempts = 0;
  const blockedFunction = new Proxy(globalThis.Function, {
    apply() {
      dynamicCodeAttempts += 1;
      throw new EvalError("Dynamic code generation is blocked by the browser policy.");
    },
    construct() {
      dynamicCodeAttempts += 1;
      throw new EvalError("Dynamic code generation is blocked by the browser policy.");
    },
  });
  context.mock.method(globalThis, "Function", blockedFunction);

  const { z, default: defaultZod } = await import("./zod-browser");
  assert.equal(z, defaultZod);
  const schema = z.object({
    owner: z.object({ name: z.string().trim().min(1) }).strict(),
    count: z.number().int().nonnegative().default(0),
    tags: z.array(z.string().transform((value) => value.trim())),
  }).strict();
  assert.deepEqual(schema.parse({ owner: { name: " Operator " }, tags: [" ready "] }), {
    owner: { name: "Operator" }, count: 0, tags: ["ready"],
  });
  assert.equal(schema.safeParse({ owner: { name: "" }, count: -1, tags: [] }).success, false);
  assert.equal(schema.safeParse({ owner: { name: "Operator", private: true }, tags: [] }).success, false);
  assert.equal(schema.safeParse({ owner: { name: "Operator" }, tags: [], extra: true }).success, false);

  const { authPasswordResetTokenResponseSchema } = await import("@shared/api-contracts");
  const reset = {
    email: "operator@example.test",
    expiresAt: "2026-10-24T08:00:00.000Z",
    fullName: "Operator",
    role: "user",
    username: "operator",
  };
  assert.equal(authPasswordResetTokenResponseSchema.safeParse({ ok: true, reset }).success, true);
  assert.equal(authPasswordResetTokenResponseSchema.safeParse({
    ok: true, reset: { ...reset, tokenHash: "must-not-cross-the-wire" },
  }).success, false);
  assert.equal(authPasswordResetTokenResponseSchema.safeParse({
    ok: true, reset: { ...reset, expiresAt: "invalid" },
  }).success, false);
  assert.equal(dynamicCodeAttempts, 0, "Even a caught Function probe violates browser CSP/Trusted Types.");
});
