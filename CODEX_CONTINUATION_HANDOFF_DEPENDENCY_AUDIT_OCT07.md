# Dependency security and audit gate — 2026-10-07

## Scope and authority

The user approved local dependency remediation and CI audit hardening after
the production post-deployment audit reported 11 runtime package findings.
A fresh complete local audit reported 14 package findings, including build
dependencies. These counts are not evidence of exploitation.

The implementation task originally excluded commit, push and deployment. On
2026-10-08 the user separately authorized commit and push of the completed work;
the dependency/audit and General Search patches are grouped as separate commits.
Server deployment remains outside that authorization. Production was last
verified on `7e99b17a51b4a2dc86d54c28eececa142dce85c2`. No production
connection, database migration, data cleanup or account mutation was performed
for this fix. Preserve all working-tree changes when continuing.

## Changes

- Exact runtime pins: `compression@1.8.2`, OpenTelemetry auto-instrumentations
  `0.79.0`, SDK and OTLP HTTP exporter `0.221.0`.
- Compatible lockfile patches: `proxy-addr@2.0.8`, `source-map-js@1.2.2`.
- Remove unused `@tailwindcss/typography` and its vulnerable parser chain.
  No plugin registration or application `prose` consumers were found.
- Review the resolved `protobufjs@7.6.6` postinstall and update only its existing
  version-specific lifecycle permission. No new override or advisory exception.
- The audit wrapper now requires valid process completion and a complete npm
  audit v2 report. Empty/truncated/error output, inconsistent counts, malformed
  findings, dangling references and advisory-free cycles fail closed. Preserve
  the existing moderate+ failure threshold and low/info policy.
- Audit execution is bounded to 120 seconds and 16 MiB, with sanitized errors.
  Metavulnerability references may legitimately have a lower parent severity
  than an aggregated child's severity; each actual finding is checked separately.
- Added offline CLI, compression disconnect, proxy trust, PostgreSQL
  instrumentation, SDK/exporter loopback and CSS/source-map regression tests.
- Updated `docs/DEPENDENCY-NOTES.md` and `docs/DEPENDENCY_SUPPLY_CHAIN.md`.

No application UI, permission, proxy trust configuration, rate-limit quotas,
collection formulas or database schema changed. External telemetry dashboards
using old semantic attribute names may need adjustment; see dependency notes.
The precise reason for historical green CI versus the later production audit
has not been established; do not assert the old audit wrapper caused it.

## Final local verification

- Full and production-only npm audits: zero findings of every severity.
- Final hardened `npm run audit:dependencies`: PASS against the live registry.
- `npm ci --ignore-scripts --dry-run --no-audit --no-fund`: PASS (dry run only,
  not evidence of a fresh clean install).
- Focused audit suite: 114 passed, including CLI subprocess behavior and valid
  multi-version metavulnerability cases. Six archived npm reports remain
  compatible, preserving all 14 pre-update findings.
- HTTP/telemetry dependency regressions: 5 passed. CSS/source-map: 6 passed.
- Client suite: 1,811 passed, no skips.
- Auth/HTTP/config/middleware/selected rate-limit tests: 704 passed, no skips.
  Live PostgreSQL bootstrap and live Redis tests were explicitly not included;
  no database-backed end-to-end verification is claimed.
- Typecheck and full client/server/shared lint: PASS.
- Local production build, CSP/status checks, production sourcemap gate,
  bundle budgets, repo hygiene, secret scan, Node version and vendored XLSX
  integrity: PASS.
- All 30 emitted CSS content hashes match the pre-update build exactly.
- Final script suite: 708 passed, 1 existing optional baseline comparison
  skipped, 0 failed (109 JavaScript and 10 TypeScript test files).
- Built-browser Collection/Monthly/Billing/receipt layout checks: 29 passed.
- Built-browser auth V17: 38 checks passed, covering login, password recovery,
  reset, MFA, multiple viewports, accessibility and strict CSP. These use
  synthetic loopback API fixtures, not real authentication or production data.

The first sandboxed script run could not resolve files through esbuild because
Windows denied ancestor-folder access. The approved outside-sandbox rerun
passed. Earlier execution pauses were account usage/approval-review limits,
not test failures. Do not weaken tests or bypass an approval failure.

## Local evidence and continuation

Ignored local evidence (not committed):

- `artifacts/security-audit-oct07-before.json`, `-after.json`, `-production.json`.
- `artifacts/security-oct07-verify.mjs`: serial low-concurrency verification
  helper; sets a nonexistent dotenv path, without reading real `.env` files.
- `artifacts/security-oct07-<mode>.log` and `-result.json`: recorded runs.
- `output/dependency-css-before-rebuild.json`: 30 pre-build CSS hashes.

Local implementation and the listed verification are complete. Commit and push
were authorized on 2026-10-08; inspect Git history/remote state for their result,
and await separate authorization before deployment. The focused tests are included by the existing
`npm run test:scripts` command; no CI threshold was disabled. GitHub CI,
live PostgreSQL/Redis integration, Linux release gates and production checks
must still be confirmed through the normal approved release workflow.

Do not run `npm audit fix --force`, modify immutable production dependencies,
or treat rollback to the old lockfile as a security fix. No secrets belong in
Git, logs or this handoff.
