import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJsonTestApp, startTestServer, stopTestServer } from "../../routes/tests/http-test-utils";
import { buildRobotsTxt, registerFrontendStatic } from "../frontend-static";

test("frontend static serves robots.txt and sitemap.xml while keeping SPA fallback for routes only", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sqr-frontend-static-"));
  const publicDir = path.join(tempRoot, "public");
  const assetsDir = path.join(publicDir, "assets");
  const robotsBody = buildRobotsTxt("https://example.test/app");
  const sitemapBody = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://sqr-system.com/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;
  const immutableAssetBody = "console.log('asset');\n".repeat(128);

  await fs.mkdir(publicDir, { recursive: true });
  await fs.mkdir(assetsDir, { recursive: true });
  await fs.writeFile(path.join(publicDir, "index.html"), "<!doctype html><html><body><div id=\"root\"></div></body></html>");
  await fs.writeFile(path.join(publicDir, "robots.txt"), "User-agent: *\nDisallow: /\n", "utf8");
  await fs.writeFile(path.join(publicDir, "sitemap.xml"), sitemapBody, "utf8");
  await fs.writeFile(path.join(assetsDir, "app-ABC12345.js"), immutableAssetBody, "utf8");

  const app = createJsonTestApp();
  registerFrontendStatic(app, {
    cwd: tempRoot,
    paths: ["public"],
    publicAppUrl: "https://example.test/app",
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
  const robotsResponse = await fetch(`${baseUrl}/robots.txt`);
    assert.equal(robotsResponse.status, 200);
    assert.match(String(robotsResponse.headers.get("content-type") || ""), /^text\/plain\b/i);
    assert.equal(await robotsResponse.text(), robotsBody);
    assert.match(robotsBody, /User-agent: \*\nAllow: \/\n/);
    assert.match(robotsBody, /Disallow: \/login\n/);
    assert.match(robotsBody, /Disallow: \/api\/\n/);
    assert.doesNotMatch(robotsBody, /^Disallow: \/$/m);

    const sitemapResponse = await fetch(`${baseUrl}/sitemap.xml`);
    assert.equal(sitemapResponse.status, 200);
    assert.match(String(sitemapResponse.headers.get("content-type") || ""), /(?:text|application)\/xml\b/i);
    assert.equal(await sitemapResponse.text(), sitemapBody);

    const routeResponse = await fetch(`${baseUrl}/viewer`);
    assert.equal(routeResponse.status, 200);
    assert.match(await routeResponse.text(), /<div id="root"><\/div>/i);

    const immutableAssetResponse = await fetch(`${baseUrl}/assets/app-ABC12345.js`, {
      headers: {
        "accept-encoding": "gzip",
      },
    });
    assert.equal(immutableAssetResponse.status, 200);
    assert.equal(await immutableAssetResponse.text(), immutableAssetBody);
    assert.equal(
      immutableAssetResponse.headers.get("cache-control"),
      "public, max-age=31536000, immutable",
    );
    assert.equal(immutableAssetResponse.headers.get("content-encoding"), "gzip");
    assert.match(String(immutableAssetResponse.headers.get("vary") || ""), /accept-encoding/i);

    const missingAssetResponse = await fetch(`${baseUrl}/missing.xml`);
    assert.equal(missingAssetResponse.status, 404);

    assert.notEqual(
      robotsResponse.headers.get("cache-control"),
      "public, max-age=31536000, immutable",
    );
  } finally {
    await stopTestServer(server);
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("frontend static skips configured paths outside the working directory", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sqr-frontend-static-root-"));
  const siblingRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sqr-frontend-static-outside-"));
  const publicDir = path.join(siblingRoot, "public");
  await fs.mkdir(publicDir, { recursive: true });
  await fs.writeFile(path.join(publicDir, "index.html"), "<!doctype html><html><body>outside</body></html>");

  const app = createJsonTestApp();
  registerFrontendStatic(app, {
    cwd: tempRoot,
    paths: [path.relative(tempRoot, publicDir)],
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/`);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(response.headers.get("content-type") || "", /text\/html/);
    const body = await response.text();
    assert.match(body, /SQR/);
    assert.doesNotMatch(body, /outside|Frontend Not Built|build:local|dist-local|nginx|Node\.js|PM2/i);
    const missingApi = await fetch(`${baseUrl}/api/missing`, { signal: AbortSignal.timeout(2000) });
    assert.equal(missingApi.status, 404);
    assert.equal((await missingApi.json()).error.code, "NOT_FOUND");
    const missingSocket = await fetch(`${baseUrl}/ws`, { signal: AbortSignal.timeout(2000) });
    assert.equal(missingSocket.status, 404);
    assert.doesNotMatch(await missingSocket.text(), /Kod: 503/);
  } finally {
    await stopTestServer(server);
    await fs.rm(tempRoot, { recursive: true, force: true });
    await fs.rm(siblingRoot, { recursive: true, force: true });
  }
});

test("document HTTP status agrees with client routes without intercepting APIs, assets, methods or realtime", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sqr-document-status-"));
  await fs.mkdir(path.join(tempRoot, "public"));
  await fs.writeFile(path.join(tempRoot, "public", "index.html"), '<!doctype html><html><head></head><body id="sqr-shell"></body></html>');
  const app = createJsonTestApp();
  for (const code of [400, 401, 403, 404, 409, 429, 500, 502, 503, 504]) {
    app.get(`/api/test-${code}`, (_req, res) => res.status(code).json({ code }));
  }
  app.get("/ws/health", (_req, res) => res.status(204).end());
  registerFrontendStatic(app, { cwd: tempRoot, paths: ["public"] });
  const { server, baseUrl } = await startTestServer(app);
  try {
    for (const route of ["/", "/login", "/reset-password?token=synthetic", "/settings?section=backup-restore", "/viewer", "/general-search", "/monitor?section=audit", "/collection/save", "/collection/records", "/collection/nicknames", "/collection/nickname-summary", "/collection/daily", "/collection/billing-principal", "/collection/monthly-comparison", "/collection/summary"]) {
      const response = await fetch(`${baseUrl}${route}`);
      assert.equal(response.status, 200, route);
      assert.match(await response.text(), /sqr-shell/);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    for (const route of ["/404", "/unknown-page", "/collection/unknown", "/collection/daily-typo", "/apiculture", "/wsoops"]) {
      for (const method of ["GET", "HEAD"]) {
        const response = await fetch(`${baseUrl}${route}`, { method });
        assert.equal(response.status, 404, `${method} ${route}`);
        assert.match(response.headers.get("content-type") || "", /text\/html/);
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.equal(method === "HEAD" ? await response.text() : "", "");
      }
    }
    for (const route of ["/api", "/API/missing", "/api/missing", "/internal/missing"]) {
      const response = await fetch(`${baseUrl}${route}`);
      assert.equal(response.status, 404);
      assert.equal((await response.json()).error.code, "NOT_FOUND");
    }
    for (const code of [400, 401, 403, 404, 409, 429, 500, 502, 503, 504]) {
      const response = await fetch(`${baseUrl}/api/test-${code}`);
      assert.equal(response.status, code);
      assert.deepEqual(await response.json(), { code });
    }
    for (const route of ["/assets/missing.js", "/ws", "/socket.io/"]) {
      const response = await fetch(`${baseUrl}${route}`);
      assert.equal(response.status, 404);
      assert.doesNotMatch(await response.text(), /sqr-shell/);
    }
    assert.equal((await fetch(`${baseUrl}/ws/health`)).status, 204);
    const post = await fetch(`${baseUrl}/unknown-page`, { method: "POST" });
    assert.equal(post.status, 404);
    assert.doesNotMatch(await post.text(), /sqr-shell/);
  } finally {
    await stopTestServer(server);
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
