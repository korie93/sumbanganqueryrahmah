import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { loadConfigFromFile } from "vite";

async function withEnv(overrides, fn) {
  const previousValues = new Map();

  for (const [key, value] of Object.entries(overrides)) {
    previousValues.set(key, process.env[key]);
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await fn();
  } finally {
    for (const [key, previousValue] of previousValues.entries()) {
      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
  }
}

async function importViteConfigFresh() {
  const configPath = path.resolve(process.cwd(), "vite.config.ts");
  const loaded = await loadConfigFromFile(
    {
      command: "build",
      mode: process.env.NODE_ENV === "production" ? "production" : "development",
      isSsrBuild: false,
      isPreview: false,
    },
    configPath,
  );

  if (!loaded) {
    throw new Error("Expected Vite config to load.");
  }

  return loaded.config;
}

test("vite config hard-fails production builds when source maps are explicitly enabled", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      VITE_ENABLE_SOURCEMAPS: "1",
      DEPLOY_ENV: "staging",
      APP_ENV: "staging",
    },
    async () => {
      await assert.rejects(
        () => importViteConfigFresh(),
        /VITE_ENABLE_SOURCEMAPS=1 cannot be used in production/i,
      );
    },
  );
});

test("vite config disables source maps for staging-marked non-production builds", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      VITE_ENABLE_SOURCEMAPS: "1",
      DEPLOY_ENV: "staging",
      APP_ENV: null,
    },
    async () => {
      const config = await importViteConfigFresh();
      assert.equal(config.build?.sourcemap, false);
    },
  );
});

test("vite config keeps production source maps disabled when troubleshooting flag is absent", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      VITE_ENABLE_SOURCEMAPS: null,
      DEPLOY_ENV: null,
      APP_ENV: null,
    },
    async () => {
      const config = await importViteConfigFresh();
      assert.equal(config.build?.sourcemap, false);
    },
  );
});

test("vite config allows source maps only for explicit local development troubleshooting", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      VITE_ENABLE_SOURCEMAPS: "1",
      DEPLOY_ENV: null,
      APP_ENV: null,
    },
    async () => {
      const config = await importViteConfigFresh();
      assert.equal(config.build?.sourcemap, true);
    },
  );
});

test("vite config keeps the chunk warning threshold at the production budget", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      VITE_ENABLE_SOURCEMAPS: null,
      DEPLOY_ENV: null,
      APP_ENV: null,
    },
    async () => {
      const config = await importViteConfigFresh();
      assert.equal(config.build?.chunkSizeWarningLimit, 500);
    },
  );
});

test("vite config embeds only a validated release SHA in the client bundle", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      VITE_ENABLE_SOURCEMAPS: null,
      GITHUB_SHA: "ABCDEF0123456789ABCDEF0123456789ABCDEF01",
      SQR_RELEASE_SHA: null,
    },
    async () => {
      const config = await importViteConfigFresh();
      assert.equal(
        config.define?.__SQR_CLIENT_RELEASE_SHA__,
        JSON.stringify("abcdef0123456789abcdef0123456789abcdef01"),
      );
    },
  );
});

test("vite config omits malformed release identifiers from the client bundle", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      VITE_ENABLE_SOURCEMAPS: null,
      GITHUB_SHA: "not-a-commit-sha",
      SQR_RELEASE_SHA: "release-secret-or-tag",
    },
    async () => {
      const config = await importViteConfigFresh();
      assert.equal(config.define?.__SQR_CLIENT_RELEASE_SHA__, JSON.stringify(""));
    },
  );
});

test("landing resource hints publish only inert build-owned landing URLs", async () => {
  const config = await importViteConfigFresh();
  const plugin = config.plugins.find(plugin => plugin.name === "sqr-landing-resource-hints");
  assert.equal(plugin.apply, "build");
  const handler = plugin.transformIndexHtml.handler;
  const landing = {
    type: "chunk",
    facadeModuleId: path.resolve("client/src/pages/Landing.tsx"),
    fileName: "assets/Landing-abc123.js",
    imports: [],
    viteMetadata: { importedCss: new Set(["assets/Landing-def456.css"]) },
  };
  const bundle = {
    landing,
    unrelated: { type: "chunk", facadeModuleId: "/repo/client/src/pages/Login.tsx", fileName: "assets/Login-auth.js" },
  };
  assert.deepEqual(handler("", { bundle }), [
    { tag: "meta", attrs: { name: "sqr-landing-script", content: "/assets/Landing-abc123.js" }, injectTo: "head" },
    { tag: "meta", attrs: { name: "sqr-landing-style", content: "/assets/Landing-def456.css" }, injectTo: "head" },
  ]);
  const withImports = { ...landing, imports: ["assets/framework-shared.js", "assets/aria-state-props-helper.js"] };
  const hints = handler('<link rel="modulepreload" href="/assets/framework-shared.js">', { bundle: { landing: withImports } });
  assert.deepEqual(hints.filter(tag => tag.attrs.name === "sqr-landing-script").map(tag => tag.attrs.content),
    ["/assets/Landing-abc123.js", "/assets/aria-state-props-helper.js"]);
  assert.throws(() => handler("", { bundle: {} }), /require the emitted landing page chunk/);
  for (const fileName of ["https://example.com/landing.js", "../outside.js", "assets/nested/landing.js"]) {
    assert.throws(() => handler("", { bundle: { landing: { ...landing, fileName } } }), /local build asset paths/);
  }
});

