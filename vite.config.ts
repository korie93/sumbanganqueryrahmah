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
    rollupOptions: {
      output: {
        manualChunks: {
          query: ["@tanstack/react-query"],
          charts: ["recharts"],
          excel: ["xlsx"],
          pdf: ["jspdf"],
          capture: ["html2canvas"],
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
