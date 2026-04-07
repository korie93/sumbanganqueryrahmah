import { createLogger, defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const suppressedPostcssWarning =
  "A PostCSS plugin did not pass the `from` option to `postcss.parse`.";

const viteLogger = createLogger();
const originalWarn = viteLogger.warn;
const originalWarnOnce = viteLogger.warnOnce;

viteLogger.warn = (msg, options) => {
  if (typeof msg === "string" && msg.includes(suppressedPostcssWarning)) {
    return;
  }

  originalWarn(msg, options);
};

viteLogger.warnOnce = (msg, options) => {
  if (typeof msg === "string" && msg.includes(suppressedPostcssWarning)) {
    return;
  }

  originalWarnOnce(msg, options);
};

const enableSourceMaps =
  process.env.VITE_ENABLE_SOURCEMAPS === "1"
  || process.env.DEPLOY_ENV === "staging"
  || process.env.APP_ENV === "staging";

export default defineConfig({
  customLogger: viteLogger,
  plugins: [react()],
  root: "./client",
  build: {
    outDir: "../dist-local/public",
    emptyOutDir: true,
    sourcemap: enableSourceMaps,
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