test("public runtime consolidates only the existing small shared entry dependencies", async () => {
  const config = await importViteConfigFresh();
  const chunk = config.build.rollupOptions.output.codeSplitting.groups[0].name;
  for (const name of ["browser-storage", "secure-id", "web-vitals", "client-error-telemetry", "safe-url", "aria-state-props"]) {
    assert.equal(chunk(`/repo/client/src/lib/${name}.ts`), "public-runtime");
  }
  for (const name of ["createLucideIcon", "Icon", "defaultAttributes", "shared/src/utils", "icons/house", "icons/refresh-cw", "icons/rotate-ccw", "icons/triangle-alert"]) {
    assert.equal(chunk(`/repo/node_modules/lucide-react/dist/esm/${name}.js`), "public-runtime");
  }
  for (const id of ["client/src/pages/Search.tsx", "client/src/pages/Settings.tsx", "client/src/app/AuthenticatedAppEntry.tsx", "client/src/lib/api/client.ts", "node_modules/lucide-react/dist/esm/icons/database.js", "node_modules/web-vitals/dist/web-vitals.js"]) {
    assert.equal(chunk(`/repo/${id}`), undefined, `Do not eagerly bundle ${id}`);
  }
  assert.equal(chunk("/repo/node_modules/@tanstack/react-query/build/modern/index.js"), "query");
  assert.equal(chunk("/repo/node_modules/react/index.js"), "framework");
});

function loginHintFixture() {
  const chunk = (fileName, imports = [], metadata = {}) => ({
    type: "chunk", fileName, imports, dynamicImports: [],
    viteMetadata: { importedCss: new Set(), importedAssets: new Set(), ...metadata },
  });
  const login = {
    ...chunk("assets/Login-abc123.js", ["assets/AuthV17Layout-abc123.js", "assets/index-main.js"], {
      importedCss: new Set(["assets/Login-abc123.css"]),
    }),
    facadeModuleId: path.resolve("client/src/pages/Login.tsx"),
    dynamicImports: ["assets/Recovery-private.js"],
  };
  const layout = chunk("assets/AuthV17Layout-abc123.js", ["assets/i18n-abc123.js", "assets/framework-abc123.js"], {
    importedCss: new Set(["assets/AuthV17Layout-abc123.css"]),
    importedAssets: new Set(["assets/sqr-illustration-abc123.webp"]),
  });
  const main = {
    ...chunk("assets/index-main.js", ["assets/framework-abc123.js"], {
      importedCss: new Set(["assets/index-main.css"]),
    }),
    dynamicImports: ["assets/AuthenticatedAppEntry-private.js", "assets/Landing-private.js", login.fileName],
  };
  const framework = chunk("assets/framework-abc123.js");
  const translations = chunk("assets/i18n-abc123.js", [layout.fileName]); // Cycle must terminate.
  const illustration = {
    type: "asset", fileName: "assets/sqr-illustration-abc123.webp",
    originalFileNames: ["src/assets/auth-v17/sqr-illustration.webp"],
  };
  const assets = [login, layout, main, framework, translations, illustration,
    ...["assets/Login-abc123.css", "assets/AuthV17Layout-abc123.css", "assets/index-main.css"]
      .map(fileName => ({ type: "asset", fileName, originalFileNames: [] })),
    chunk("assets/Recovery-private.js"), chunk("assets/AuthenticatedAppEntry-private.js"), chunk("assets/Landing-private.js"),
  ];
  return { login, layout, main, illustration, bundle: Object.fromEntries(assets.map(asset => [asset.fileName, asset])) };
}

test("public auth runtime consolidates only login's existing small helpers and icons", async () => {
  const config = await importViteConfigFresh();
  const groups = config.build.rollupOptions.output.codeSplitting.groups;
  const authGroup = groups.find(group => group.name === "public-auth-runtime");
  assert.ok(groups[0].priority > (authGroup.priority ?? 0), "Existing entry dependencies keep ownership before the lazy auth group");
  const chunk = id => authGroup.test(id) ? authGroup.name : undefined;
  for (const name of ["interaction-media", "fingerprint", "i18n", "auth-flow-feedback", "api-errors"]) {
    assert.equal(chunk(`/repo/client/src/lib/${name}.ts`), "public-auth-runtime");
  }
  assert.equal(chunk("/repo/client/src/pages/auth-field-utils.ts"), "public-auth-runtime");
  for (const name of ["arrow-left", "arrow-right", "check", "eye", "eye-off", "key-round", "shield-check", "user-round", "wifi-off"]) {
    assert.equal(chunk(`/repo/node_modules/lucide-react/dist/esm/icons/${name}.js`), "public-auth-runtime");
  }
  for (const id of ["client/src/lib/api-client.ts", "client/src/lib/api/auth.ts", "client/src/components/auth/AuthV17Layout.tsx", "client/src/pages/Login.tsx", "client/src/app/AuthenticatedAppEntry.tsx", "node_modules/lucide-react/dist/esm/icons/database.js"]) {
    assert.equal(chunk(`/repo/${id}`), undefined, `Do not merge ${id} into the auth helpers`);
  }
});

