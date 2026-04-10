import { readFileSync } from "node:fs";
import path from "node:path";

export const COLLECTION_PII_ROLLOUT_CONTRACT_REQUIREMENTS = Object.freeze([
  {
    filePath: ".env.example",
    checks: Object.freeze([
      {
        label: "documents dedicated collection PII encryption key placeholder",
        snippet: "COLLECTION_PII_ENCRYPTION_KEY=GENERATE_ME_COLLECTION_PII_KEY_DO_NOT_REUSE_SESSION_SECRET",
      },
      {
        label: "documents staged retired-field rollout examples",
        snippet: "# Example staged sensitive retirement: COLLECTION_PII_RETIRED_FIELDS=icNumber,customerPhone,accountNumber",
      },
      {
        label: "retains retired fields env placeholder",
        snippet: "COLLECTION_PII_RETIRED_FIELDS=",
      },
    ]),
  },
  {
    filePath: "shared/schema-postgres-collection.ts",
    checks: Object.freeze([
      {
        label: "stores encrypted customer name shadow column",
        snippet: "customerNameEncrypted: text(\"customer_name_encrypted\"),",
      },
      {
        label: "stores customer name blind-index columns",
        snippet: "customerNameSearchHashes: text(\"customer_name_search_hashes\").array(),",
      },
      {
        label: "stores encrypted ic shadow column",
        snippet: "icNumberEncrypted: text(\"ic_number_encrypted\"),",
      },
      {
        label: "stores ic blind-index column",
        snippet: "icNumberSearchHash: text(\"ic_number_search_hash\"),",
      },
      {
        label: "stores encrypted phone shadow column",
        snippet: "customerPhoneEncrypted: text(\"customer_phone_encrypted\"),",
      },
      {
        label: "stores phone blind-index column",
        snippet: "customerPhoneSearchHash: text(\"customer_phone_search_hash\"),",
      },
      {
        label: "stores encrypted account shadow column",
        snippet: "accountNumberEncrypted: text(\"account_number_encrypted\"),",
      },
      {
        label: "stores account blind-index column",
        snippet: "accountNumberSearchHash: text(\"account_number_search_hash\"),",
      },
    ]),
  },
  {
    filePath: "server/config/runtime-env-schema.ts",
    checks: Object.freeze([
      {
        label: "parses COLLECTION_PII_RETIRED_FIELDS env",
        snippet: "COLLECTION_PII_RETIRED_FIELDS: optionalCollectionPiiRetiredFieldsEnv(",
      },
      {
        label: "requires encryption key when retired fields env is set",
        snippet: "message: \"COLLECTION_PII_ENCRYPTION_KEY is required when COLLECTION_PII_RETIRED_FIELDS is set.\",",
      },
    ]),
  },
  {
    filePath: "server/internal/server-startup.ts",
    checks: Object.freeze([
      {
        label: "imports collection PII retirement startup guard",
        snippet: "import { assertCollectionPiiRetirementStartupReady } from \"./collection-pii-retirement-startup\";",
      },
      {
        label: "runs collection PII retirement startup guard",
        snippet: "await assertCollectionPiiRetirementStartupReady();",
      },
      {
        label: "marks startup failure with dedicated retirement reason",
        snippet: "startupReason: \"COLLECTION_PII_RETIREMENT_BLOCKED\"",
      },
    ]),
  },
  {
    filePath: "server/internal/collection-pii-retirement-startup.ts",
    checks: Object.freeze([
      {
        label: "exports startup readiness assertion",
        snippet: "export async function assertCollectionPiiRetirementStartupReady(params?: {",
      },
      {
        label: "blocks retired field startup when plaintext still remains",
        snippet: "COLLECTION_PII_RETIRED_FIELDS is enabled for collection fields that are not ready for retired-field runtime enforcement.",
      },
      {
        label: "reports unreadable encrypted shadows during startup checks",
        snippet: "Unreadable encrypted shadow counts:",
      },
    ]),
  },
  {
    filePath: "server/repositories/collection-pii-select-utils.ts",
    checks: Object.freeze([
      {
        label: "exports protected collection PII select helper",
        snippet: "export function buildProtectedCollectionPiiSelect(",
      },
      {
        label: "omits plaintext for retired fields",
        snippet: "return sql.raw(`NULL AS \"${aliasName}\"`);",
      },
      {
        label: "suppresses plaintext when encrypted shadow exists",
        snippet: "WHEN NULLIF(trim(COALESCE(${encryptedColumnName}, '')), '') IS NOT NULL THEN NULL",
      },
    ]),
  },
  {
    filePath: "server/repositories/backups-payload-utils.ts",
    checks: Object.freeze([
      {
        label: "backup export uses protected customer name select",
        snippet: "buildProtectedCollectionPiiSelect(\"customer_name\", \"customer_name_encrypted\", \"customerName\", \"customerName\")",
      },
      {
        label: "backup export uses protected ic select",
        snippet: "buildProtectedCollectionPiiSelect(\"ic_number\", \"ic_number_encrypted\", \"icNumber\", \"icNumber\")",
      },
      {
        label: "backup export uses protected phone select",
        snippet: "buildProtectedCollectionPiiSelect(\"customer_phone\", \"customer_phone_encrypted\", \"customerPhone\", \"customerPhone\")",
      },
      {
        label: "backup export uses protected account select",
        snippet: "buildProtectedCollectionPiiSelect(\"account_number\", \"account_number_encrypted\", \"accountNumber\", \"accountNumber\")",
      },
    ]),
  },
  {
    filePath: "scripts/collection-pii-rollout-readiness.ts",
    checks: Object.freeze([
      {
        label: "rollout readiness enforces zero unreadable encrypted shadows",
        snippet: "requireZeroUnreadableEncryptedShadow: true,",
      },
      {
        label: "rollout readiness points to staged sensitive retirement helper",
        snippet: "Run 'npm run collection:retire-sensitive-pii' first, then 'npm run collection:retire-sensitive-pii -- --apply' for icNumber, customerPhone, and accountNumber.",
      },
      {
        label: "rollout readiness points to full retirement cleanup",
        snippet: "All tracked collection PII fields are clean. The final step is removing plaintext compatibility from the runtime/schema migration plan.",
      },
    ]),
  },
  {
    filePath: "scripts/release-readiness-local.mjs",
    checks: Object.freeze([
      {
        label: "release readiness captures collection PII status",
        snippet: "[\"run\", \"collection:pii-status\", \"--\", \"--json\"]",
      },
      {
        label: "release readiness captures rollout readiness",
        snippet: "[\"run\", \"collection:rollout-readiness\", \"--\", \"--json\"]",
      },
      {
        label: "release readiness can verify sensitive retirement gate",
        snippet: "await runNpm([\"run\", \"collection:verify-pii-sensitive-retirement\"], { env });",
      },
      {
        label: "release readiness can verify retired fields gate",
        snippet: "await runNpm([\"run\", \"collection:verify-pii-retired-fields\"], { env });",
      },
      {
        label: "release readiness can verify full retirement gate",
        snippet: "await runNpm([\"run\", \"collection:verify-pii-full-retirement\"], { env });",
      },
    ]),
  },
  {
    filePath: "package.json",
    checks: Object.freeze([
      {
        label: "package exposes collection PII status script",
        snippet: "\"collection:pii-status\": \"tsx scripts/collection-pii-status.ts\",",
      },
      {
        label: "package exposes rollout readiness script",
        snippet: "\"collection:rollout-readiness\": \"tsx scripts/collection-pii-rollout-readiness.ts\",",
      },
      {
        label: "package exposes sensitive retirement verify script",
        snippet: "\"collection:verify-pii-sensitive-retirement\": \"tsx scripts/collection-pii-status.ts --fields icNumber,customerPhone,accountNumber --require-zero-plaintext --require-zero-redactable --require-zero-rewrite\",",
      },
      {
        label: "package exposes retired fields verify script",
        snippet: "\"collection:verify-pii-retired-fields\": \"tsx scripts/collection-pii-status.ts --fields-env COLLECTION_PII_RETIRED_FIELDS --require-zero-plaintext --require-zero-redactable --require-zero-rewrite\",",
      },
      {
        label: "package exposes full retirement verify script",
        snippet: "\"collection:verify-pii-full-retirement\": \"tsx scripts/collection-pii-status.ts --require-zero-plaintext --require-zero-redactable --require-zero-rewrite\",",
      },
      {
        label: "package exposes sensitive retirement apply helper",
        snippet: "\"collection:retire-sensitive-pii\": \"tsx scripts/retire-sensitive-collection-pii.ts\",",
      },
      {
        label: "package exposes retired fields apply helper",
        snippet: "\"collection:retire-retired-fields-pii\": \"tsx scripts/retire-retired-collection-pii.ts\",",
      },
      {
        label: "package exposes plaintext redaction helper",
        snippet: "\"collection:redact-plaintext-pii\": \"tsx scripts/redact-collection-pii-plaintext.ts\",",
      },
    ]),
  },
]);

