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
  const chunk = config.build.rollupOptions.output.manualChunks;
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