test("login resource hints include only emitted static dependencies, CSS and the exact V17 art", async () => {
  const config = await importViteConfigFresh();
  const plugin = config.plugins.find(plugin => plugin.name === "sqr-login-resource-hints");
  assert.equal(plugin.apply, "build");
  assert.equal(plugin.transformIndexHtml.order, "post");
  const fixture = loginHintFixture();
  const html = '<script type="module" src="/assets/index-main.js"></script>'
    + '<link rel="modulepreload" href="/assets/framework-abc123.js">'
    + '<link rel="stylesheet" href="/assets/index-main.css">';
  const hints = plugin.transformIndexHtml.handler(html, { bundle: fixture.bundle });
  assert.deepEqual(hints.map(hint => [hint.attrs.name, hint.attrs.content]), [
    ["sqr-login-image", "/assets/sqr-illustration-abc123.webp"],
    ["sqr-login-script", "/assets/Login-abc123.js"],
    ["sqr-login-script", "/assets/AuthV17Layout-abc123.js"],
    ["sqr-login-script", "/assets/i18n-abc123.js"],
    ["sqr-login-style", "/assets/Login-abc123.css"],
    ["sqr-login-style", "/assets/AuthV17Layout-abc123.css"],
  ]);
  assert.ok(hints.every(hint => hint.tag === "meta" && hint.injectTo === "head"));
  assert.equal(new Set(hints.map(hint => hint.attrs.content)).size, hints.length);
  assert.ok(hints.every(hint => !hint.attrs.content.includes("private")));
  const withImage = plugin.transformIndexHtml.handler(html + '<link rel="preload" as="image" href="/assets/sqr-illustration-abc123.webp">', { bundle: fixture.bundle });
  assert.equal(withImage.some(hint => hint.attrs.name === "sqr-login-image"), false);
});

test("login resource hints reject missing or nonlocal static graph resources", async () => {
  const config = await importViteConfigFresh();
  const handler = config.plugins.find(plugin => plugin.name === "sqr-login-resource-hints").transformIndexHtml.handler;
  assert.throws(() => handler("", { bundle: {} }), /require the emitted login page chunk/);
  for (const fileName of ["https://outside.invalid/x.js", "../private.js", "assets/nested/x.js", "assets/x.js?query=1", "assets/missing.js"]) {
    const fixture = loginHintFixture();
    fixture.login.imports.push(fileName);
    assert.throws(() => handler("", { bundle: fixture.bundle }), /require emitted local script paths/, fileName);
  }
  for (const style of ["https://outside.invalid/x.css", "../private.css", "assets/nested/x.css", "assets/missing.css", "assets/Login-abc123.js"]) {
    const fixture = loginHintFixture();
    fixture.layout.viteMetadata.importedCss.add(style);
    assert.throws(() => handler("", { bundle: fixture.bundle }), /require emitted local stylesheet paths/, style);
  }
});

test("login image hint is verified against source identity and static-graph asset metadata", async () => {
  const config = await importViteConfigFresh();
  const handler = config.plugins.find(plugin => plugin.name === "sqr-login-resource-hints").transformIndexHtml.handler;
  for (const mutate of [
    fixture => { delete fixture.bundle[fixture.illustration.fileName]; },
    fixture => { fixture.illustration.originalFileNames = ["src/assets/another/sqr-illustration.webp"]; },
    fixture => { fixture.layout.viteMetadata.importedAssets.clear(); },
    fixture => { fixture.illustration.fileName = "https://outside.invalid/sqr-illustration-abc123.webp"; },
    fixture => { fixture.bundle["assets/sqr-illustration-duplicate.webp"] = { ...fixture.illustration, fileName: "assets/sqr-illustration-duplicate.webp" }; },
  ]) {
    const fixture = loginHintFixture();
    mutate(fixture);
    assert.throws(() => handler("", { bundle: fixture.bundle }), /require the exact emitted V17 illustration/);
  }
  const absolute = loginHintFixture();
  absolute.illustration.originalFileNames = [path.resolve("client/src/assets/auth-v17/sqr-illustration.webp")];
  assert.ok(handler("", { bundle: absolute.bundle }).some(hint => hint.attrs.name === "sqr-login-image"));
});
