import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJsonTestApp, startTestServer, stopTestServer } from "../../routes/tests/http-test-utils";
import { registerFrontendStatic } from "../frontend-static";

test("frontend static serves robots.txt and sitemap.xml while keeping SPA fallback for routes only", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sqr-frontend-static-"));
  const publicDir = path.join(tempRoot, "public");
  const robotsBody = "User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /uploads/\nDisallow: /ws\nDisallow: /login\nDisallow: /forgot-password\nDisallow: /activate-account\nDisallow: /reset-password\nDisallow: /change-password\nDisallow: /maintenance\nDisallow: /403\nDisallow: /banned\nSitemap: https://sqr-system.com/sitemap.xml\n";
  const sitemapBody = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://sqr-system.com/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;

  await fs.mkdir(publicDir, { recursive: true });
  await fs.writeFile(path.join(publicDir, "index.html"), "<!doctype html><html><body><div id=\"root\"></div></body></html>");
  await fs.writeFile(path.join(publicDir, "robots.txt"), robotsBody, "utf8");
  await fs.writeFile(path.join(publicDir, "sitemap.xml"), sitemapBody, "utf8");

  const app = createJsonTestApp();
  registerFrontendStatic(app, {
    cwd: tempRoot,
    paths: ["public"],
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const robotsResponse = await fetch(`${baseUrl}/robots.txt`);
    assert.equal(robotsResponse.status, 200);
    assert.match(String(robotsResponse.headers.get("content-type") || ""), /^text\/plain\b/i);
    assert.equal(await robotsResponse.text(), robotsBody);

    const sitemapResponse = await fetch(`${baseUrl}/sitemap.xml`);
    assert.equal(sitemapResponse.status, 200);
    assert.match(String(sitemapResponse.headers.get("content-type") || ""), /(?:text|application)\/xml\b/i);
    assert.equal(await sitemapResponse.text(), sitemapBody);

    const routeResponse = await fetch(`${baseUrl}/viewer`);
    assert.equal(routeResponse.status, 200);
    assert.match(await routeResponse.text(), /<div id="root"><\/div>/i);

    const missingAssetResponse = await fetch(`${baseUrl}/missing.xml`);
    assert.equal(missingAssetResponse.status, 404);
  } finally {
    await stopTestServer(server);
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
