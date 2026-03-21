import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { logger } from "../lib/logger";

const DEFAULT_FRONTEND_PATHS = [
  "dist-local/public",
  "dist-local\\public",
  "dist/public",
  "dist\\public",
];

export function registerFrontendStatic(app: Express, options?: { cwd?: string; paths?: string[] }) {
  const cwd = options?.cwd || process.cwd();
  const possiblePaths = options?.paths || DEFAULT_FRONTEND_PATHS;

  logger.info("Resolving frontend static assets", { cwd });

  let foundPath: string | null = null;
  let foundIndex: string | null = null;

  for (const relPath of possiblePaths) {
    const fullPath = path.resolve(cwd, relPath);
    const indexFile = path.join(fullPath, "index.html");

    logger.debug("Checking frontend static path", { fullPath });

    try {
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
        const files = fs.readdirSync(fullPath);
        const preview = files.slice(0, 5).join(", ");
        logger.debug("Frontend static path exists", {
          fullPath,
          fileCount: files.length,
          preview: `${preview}${files.length > 5 ? "..." : ""}`,
        });

        if (fs.existsSync(indexFile)) {
          foundPath = fullPath;
          foundIndex = indexFile;
          break;
        }
      }
    } catch (error: any) {
      logger.warn("Failed to inspect frontend static path", { fullPath, error });
    }
  }

  if (foundPath && foundIndex) {
    logger.info("Serving frontend static assets", { foundPath });
    app.use(express.static(foundPath));

    app.use((req, res, next) => {
      if (req.path.startsWith("/api") || req.path.startsWith("/ws")) {
        return next();
      }
      return res.sendFile(foundIndex as string);
    });

    logger.info("Frontend static assets registered successfully");
    return;
  }

  logger.error("Frontend files were not found", {
    expectedLocation: path.resolve(cwd, "dist-local/public"),
    suggestedCommand: "npm run build:local",
  });

  app.use((req, res) => {
    if (!req.path.startsWith("/api") && !req.path.startsWith("/ws")) {
      res.status(404).send(`
          <html>
            <body style="font-family: sans-serif; padding: 40px;">
              <h1>Frontend Not Built</h1>
              <p>Please run: <code>npm run build:local</code></p>
              <p>Then restart the server.</p>
            </body>
          </html>
        `);
    }
  });
}
