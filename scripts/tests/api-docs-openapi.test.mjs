import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const openApiPath = path.resolve(repoRoot, "docs", "openapi.public.json");

test("generated OpenAPI document stays limited to reviewed public client routes", () => {
  const openApiDocument = JSON.parse(readFileSync(openApiPath, "utf8"));

  assert.equal(openApiDocument.openapi, "3.1.0");
  assert.equal(typeof openApiDocument.paths["/api/imports"], "object");
  assert.equal(typeof openApiDocument.paths["/api/search/global"], "object");
  assert.equal(typeof openApiDocument.paths["/api/imports/{id}/data"], "object");
  assert.equal(openApiDocument.paths["/internal/alerts"], undefined);
  assert.equal(openApiDocument.paths["/api/debug/websocket-clients"], undefined);
  assert.equal(typeof openApiDocument.components.schemas.ApiError, "object");
});
