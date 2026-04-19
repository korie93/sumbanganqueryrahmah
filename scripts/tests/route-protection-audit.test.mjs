import assert from "node:assert/strict";
import test from "node:test";
import {
  auditRouteProtection,
  extractRouteProtectionEntries,
} from "../verify-route-protection.mjs";

test("route protection audit classifies protected, public, and suspicious routes conservatively", () => {
  const sourceText = `
    app.get("/api/search/global", authenticateToken, asyncHandler(searchController.searchGlobal));
    app.post("/api/auth/login", rateLimiters.login, handleLogin);
    app.get("/api/reports/export", asyncHandler(reportController.exportReport));
    app.post("/telemetry/web-vitals", routeHandler(reportWebVital));
  `;

  const result = extractRouteProtectionEntries(sourceText, "server/routes/example.ts");

  assert.deepEqual(
    result.entries.map((entry) => ({
      method: entry.method,
      path: entry.path,
      status: entry.status,
    })),
    [
      { method: "GET", path: "/api/search/global", status: "protected" },
      { method: "POST", path: "/api/auth/login", status: "public" },
      { method: "GET", path: "/api/reports/export", status: "suspicious-unprotected" },
      { method: "POST", path: "/telemetry/web-vitals", status: "public" },
    ],
  );
  assert.equal(result.parseErrors.length, 0);
});

test("route protection audit reports no suspicious protected-route gaps in the reviewed route tree", () => {
  const audit = auditRouteProtection();

  assert.equal(audit.parseErrors.length, 0);
  assert.deepEqual(
    audit.suspiciousEntries.map((entry) => `${entry.method} ${entry.path}`),
    [],
  );
});
