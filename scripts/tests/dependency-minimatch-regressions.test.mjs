import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import * as esmMinimatch from "minimatch";

const require = createRequire(import.meta.url);
const minimatchApis = [
  ["ESM", esmMinimatch],
  ["CommonJS", require("minimatch")],
];

// These checks only match short in-memory strings. They do not walk files,
// construct exhaustion payloads, or rely on timing-sensitive assertions.
for (const [moduleFormat, api] of minimatchApis) {
  test(`${moduleFormat} minimatch preserves the glob semantics used by lint and coverage tooling`, () => {
    for (const name of ["minimatch", "Minimatch", "match", "braceExpand"]) {
      assert.equal(typeof api[name], "function", name);
    }

    const cases = [
      ["client/src/pages/home.tsx", "client/src/**/*.{ts,tsx}", {}, true],
      ["client/src/pages/home.jsx", "client/src/**/*.{ts,tsx}", {}, false],
      ["client/src/.hidden.ts", "client/src/**/*.ts", {}, false],
      ["client/src/.hidden.ts", "client/src/**/*.ts", { dot: true }, true],
      ["server/routes/users.ts", "@(client|server)/**/*.ts", {}, true],
      ["shared/types.ts", "@(client|server)/**/*.ts", {}, false],
      ["server/routes/users.ts", "*.ts", { matchBase: true }, true],
      ["server/routes/users.test.ts", "!**/*.test.ts", {}, false],
      ["server/routes/users.ts", "!**/*.test.ts", {}, true],
      [
        "client\\src\\home.ts",
        "client\\src\\*.ts",
        { platform: "win32", windowsPathsNoEscape: true },
        true,
      ],
    ];

    for (const [file, pattern, options, expected] of cases) {
      const settings = { platform: "linux", ...options };
      assert.equal(api.minimatch(file, pattern, settings), expected, `${file}: ${pattern}`);
      assert.equal(new api.Minimatch(pattern, settings).match(file), expected, `${file}: class API`);
    }

    assert.deepEqual(api.match([
      "server/routes/users.ts",
      "shared/types.ts",
      "client/src/home.tsx",
    ], "{server,shared}/**/*.ts", { platform: "linux" }), [
      "server/routes/users.ts",
      "shared/types.ts",
    ]);
    assert.deepEqual(api.braceExpand("src/{client,server}/file{01..02}.ts"), [
      "src/client/file01.ts",
      "src/client/file02.ts",
      "src/server/file01.ts",
      "src/server/file02.ts",
    ]);
  });

  test(`${moduleFormat} minimatch bounds optimization-generated glob rows with braceExpandMax`, () => {
    // GHSA-g3hv-75wg-m249: **/.. preprocessing must share the brace expansion
    // limit. Two split sites produce only four rows even without the small cap.
    // https://github.com/isaacs/minimatch/blob/v11.0.1/test/preprocess-limits.ts
    const pattern = "**/../a/b/**/../c/d";
    const options = { platform: "linux", optimizationLevel: 2 };
    const bounded = new api.Minimatch(pattern, { ...options, braceExpandMax: 2 });

    assert.equal(bounded.globParts.length, 2);
    assert.equal(bounded.set.length, 2);

    const ordinary = new api.Minimatch(pattern, options);
    assert.equal(ordinary.globParts.length, 4);
    assert.equal(ordinary.set.length, 4);
    assert.equal(ordinary.match("../a/b/../c/d"), true);
    assert.equal(ordinary.match("x/a/b/y/c/d"), true);
  });
}
