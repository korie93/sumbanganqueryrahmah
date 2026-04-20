import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { createViteBrotliAssetsPlugin } from "./scripts/lib/vite-brotli-assets-plugin.mjs";

export function resolveBuildSourceMapMode(env = process.env): boolean {
  if (env.NODE_ENV === "production") {
    return false;
  }

  return env.VITE_ENABLE_SOURCEMAPS === "1" && env.VITE_SOURCEMAP_AUDIENCE === "private";
}

const enableSourceMaps = resolveBuildSourceMapMode(process.env);

export default defineConfig({
  plugins: [react(), createViteBrotliAssetsPlugin()],
  root: "./client",
  build: {
    outDir: "../dist-local/public",
    emptyOutDir: true,
    // Non-production source maps stay opt-in so staging/public hosts do not expose them by accident.
    // Operators must explicitly acknowledge a private debugging/upload flow with
    // VITE_ENABLE_SOURCEMAPS=1 and VITE_SOURCEMAP_AUDIENCE=private.
    sourcemap: enableSourceMaps,
    // 600 kB is an intentional warning threshold, not a target bundle size.
    // Large feature-isolated chunks such as Excel/PDF/chart tooling are lazy-loaded
    // and verified separately by bundle-budget checks in repo scripts.
    chunkSizeWarningLimit: 600,
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
          if (id.includes("recharts")) return "charts";
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
