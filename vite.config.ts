import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { landingResourceHints } from "./scripts/lib/vite-landing-resource-hints";
import { loginResourceHints } from "./scripts/lib/vite-login-resource-hints";

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
  plugins: [react(), landingResourceHints(), loginResourceHints()],
  root: "./client",
  build: {
    outDir: "../dist-local/public",
    emptyOutDir: true,
    sourcemap: enableSourceMaps,
    cssMinify: "lightningcss",
    cssTarget: ["chrome120", "edge120", "firefox128", "safari17.4"],
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
        codeSplitting: {
          groups: [{
            // Preserve ownership of existing entry/vendor dependencies before
            // grouping login helpers, so lazy auth code cannot absorb icon core
            // or shared validation and become an eager dependency of every page.
            priority: 10,
            name(id) {
              const normalizedId = id.replace(/\\/g, "/");
              if (
                normalizedId.includes("vite/preload-helper")
                || normalizedId.includes("node_modules/react/")
                || normalizedId.includes("node_modules/react-dom/")
                || normalizedId.includes("node_modules/scheduler/")
              ) {
                return "framework";
              }

              if (
                normalizedId.includes("node_modules/clsx/")
                || normalizedId.includes("node_modules/tailwind-merge/")
                || normalizedId.includes("node_modules/class-variance-authority/")
                || /\/client\/src\/lib\/utils\.ts$/.test(normalizedId)
              ) {
                return "ui";
              }

              if (
                normalizedId.includes("node_modules/zod")
                || normalizedId.includes("shared/api-contracts.ts")
                || normalizedId.includes("client/src/lib/api/contract.ts")
              ) {
                return "validation";
              }

              // These tiny helpers already sit on the public entry's critical path.
              // Keep an exact allowlist: one request instead of a queue of tiny
              // chunks, without pulling private pages or the whole icon library in.
              if (
                /\/client\/src\/lib\/(?:browser-storage|secure-id|web-vitals|client-error-telemetry|safe-url|aria-state-props)\.ts$/.test(normalizedId)
                || /\/node_modules\/lucide-react\/dist\/esm\/(?:createLucideIcon|Icon|defaultAttributes|shared\/src\/utils|icons\/(?:house|refresh-cw|rotate-ccw|triangle-alert))\.js$/.test(normalizedId)
              ) {
                return "public-runtime";
              }

              if (!normalizedId.includes("node_modules")) {
                return undefined;
              }

              if (normalizedId.includes("@tanstack/react-query")) return "query";
              if (normalizedId.includes("xlsx")) return "excel";
              if (normalizedId.includes("jspdf")) return "pdf";
              if (normalizedId.includes("html2canvas")) return "capture";

              return undefined;
            },
          }, {
            name: "public-auth-runtime",
            // Exact existing login dependencies only. Consolidate tiny shared
            // controls/layout requests, while route facades and API clients stay
            // separate and private features retain normal lazy chunking.
            test(id) {
              const normalizedId = id.replace(/\\/g, "/");
              return /\/client\/src\/lib\/(?:interaction-media|fingerprint|i18n|auth-flow-feedback|api-errors)\.ts$/.test(normalizedId)
                || /\/client\/src\/pages\/auth-field-utils\.ts$/.test(normalizedId)
                || /\/client\/src\/components\/(?:auth\/AuthV17Layout|PublicAuthControls|ExpandableMessage)\.tsx$/.test(normalizedId)
                || /\/node_modules\/lucide-react\/dist\/esm\/icons\/(?:arrow-left|arrow-right|check|eye|eye-off|key-round|shield-check|user-round|wifi-off)\.js$/.test(normalizedId);
            },
          }],
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