export function loadCollectionPiiRolloutContractFiles({
  cwd = process.cwd(),
  requirements = COLLECTION_PII_ROLLOUT_CONTRACT_REQUIREMENTS,
} = {}) {
  return Object.fromEntries(
    requirements.map((requirement) => {
      const absolutePath = path.resolve(cwd, requirement.filePath);
      try {
        return [requirement.filePath, readFileSync(absolutePath, "utf8")];
      } catch {
        return [requirement.filePath, null];
      }
    }),
  );
}

export function validateCollectionPiiRolloutContract({
  filesByPath = {},
  requirements = COLLECTION_PII_ROLLOUT_CONTRACT_REQUIREMENTS,
} = {}) {
  const failures = [];
  let checkedFileCount = 0;
  let checkedSnippetCount = 0;
  const snippetCount = requirements.reduce((total, requirement) => total + requirement.checks.length, 0);

  for (const requirement of requirements) {
    const text = filesByPath[requirement.filePath];
    if (typeof text !== "string") {
      failures.push(`Missing required collection PII rollout contract file: ${requirement.filePath}`);
      continue;
    }

    checkedFileCount += 1;

    for (const check of requirement.checks) {
      checkedSnippetCount += 1;
      if (!text.includes(check.snippet)) {
        failures.push(`${requirement.filePath} missing rollout marker: ${check.label}`);
      }
    }
  }

  return {
    failures,
    summary: {
      fileCount: requirements.length,
      checkedFileCount,
      snippetCount,
      checkedSnippetCount,
    },
  };
}

export function formatCollectionPiiRolloutContractReport(validation) {
  const lines = [
    `Collection PII rollout contract check inspected ${validation.summary.fileCount} files and ${validation.summary.snippetCount} rollout markers.`,
  ];

  if (validation.failures.length > 0) {
    lines.push("Failures:");
    for (const failure of validation.failures) {
      lines.push(`- ${failure}`);
    }
  } else {
    lines.push("All checked collection PII protections, rollout helpers, and startup/release guards are still wired.");
  }

  return lines.join("\n");
}
