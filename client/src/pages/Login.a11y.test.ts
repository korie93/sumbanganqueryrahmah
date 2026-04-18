import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const loginPagePath = path.resolve(process.cwd(), "client", "src", "pages", "Login.tsx");

test("Login keeps explicit semantic labels wired to the username and password inputs", () => {
  const source = readFileSync(loginPagePath, "utf8");

  assert.match(
    source,
    /<label className="sr-only" htmlFor="login-username">\s*Username\s*<\/label>/,
  );
  assert.match(source, /id="login-username"/);
  assert.match(source, /name="username"/);
  assert.match(source, /"aria-describedby": "login-username-error"/);

  assert.match(
    source,
    /<label className="sr-only" htmlFor="login-password">\s*Password\s*<\/label>/,
  );
  assert.match(source, /id="login-password"/);
  assert.match(source, /name="password"/);
  assert.match(source, /"aria-describedby": "login-password-error"/);
});
