import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name) => readFileSync(new URL(`../../${name}`, import.meta.url), "utf8");
const http = read("deploy/nginx/sqr-error-pages-http.conf.example");
const server = read("deploy/nginx/sqr-error-pages-server.conf.example");
const headers = read("deploy/nginx/sqr-error-pages-response-headers.conf.example");
const example = read("deploy/nginx/sqr.conf.example");
const active = (text) => text.split(/\r?\n/).filter((line) => !line.trimStart().startsWith("#")).join("\n");

function block(source, marker) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `Missing ${marker}`);
  let depth = 0;
  for (let index = source.indexOf("{", start); index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unclosed ${marker}`);
}

test("edge HTML requires a safe document request and excludes API/realtime/private/static paths", () => {
  assert.match(http, /map \$request_method \$sqr_error_safe_method/);
  assert.match(http, /GET 1;\s*HEAD 1;/);
  assert.match(http, /map \$http_accept \$sqr_error_accepts_html/);
  assert.match(http, /map \$http_sec_fetch_dest \$sqr_error_document_destination/);
  assert.match(http, /document 1;/);
  assert.match(http, /api\|internal\|ws\|socket\\\.io\|telemetry\|assets\|uploads\|_sqr/);
  assert.match(http, /"1:1:1:1" html;/);
  assert.match(block(http, 'map "$sqr_error_safe_method:'), /default json;/);
  assert.doesNotMatch(active(http), /\$(?:args|request_uri|cookie_|http_authorization)/);
  assert.doesNotMatch(active(http), /\$(?:upstream_)?http_x_sqr_maintenance/);
});

test("edge handlers retain 502/503/504 and never intercept ordinary API errors", () => {
  const directives = active(server);
  assert.match(directives, /proxy_intercept_errors off;/);
  assert.doesNotMatch(directives, /proxy_intercept_errors on|error_page\s+(?:400|401|403|404|409|429|500)\b|=\s*200/);
  assert.match(directives, /error_page 502 \/_sqr\/errors\/502\.\$sqr_error_format;/);
  assert.match(directives, /error_page 503 \/_sqr\/errors\/503\.\$sqr_error_format;/);
  assert.match(directives, /error_page 504 \/_sqr\/errors\/504\.\$sqr_error_format;/);
  for (const status of [502, 503, 504]) {
    const json = block(server, `location = /_sqr/errors/${status}.json`);
    assert.match(json, /internal;/);
    assert.match(json, /default_type application\/json;/);
    assert.match(json, new RegExp(`return ${status} '`));
    const payload = JSON.parse(json.match(/return \d+ '([^']+)';/)[1]);
    assert.equal(payload.ok, false);
    assert.equal(payload.code, payload.error.code);
    assert.equal(payload.message, payload.error.message);
    assert.doesNotMatch(json, /proxy_pass|\$http_|\$uri|\$request|upstream/);
  }
});

test("static fallback is independent of Node and exposes only three asset paths", () => {
  for (const name of ["502", "503", "504", "maintenance"]) {
    const html = block(server, `location = /_sqr/errors/${name}.html`);
    assert.match(html, /internal;/);
    assert.ok(html.includes(`alias /var/www/sqr-errors/${name}.html;`));
    assert.match(html, /default_type text\/html;/);
    assert.match(html, /charset utf-8;/);
    assert.match(html, /etag off;/);
    assert.match(html, /include \/etc\/nginx\/snippets\/sqr-error-pages-response-headers\.conf;/);
    assert.doesNotMatch(html, /proxy_pass|try_files|return 200/);
  }
  assert.deepEqual([...server.matchAll(/location = \/_sqr\/errors\/assets\/([^ ]+)/g)].map((match) => match[1]), ["status.css", "status.js", "sqr-logo.svg"]);
  assert.match(block(server, "location ^~ /_sqr/errors/"), /return 404/);
  assert.doesNotMatch(active(server), /autoindex|\/uploads|current\/|dist-local/);
});

test("unknown error asset paths clear inherited MIME types without changing public asset types", () => {
  const fallback = active(block(server, "location ^~ /_sqr/errors/"));
  // default_type alone does not override inherited extension mappings such as .js/.css.
  assert.match(fallback, /\btypes\s*\{\s*\}/);
  assert.match(fallback, /default_type application\/json;/);
  const response = fallback.match(/return 404 '([^']+)';/);
  assert.ok(response, "Unknown error assets must return a JSON 404 response");
  assert.deepEqual(JSON.parse(response[1]), {
    ok: false,
    code: "NOT_FOUND",
    message: "Not found",
    error: { code: "NOT_FOUND", message: "Not found" },
  });
  for (const [name, contentType] of [
    ["status.css", "text/css"],
    ["status.js", "application/javascript"],
    ["sqr-logo.svg", "image/svg+xml"],
  ]) {
    const asset = active(block(server, `location = /_sqr/errors/assets/${name}`));
    assert.ok(asset.includes(`default_type ${contentType};`));
    assert.ok(asset.includes(`alias /var/www/sqr-errors/assets/${name};`));
    assert.doesNotMatch(asset, /\btypes\s*\{|return 404/);
  }
});

test("only static fallback owns its no-store and restrictive security headers", () => {
  assert.match(headers, /add_header Cache-Control "no-store" always;/);
  assert.match(headers, /add_header X-Content-Type-Options "nosniff" always;/);
  assert.match(headers, /default-src 'none'/);
  assert.match(headers, /script-src 'self'/);
  assert.match(headers, /connect-src 'self'/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.doesNotMatch(active(headers), /unsafe-inline|unsafe-eval|Retry-After|Strict-Transport-Security/);
  assert.match(example, /include \/etc\/nginx\/snippets\/sqr-error-pages-server\.conf;/);
  // Maps live in the existing conf.d HTTP glob. A second include would duplicate them.
  assert.doesNotMatch(active(example), /include \/etc\/nginx\/conf\.d\/sqr-error-pages-http\.conf;/);
  assert.doesNotMatch(active(example), /proxy_intercept_errors on/);
  for (const location of ["/api/", "= /api/login", "= /api/auth/login", "= /api/imports", "/ws", "^~ /assets/"]) {
    const body = block(example, `location ${location} {`);
    assert.doesNotMatch(body, /proxy_intercept_errors on|sqr-error-pages-response-headers/);
  }
});

test("error integration adds no rate-limit policy or competing maintenance toggle", () => {
  for (const source of [http, server, headers]) {
    assert.doesNotMatch(active(source), /limit_req|limit_conn|maintenance\.flag|if\s*\(-f|set\s+\$.*maintenance/);
  }
  const runner = read("scripts/test-system-status-nginx.mjs");
  assert.match(runner, /listen\(port, "127\.0\.0\.1"\)/);
  assert.match(runner, /windowsHide: true/);
  assert.match(runner, /await stopFixture\(\); \/\/ truly unavailable Node upstream/);
  assert.match(runner, /WebSocketServer/);
  assert.match(runner, /transport=polling/);
  assert.doesNotMatch(runner, /dotenv|systemctl|taskkill|Stop-Process|139\.180\.|https:\/\/sqr-system/);
});
