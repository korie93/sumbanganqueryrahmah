import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const nginxConfigPath = path.join(repoRoot, "deploy", "nginx", "sqr.conf.example");

function readNginxConfig() {
  return fs.readFileSync(nginxConfigPath, "utf8");
}

function extractLocationBlock(configText, locationPrefix) {
  const normalizedLocation = `location ${locationPrefix}`;
  const startIndex = configText.indexOf(normalizedLocation);
  assert.notEqual(startIndex, -1, `Expected ${normalizedLocation} block to exist.`);

  const openingBraceIndex = configText.indexOf("{", startIndex);
  assert.notEqual(openingBraceIndex, -1, `Expected ${normalizedLocation} block to have an opening brace.`);

  let depth = 1;
  for (let index = openingBraceIndex + 1; index < configText.length; index += 1) {
    const character = configText[index];
    if (character === "{") {
      depth += 1;
      continue;
    }
    if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return configText.slice(openingBraceIndex + 1, index);
      }
    }
  }

  throw new Error(`Expected ${normalizedLocation} block to have a matching closing brace.`);
}

test("nginx production example keeps a dedicated websocket handshake rate-limit zone", () => {
  const configText = readNginxConfig();

  assert.match(
    configText,
    /limit_req_zone \$binary_remote_addr zone=sqr_ws_per_ip:10m rate=20r\/m;/,
  );
});

test("nginx production example keeps reverse-proxy body size aligned with the reviewed import limit", () => {
  const configText = readNginxConfig();

  assert.match(
    configText,
    /client_max_body_size 96M;/,
  );
});

test("nginx websocket location applies rate limiting and forwarded host headers", () => {
  const configText = readNginxConfig();
  const websocketLocationBlock = extractLocationBlock(configText, "/ws");

  assert.match(
    websocketLocationBlock,
    /limit_req zone=sqr_ws_per_ip burst=10 nodelay;/,
  );
  assert.match(
    websocketLocationBlock,
    /proxy_set_header X-Forwarded-Host \$host;/,
  );
  assert.match(
    websocketLocationBlock,
    /proxy_set_header X-Forwarded-Proto https;/,
  );
});
