import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import {
  jsxA11y,
  react,
} from "../lib/eslint-plugin-minimatch-compat.mjs";

const require = createRequire(import.meta.url);

function requirePluginMinimatch(pluginName) {
  const pluginRequire = createRequire(require.resolve(pluginName));
  return pluginRequire("minimatch");
}

test("legacy React ESLint plugins receive the patched callable minimatch API", () => {
  for (const pluginName of ["eslint-plugin-jsx-a11y", "eslint-plugin-react"]) {
    const minimatch = requirePluginMinimatch(pluginName);

    assert.equal(typeof minimatch, "function");
    assert.equal(typeof minimatch.Minimatch, "function");
    assert.equal(minimatch("DashboardPanel", "Dashboard*"), true);
    assert.equal(minimatch("ActivityPanel", "Dashboard*"), false);
  }

  assert.equal(typeof jsxA11y?.rules?.["label-has-associated-control"]?.create, "function");
  assert.equal(typeof react?.rules?.["no-array-index-key"]?.create, "function");
});
