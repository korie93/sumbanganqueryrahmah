# Release readiness follow-up — 2026-09-06

## Observed failure

GitHub [Release Verification run 34007938127](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/34007938127) tested commit `dc40353e9c25b7df4c82ca218be476d645852b70`.
The nested `test:repositories` command reported 309 passes and one failure:
`Billing OSP V3 repository isolates assigned targets and private percentages through shared edits and reassignment`, with `terminating connection due to administrator command`.
The release stopped before its build/browser stages. The ordinary CI run for the same commit passed.

## Scoped corrections

- Four isolated OSP PostgreSQL fixtures now wait for their exact generated database's client connections to drain before dropping it. `pg-pool` can resolve `pool.end()` before all socket closures finish; immediate `pg_terminate_backend` could race the closing pool's error listeners. Cleanup no longer terminates sessions or suppresses cleanup errors.
- Cleanup validates the generated test-database name, refuses to drop a database with remaining client sessions after bounded polling, and always closes its maintenance pool. The V7 fixture only cleans up after successful database creation.
- Release Verification now seeds the per-run admin required by Billing V3 UI smoke, matching ordinary CI. This was a separate configuration gap, not the failing stage in the observed run.
- Regression tests cover safe cleanup, delayed drainage, errors, invalid names, and the admin fixture in both workflows. No application authorization, Collection calculations, test timeouts, or release acceptance gates were relaxed.

## Verification and continuation

- Cleanup unit tests: 7 passed.
- CI/release workflow contract tests: 20 passed; the new admin test failed before the workflow correction and passed afterward.
- First full repository run: 316 passed, no assertion failures, one 100k performance test timeout while TypeScript checking also ran on the 4 GiB local machine. The previously failing private-ownership test passed.
- Standalone 100k performance retest: passed with its original 120-second test limit (approximately 107 seconds).
- Final sequential repository run: all 317 tests passed, zero failures/cancellations/skips. The 100k test completed in approximately 106 seconds; the previously failing private-ownership test passed. Command: `npx tsx --test --test-concurrency=1 server/repositories/tests/*.test.ts`. No timeouts or database settings were changed.
- The exact formerly failing private-ownership test passed three additional consecutive runs with PostgreSQL and fresh fixture databases.
- Full TypeScript check and ESLint on all changed TypeScript files passed. Repository hygiene and secret scan passed.
- Full disposable UI smoke passed, including Billing V3 creation/assignment/private results, XLSX/PNG/PDF exports, Collection receipts, backup/restore, and logout. Command: `node scripts/collection-save-access-qa-local.mjs --ui-smoke`. Application code is unchanged by this fix; the existing local build already contains the previous Billing V3 visual-readiness correction. The disposable database was removed and evidence retained in `artifacts/collection-save-access-1788672056960_069113`.
- The entire `release:verify:local` orchestrator has not been rerun end-to-end for this patch. The previously failing repository gate and relevant workflow/runtime checks above have passed locally; remaining release stages must still run in GitHub.
- No remote release rerun has been dispatched. A local pass must not be reported as a passing GitHub Release Verification run.

Diagnostic/test logs are retained under the ignored `artifacts/release-readiness-*` paths. All integration data is created in disposable databases; no production/development dataset is used as a fixture.
