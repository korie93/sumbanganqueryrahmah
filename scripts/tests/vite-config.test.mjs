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

test("vite config never enables source maps for production builds even when troubleshooting flags are set", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      VITE_ENABLE_SOURCEMAPS: "1",
      DEPLOY_ENV: "staging",
      APP_ENV: "staging",
    },
    async () => {
      const config = await importViteConfigFresh();
      assert.equal(config.build?.sourcemap, false);
    },
  );
});

test("vite config still allows source maps for explicit staging-style non-production builds", async () => {
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

test("vite config wires the Brotli sidecar plugin for build output", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
    },
    async () => {
      const config = await importViteConfigFresh();
      const pluginNames = (config.plugins ?? [])
        .map((plugin) => (plugin && typeof plugin === "object" ? plugin.name : null))
        .filter(Boolean);

      assert.ok(pluginNames.includes("sqr-brotli-assets"));
    },
  );
});
