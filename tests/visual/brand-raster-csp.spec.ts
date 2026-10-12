import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

test("brand migration raster-backed icons paint real pixels under unchanged strict status CSP", async ({ page }) => {
  const headers = readFileSync("deploy/nginx/sqr-error-pages-response-headers.conf.example", "utf8");
  const csp = /add_header Content-Security-Policy "([^"]+)" always/.exec(headers)?.[1];
  expect(csp).toBeTruthy();
  const assets = new Map<string, { type: string; body: string | Buffer }>();
  for (const [name, file] of [["status", "deploy/errors/assets/sqr-logo.svg"], ["favicon", "client/public/brand/favicon.svg"]]) {
    const svg = readFileSync(file!, "utf8");
    const embedded = /href="data:(image\/(?:png|webp));base64,([^"]+)"/.exec(svg);
    expect(embedded).not.toBeNull();
    assets.set(`/${name}.svg`, { type: "image/svg+xml", body: svg });
    assets.set(`/${name}.raster`, { type: embedded![1]!, body: Buffer.from(embedded![2]!, "base64") });
  }
  const server = createServer((req, res) => {
    res.setHeader("Content-Security-Policy", csp!);
    res.setHeader("X-Content-Type-Options", "nosniff");
    const asset = assets.get(req.url!);
    res.setHeader("Content-Type", asset?.type ?? "text/html; charset=utf-8");
    res.end(asset?.body ?? "<!doctype html><html lang=en><title>Local brand CSP proof</title><body></body></html>");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  expect(address && typeof address === "object").toBeTruthy();
  const errors: string[] = [];
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  try {
    await page.goto(`http://127.0.0.1:${(address as { port: number }).port}`);
    for (const name of ["status", "favicon"]) {
      const result = await page.evaluate(async (name) => {
        async function pixels(url: string) {
          const img = new Image(); img.src = url; await img.decode();
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d")!; ctx.drawImage(img, 0, 0);
          return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        }
        const svg = await pixels(`/${name}.svg`), raster = await pixels(`/${name}.raster`);
        return { painted: svg.some((v, i) => i % 4 === 3 && v > 0), identical: svg.length === raster.length && svg.every((v, i) => v === raster[i]) };
      }, name);
      expect(result, name).toEqual({ painted: true, identical: true });
    }
    expect(errors).toEqual([]);
  } finally {
    await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
  }
});
