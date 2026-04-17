import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const serverRoot = path.join(repoRoot, "server");

const REVIEWED_BARE_CATCH_COUNTS = {
  "server/auth/session-cookie.ts": 1,
  "server/auth/two-factor.ts": 1,
  "server/config/runtime-config-read-utils.ts": 2,
  "server/config/runtime-environment.ts": 1,
  "server/config/runtime.ts": 1,
  "server/controllers/imports.controller.ts": 1,
  "server/index-local.ts": 1,
  "server/intelligence/anomaly/AnomalyEngine.ts": 1,
  "server/intelligence/control/ControlEngine.ts": 1,
  "server/intelligence/correlation/CorrelationEngine.ts": 1,
  "server/intelligence/learning/StabilityDnaEngine.ts": 2,
  "server/internal/ai-bootstrap-schema.ts": 1,
  "server/internal/backupMetadata.ts": 1,
  "server/internal/cluster-master-orchestrator.ts": 1,
  "server/internal/cluster-master-shutdown.ts": 1,
  "server/internal/cluster-worker-runtime.ts": 1,
  "server/internal/local-server-route-registration.ts": 1,
  "server/internal/runtime-config-manager.ts": 1,
  "server/internal/runtime-monitor-manager.ts": 2,
  "server/lib/collection-pii-encryption-crypto.ts": 1,
  "server/lib/collection-pii-encryption.ts": 2,
  "server/lib/collection-receipt-external-scan-paths.ts": 1,
  "server/lib/collection-receipt-files.ts": 1,
  "server/mail/dev-mail-outbox.ts": 4,
  "server/repositories/ai-branch-lookup-query-utils.ts": 1,
  "server/repositories/ai-category-json-utils.ts": 2,
  "server/repositories/ai-repository-mappers.ts": 1,
  "server/repositories/ai-search-record-utils.ts": 1,
  "server/repositories/backups-encryption.ts": 1,
  "server/repositories/imports.repository.ts": 1,
  "server/repositories/search-repository-shared.ts": 1,
  "server/routes/collection/collection-route-handler-factories.ts": 1,
  "server/services/ai-search-branch-lookup-utils.ts": 2,
  "server/services/ai-search-candidate-resolution-utils.ts": 1,
  "server/services/ai-search-intent-utils.ts": 1,
  "server/services/ai-search-io-utils.ts": 1,
  "server/services/ai-search-query-intent-utils.ts": 1,
  "server/services/ai-search-query-row-utils.ts": 1,
  "server/services/ai-search-query-shared.ts": 1,
  "server/services/auth-account-login-guard-utils.ts": 1,
  "server/services/auth-account-self-two-factor-operations.ts": 3,
  "server/services/category-stats.service.ts": 1,
  "server/services/collection/collection-record-mutation-support.ts": 2,
  "server/services/collection/collection-record-read-shared.ts": 1,
  "server/services/collection/collection-record-receipt-mutation-utils.ts": 1,
  "server/services/imports-service-parsers.ts": 1,
  "server/ws/ws-runtime-utils.ts": 2,
};

function collectBareCatchCounts(dirPath, counts = new Map()) {
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectBareCatchCounts(fullPath, counts);
      continue;
    }

    if (!entry.isFile() || !fullPath.endsWith(".ts")) {
      continue;
    }

    const source = readFileSync(fullPath, "utf8");
    const matches = source.match(/catch\s*\{/g);
    if (!matches?.length) {
      continue;
    }

    counts.set(
      path.relative(repoRoot, fullPath).replace(/\\/g, "/"),
      matches.length,
    );
  }

  return counts;
}

test("server bare catch blocks stay limited to the reviewed fallback sites", () => {
  const actualCounts = Object.fromEntries(
    Array.from(collectBareCatchCounts(serverRoot).entries()).sort((left, right) =>
      left[0].localeCompare(right[0]),
    ),
  );

  assert.deepEqual(actualCounts, REVIEWED_BARE_CATCH_COUNTS);
});
