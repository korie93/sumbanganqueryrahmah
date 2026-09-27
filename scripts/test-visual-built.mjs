import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { access, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const osEnvironmentKeys = ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "TMPDIR", "COMSPEC", "PATHEXT", "USERPROFILE", "HOME"];
const contentTypes = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".avif": "image/avif", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
};

export function parseVisualBuiltArgs(args) {
  const forwarded = [];
  let update = false;
  let grep = false;
  let workers = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--update-snapshots" && !update) {
      update = true;
      forwarded.push(arg);
    } else if (arg === "--workers=1" && !workers) {
      workers = true;
      forwarded.push(arg);
    } else if (arg === "--grep" && !grep) {
      const value = args[++index];
      assert.ok(typeof value === "string" && value.length > 0 && value.length <= 200
        && !value.startsWith("-") && !/[\0\r\n]/.test(value), "--grep requires one bounded test-name expression");
      assert.doesNotThrow(() => new RegExp(value), "--grep must be a valid expression");
      grep = true;
      forwarded.push(arg, value);
    } else {
      assert.fail("Allowed options: --update-snapshots, --grep <expression>, --workers=1 (each once)");
    }
  }
  return forwarded;
}

export function buildVisualBuiltEnvironment(inherited, baseUrl, disabledDotenvPath) {
  const url = new URL(baseUrl);
  assert.equal(url.origin, baseUrl);
  assert.equal(url.protocol, "http:");
  assert.equal(url.hostname, "127.0.0.1");
  assert.ok(url.port && !url.username && !url.password);
  assert.ok(path.isAbsolute(disabledDotenvPath));
  return {
    ...Object.fromEntries(osEnvironmentKeys.filter((key) => inherited[key]).map((key) => [key, inherited[key]])),
    NODE_ENV: "test", DOTENV_CONFIG_PATH: disabledDotenvPath, VISUAL_BASE_URL: baseUrl,
    // The snapshots use synthetic route fixtures. Unexpected database access
    // must fail closed, never fall back to a developer's PostgreSQL database.
    PG_HOST: "127.0.0.1", PG_PORT: "1", PG_USER: "visual_no_database", PG_DATABASE: "visual_no_database",
  };
}

/** Static files plus extensionless SPA routes; no backend, proxy, config or dotenv loading. */
export async function startVisualBuiltServer(publicDirectory) {
  const root = await realpath(publicDirectory);
  const indexFile = await realpath(path.join(root, "index.html"));
  const inside = (file) => file.startsWith(`${root}${path.sep}`);
  assert.ok(inside(indexFile) && (await stat(indexFile)).isFile(), "Built index must be a file inside the public directory");
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (!["GET", "HEAD"].includes(request.method)) return void response.writeHead(405).end();
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://fixture.invalid").pathname);
      const segments = pathname.split("/");
      if (pathname.includes("\\") || pathname.includes("\0") || segments.some((part) => part.startsWith("."))
        || segments[1] === "api" || segments[1] === "ws") return void response.writeHead(404).end();
      const requestedFile = path.resolve(root, pathname.slice(1));
      if (requestedFile !== root && !inside(requestedFile)) return void response.writeHead(404).end();
      const extension = path.extname(requestedFile).toLowerCase();
      const resolved = extension ? await realpath(requestedFile) : indexFile;
      if (!inside(resolved) || !(await stat(resolved)).isFile()) return void response.writeHead(404).end();
      const type = contentTypes[path.extname(resolved).toLowerCase()];
      if (!type) return void response.writeHead(404).end();
      response.setHeader("Content-Type", type);
      response.writeHead(200).end(request.method === "HEAD" ? undefined : await readFile(resolved));
    } catch {
      response.writeHead(404).end();
    }
  });
  server.on("upgrade", (_request, socket) => socket.destroy());
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}

export async function runVisualBuilt(args = process.argv.slice(2)) {
  const forwarded = parseVisualBuiltArgs(args);
  const publicDirectory = path.join(repoRoot, "dist-local/public");
  const cliPath = path.join(repoRoot, "node_modules/playwright/cli.js");
  assert.equal(await realpath(cliPath), path.resolve(cliPath), "Use the installed workspace Playwright CLI");
  assert.ok((await stat(cliPath)).isFile());
  const disabledDotenvPath = path.join(publicDirectory, "no-visual-dotenv.env");
  await assert.rejects(access(disabledDotenvPath), { code: "ENOENT" });
  const server = await startVisualBuiltServer(publicDirectory);
  console.log(`Built visual preview: ${server.origin} (static frontend only)`);
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [cliPath, "test", "tests/visual/", ...forwarded], {
        cwd: repoRoot, env: buildVisualBuiltEnvironment(process.env, server.origin, disabledDotenvPath),
        shell: false, windowsHide: true, stdio: "inherit",
      });
      child.once("error", reject);
      child.once("exit", (code) => resolve(code ?? 1));
    });
  } finally {
    await server.close();
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  runVisualBuilt().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
