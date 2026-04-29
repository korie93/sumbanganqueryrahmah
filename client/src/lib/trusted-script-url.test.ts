import assert from "node:assert/strict"
import test from "node:test"

import { sanitizeTrustedScriptURL } from "./trusted-script-url"

test("sanitizeTrustedScriptURL allows relative and absolute same-origin script URLs", () => {
  assert.equal(sanitizeTrustedScriptURL("/assets/app.js"), "/assets/app.js")
  assert.equal(sanitizeTrustedScriptURL("http://localhost/assets/app.js"), "http://localhost/assets/app.js")
})

test("sanitizeTrustedScriptURL rejects cross-origin and unsafe script URL schemes", () => {
  assert.throws(
    () => sanitizeTrustedScriptURL("https://cdn.example.test/app.js"),
    /same-origin/i,
  )
  assert.throws(
    () => sanitizeTrustedScriptURL("javascript:alert(1)"),
    /protocol/i,
  )
  assert.throws(
    () => sanitizeTrustedScriptURL("data:text/javascript,alert(1)"),
    /protocol/i,
  )
  assert.throws(
    () => sanitizeTrustedScriptURL("blob:http://localhost/123"),
    /protocol/i,
  )
})

test("sanitizeTrustedScriptURL rejects empty and malformed script URLs", () => {
  assert.throws(() => sanitizeTrustedScriptURL(""), /empty/i)
  assert.throws(() => sanitizeTrustedScriptURL("http://[::1"), /invalid/i)
})
