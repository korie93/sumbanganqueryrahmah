import express, { type Express } from "express";
import fs from "fs";
import path from "path";

const DEFAULT_FRONTEND_PATHS = [
  "dist-local/public",
  "dist-local\\public",
  "dist/public",
  "dist\\public",
];

export function registerFrontendStatic(app: Express, options?: { cwd?: string; paths?: string[] }) {
  const cwd = options?.cwd || process.cwd();
  const possiblePaths = options?.paths || DEFAULT_FRONTEND_PATHS;

  console.log(`  Working directory: ${cwd}`);

  let foundPath: string | null = null;
  let foundIndex: string | null = null;

  for (const relPath of possiblePaths) {
    const fullPath = path.resolve(cwd, relPath);
    const indexFile = path.join(fullPath, "index.html");

    console.log(`  Checking: ${fullPath}`);

    try {
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
        const files = fs.readdirSync(fullPath);
        const preview = files.slice(0, 5).join(", ");
        console.log(`    Found ${files.length} files: ${preview}${files.length > 5 ? "..." : ""}`);

        if (fs.existsSync(indexFile)) {
          foundPath = fullPath;
          foundIndex = indexFile;
          break;
        }
      }
    } catch (error: any) {
      console.log(`    Error: ${error.message}`);
    }
  }

  if (foundPath && foundIndex) {
    console.log(`  Frontend: Serving from ${foundPath}`);
    app.use(express.static(foundPath));

    app.use((req, res, next) => {
      if (req.path.startsWith("/api") || req.path.startsWith("/ws")) {
        return next();
      }
      return res.sendFile(foundIndex as string);
    });

    console.log("  Frontend: OK");
    return;
  }

  console.log("");
  console.log("  ERROR: Frontend files not found!");
  console.log("  Please run: npm run build:local");
  console.log(`  Expected location: ${path.resolve(cwd, "dist-local/public")}`);

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
