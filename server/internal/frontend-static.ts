import compression from "compression";
import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { runtimeConfig } from "../config/runtime";
import { isPathInsideDirectory } from "../config/upload-paths";
import { logger } from "../lib/logger";

const DEFAULT_FRONTEND_PATHS = [
  "dist-local/public",
  "dist-local\\public",
  "dist/public",
  "dist\\public",
];

const IMMUTABLE_ASSET_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const FRONTEND_COMPRESSION_THRESHOLD_BYTES = 1024;
const ROBOTS_CACHE_MAX_AGE_SECONDS = 5 * 60;

function normalizeStaticRelativePath(staticRoot: string, absoluteFilePath: string) {
  const relativePath = path.relative(staticRoot, absoluteFilePath);
  return relativePath.split(path.sep).join("/");
}

function isImmutableFrontendAsset(staticRoot: string, absoluteFilePath: string) {
  const relativePath = normalizeStaticRelativePath(staticRoot, absoluteFilePath);
  if (!relativePath.startsWith("assets/")) {
    return false;
  }

  const assetFileName = path.posix.basename(relativePath);
  return /-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/i.test(assetFileName);
}

function shouldBypassSpaFallback(requestPath: string) {
  if (!requestPath || requestPath === "/") {
    return false;
  }

  if (requestPath.startsWith("/api") || requestPath.startsWith("/ws")) {
    return true;
  }

  return /\.[a-z0-9]+$/i.test(path.basename(requestPath));
}

function resolveSitemapUrl(publicAppUrl: string | null | undefined) {
  if (!publicAppUrl) {
    return null;
  }

  try {
    return new URL("/sitemap.xml", publicAppUrl).toString();
  } catch (error) {
    logger.warn("Skipping robots.txt sitemap because PUBLIC_APP_URL is invalid", { error });
    return null;
  }
}

export function buildRobotsTxt(publicAppUrl: string | null | undefined) {
  const lines = [
    "User-agent: *",
    "Disallow: /",
  ];
  const sitemapUrl = resolveSitemapUrl(publicAppUrl);
  if (sitemapUrl) {
    lines.push(`Sitemap: ${sitemapUrl}`);
  }

  return `${lines.join("\n")}\n`;
}

export function registerFrontendStatic(
  app: Express,
  options?: { cwd?: string; paths?: string[]; publicAppUrl?: string | null },
) {
  const cwd = options?.cwd || process.cwd();
  const possiblePaths = options?.paths || DEFAULT_FRONTEND_PATHS;
  const publicAppUrl = options?.publicAppUrl ?? runtimeConfig.app.publicAppUrl;

  logger.info("Resolving frontend static assets", { cwd });

  let foundPath: string | null = null;
  let foundIndex: string | null = null;

  for (const relPath of possiblePaths) {
    const fullPath = path.resolve(cwd, relPath);
    if (!isPathInsideDirectory({ parentDir: cwd, candidatePath: fullPath })) {
      logger.warn("Skipping frontend static path outside the working directory", { fullPath });
      continue;
    }

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
    } catch (error) {
      logger.warn("Failed to inspect frontend static path", { fullPath, error });
    }
  }

  if (foundPath && foundIndex) {
    logger.info("Serving frontend static assets", { foundPath });
    app.use(compression({
      threshold: FRONTEND_COMPRESSION_THRESHOLD_BYTES,
    }));
    app.get("/robots.txt", (_req, res) => {
      res
        .type("text/plain")
        .setHeader("Cache-Control", `public, max-age=${ROBOTS_CACHE_MAX_AGE_SECONDS}`);
      res.send(buildRobotsTxt(publicAppUrl));
    });
    app.use(express.static(foundPath, {
      setHeaders(res, servedPath) {
        if (!isImmutableFrontendAsset(foundPath as string, servedPath)) {
          return;
        }

        res.setHeader(
          "Cache-Control",
          `public, max-age=${IMMUTABLE_ASSET_MAX_AGE_SECONDS}, immutable`,
        );
      },
    }));

    app.use((req, res, next) => {
      if (shouldBypassSpaFallback(req.path)) {
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
            <body>
              <h1>Frontend Not Built</h1>
              <p>Please run: <code>npm run build:local</code></p>
              <p>Then restart the server.</p>
            </body>
          </html>
        `);
    }
  });
}
