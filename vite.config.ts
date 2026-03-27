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

export default defineConfig({
  customLogger: viteLogger,
  plugins: [react()],
  root: "./client",
  build: {
    outDir: "../dist-local/public",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    modulePreload: {
      resolveDependencies(_filename, dependencies, context) {
        if (context.hostType !== "html") {
          return dependencies;
        }

        return dependencies.filter((dependency) => {
          if (!dependency.startsWith("assets/")) {
            return true;
          }

          return !/^(assets\/(?:charts|pdf|excel|capture)-)/.test(dependency);
        });
      },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
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
          if (id.includes("framer-motion")) return "motion";

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
