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
