import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repoRoot = process.cwd();

async function readJson(relativePath) {
  const source = await readFile(path.join(repoRoot, relativePath), "utf8");
  return JSON.parse(source);
}

test("repo security tooling keeps lint-staged, husky, and secretlint wired together", async () => {
  const packageJson = await readJson("package.json");
  const secretlintConfig = await readJson(".secretlintrc.json");
  const secretlintIgnore = await readFile(path.join(repoRoot, ".secretlintignore"), "utf8");
  const huskyHook = await readFile(path.join(repoRoot, ".husky", "pre-commit"), "utf8");

  assert.equal(packageJson.scripts.prepare, "husky");
  assert.equal(packageJson.scripts["lint:secrets"], "node scripts/run-secretlint.mjs");
  assert.ok(Array.isArray(packageJson["lint-staged"]["*.{js,mjs,cjs,ts,tsx,mts,cts}"]));
  assert.ok(Array.isArray(packageJson["lint-staged"]["*"]));
  assert.match(
    packageJson["lint-staged"]["*.{js,mjs,cjs,ts,tsx,mts,cts}"][0],
    /eslint --cache --max-warnings=0/i,
  );
  assert.match(packageJson["lint-staged"]["*"][0], /secretlint/i);
  assert.equal(secretlintConfig.rules[0]?.id, "@secretlint/secretlint-rule-preset-recommend");
  assert.match(secretlintIgnore, /\.env\.example/i);
  assert.match(secretlintIgnore, /package-lock\.json/i);
  assert.match(huskyHook, /npm exec(?:\s+--)?\s+lint-staged/i);
  assert.match(huskyHook, /--concurrent\s+true/i);
});

test("eslint security rules stay enabled for dangerous code-evaluation paths", async () => {
  const eslintConfig = await import(pathToFileURL(path.join(repoRoot, "eslint.config.mjs")).href);
  const config = eslintConfig.default;
  const combinedRules = config.reduce((rules, entry) => {
    if (entry?.rules) {
      Object.assign(rules, entry.rules);
    }
    return rules;
  }, {});

  assert.equal(combinedRules["no-eval"], "error");
  assert.equal(combinedRules["no-implied-eval"], "error");
  assert.equal(combinedRules["no-new-func"], "error");
  assert.equal(combinedRules["no-script-url"], "error");
});
