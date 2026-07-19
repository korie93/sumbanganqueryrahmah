import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const isProductionBuild = process.env.NODE_ENV === "production";
const isProductionDeploy =
  process.env.DEPLOY_ENV === "production"
  || process.env.APP_ENV === "production"
  || process.env.VERCEL_ENV === "production";
const isStagingBuild =
  process.env.DEPLOY_ENV === "staging"
  || process.env.APP_ENV === "staging";
const isProductionLikeBuild = isProductionBuild || isProductionDeploy;
const sourcemapsExplicitlyEnabled = process.env.VITE_ENABLE_SOURCEMAPS === "1";
const configuredClientReleaseSha = String(
  process.env.SQR_RELEASE_SHA || process.env.GITHUB_SHA || "",
).trim().toLowerCase();
const clientReleaseSha = /^[a-f0-9]{40}$/.test(configuredClientReleaseSha)
  ? configuredClientReleaseSha
  : "";

if (isProductionLikeBuild && sourcemapsExplicitlyEnabled) {
  throw new Error("FATAL: VITE_ENABLE_SOURCEMAPS=1 cannot be used in production builds.");
}

const enableSourceMaps =
  !isProductionLikeBuild
  && !isStagingBuild
  && sourcemapsExplicitlyEnabled;

export default defineConfig({
  define: {
    __SQR_CLIENT_RELEASE_SHA__: JSON.stringify(clientReleaseSha),
  },
  plugins: [react()],
  root: "./client",
  build: {
    outDir: "../dist-local/public",
    emptyOutDir: true,
    sourcemap: enableSourceMaps,
    // 500 kB is an intentional warning threshold, not a target bundle size.
    // Large feature-isolated chunks such as Excel/PDF/chart tooling are lazy-loaded
    // and verified separately by bundle-budget checks in repo scripts.
    chunkSizeWarningLimit: 500,
    modulePreload: {
      resolveDependencies(_filename, dependencies, context) {
        if (context.hostType !== "html") {
          return dependencies;
        }

        return dependencies.filter((dependency) => {
          if (!dependency.startsWith("assets/")) {
            return true;
          }

          return !/^(assets\/(?:query|charts|pdf|excel|capture)-)/.test(dependency);
        });
      },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("vite/preload-helper")
            || id.includes("node_modules/react/")
            || id.includes("node_modules/react-dom/")
            || id.includes("node_modules/scheduler/")
          ) {
            return "framework";
          }

          if (
            id.includes("node_modules/clsx/")
            || id.includes("node_modules/tailwind-merge/")
            || id.includes("node_modules/class-variance-authority/")
          ) {
            return "ui";
          }

          if (
            id.includes("node_modules/zod")
            || id.includes("shared/api-contracts.ts")
            || id.includes("client/src/lib/api/contract.ts")
          ) {
            return "validation";
          }

          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("@tanstack/react-query")) return "query";
          if (id.includes("xlsx")) return "excel";
          if (id.includes("jspdf")) return "pdf";
          if (id.includes("html2canvas")) return "capture";

          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
});
