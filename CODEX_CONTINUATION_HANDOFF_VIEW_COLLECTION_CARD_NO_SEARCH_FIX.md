# View Rekod Collection — Card No search continuation

Status: LOCAL IMPLEMENTATION AND VERIFICATION COMPLETE (2026-09-21). User subsequently authorized commit and push on 2026-09-21; deployment remains unauthorized. One broader OSP performance test remains a documented timeout, not a passing gate.

## Permanent goal

Full Card No search must find the exact associated Collection records through the real View Rekod Collection UI/API, preserving string precision, existing searches, authorization, historical links, filters and pagination. No unrelated changes or migrations.

## Repository baseline

- Branch: main
- Baseline HEAD: 8fa76d3b1faf09682d59072b1ab53909113d10d3
- Initially clean worktree. Pre-commit task inventory: 16 modified tracked files and 9 new files, listed below. Run `git status --short` and `git log -1 --oneline` for authoritative current state and the commit containing this handoff.
- Last recorded production deployment is baseline 8fa76d3b. Production has NOT been rechecked or changed in this task. Local completion does not claim production verification.

## Confirmed root cause / trace

`CollectionRecordsFilters.tsx` -> raw string state -> 300 ms debounce -> trim-only `collection-record-filters.ts` -> URLSearchParams `search` -> `/api/collection/list` -> `CollectionRecordListReadOperations.listRecords` -> repository shared search WHERE -> result mapping -> source hydration -> table/mobile rendering.

The shared WHERE searches existing customer/name/IC/account/phone blind indexes plus batch/amount (and plaintext fields when PII encryption is disabled), but does not search Card No. The full card is hydrated only AFTER SQL filtering and pagination. Thus displayed cards cannot affect search results.

## Data model / safety

- `collection_records` holds only `card_number_last4` TEXT and immutable exact source import ID, row ID and obligation key. No full Card column.
- Full card belongs to exact linked `data_rows.json_data`, parsed by `extractCanonicalSavedCollectionMasterRow`.
- `collection_source_rows` contains indexed card/account HMACs and canonical obligation key, not a raw full card column.
- Source normalization trims/removes whitespace and uppercases strings; hyphens are significant and preserved. Do not change this shared helper/save semantics.
- Full exact Card matching is supported, including whitespace formatting. Partial/last-four Card matching is intentionally not introduced. A hyphenated Card matches the same hyphenated identifier, not a different unhyphenated identifier. Existing non-Card substring/blind-index behavior remains unchanged.
- Canonical parser rejects unsafe numeric/spreadsheet scientific identifiers. Full digits/leading zeros must remain strings.
- Hydration recomputes source obligation HMAC, verifies immutable record link, and (if present) index card hash/suffix/obligation. Deleted source index may fall back to exact immutable link, so an index-only search fix would break historical display/search parity.
- Never use customer IC fallback or a different source row. Never expose HMAC keys to SQL/logs.

## Files inspected

Uploaded scoped specification; AGENTS.md; frontend search state/filter/API/table files; shared API contracts/schema; `collection-record-list-read-operations.ts`; `collection-record-query-filter-utils.ts`; `collection-record-read-utils.ts`; `collection-record-source-account-utils.ts`; source identifier HMAC helpers; canonical Saved parser; existing source hydration tests; disposable PostgreSQL/search and built-app 2FA harnesses.

## Completed changes / evidence (updated 2026-09-21)

- Frontend: Card No added to desktop/mobile placeholders only; precision/request/filter regression tests added.
- Frontend focused tests PASS 23/23; final combined filter-component/new backend tests PASS 32/32.
- Backend implemented: shared source authority extracted unchanged from hydration; scoped exact-card candidate source resolution; internal verified source triples shared by list/count SQL before paging. Existing search OR terms and outer AND filters preserved. No schema or persisted-card changes. Nonempty list search resolves sources once after role/team scope. Source triples cannot be supplied by request parameters.
- `node scripts/test-collection-card-no-isolated.mjs --expect-missing-card`: PASS, actual built UI/API and 53 encrypted synthetic Collection records in disposable PostgreSQL. IC/name/account found 52 same-customer records displaying both linked cards; exact Card A returned zero. Evidence: `artifacts/collection-card-no/run-w2Xloz/verification.json` plus screenshots. Temporary database/app stopped and removed successfully. Earlier attempts were harness setup/desktop empty-selector fixes, not backend fixes.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS (full client/server).
- `npm run test:client`: PASS 543/543, log `artifacts/collection-card-client-tests.log`.
- Final new resolver tests: PASS 21/21. New service/security tests: PASS 10/10. Existing hydration/query utilities: PASS 31/31. Runner safety contracts: PASS 5/5 after final runner edits.
- Agent ran existing team/service tests and list-route tests: PASS (27 combined new service/team; 6 focused list-route; 15 daily-record service). Route test quarantine directory was absent before suite cleanup.
- `npm run build`: PASS, including status-assets/CSP/source-map gates. Log: `artifacts/collection-card-build.log`; built dirty-source release `sqr-1.0.0-8fa76d3b1faf-20260921T051851Z`. This local artifact was not deployed.
- `npm run test:scripts`: PASS 392 JavaScript + 63 TypeScript tests. Log: `artifacts/collection-card-scripts.log`.
- `npm run verify:secrets`: PASS. Final `git diff --check`: PASS. Final focused script ESLint: PASS. Fixture TypeScript files are outside ESLint's configured scope but execute successfully in the real isolated run.
- `npm run test:repositories`: 395 PASS, 2 SKIP, 1 CANCELLED after the existing 120-second timeout in `collection-osp-v3-performance.postgres.test.ts`. A separate repeat of that single test also timed out; its EXPLAIN took about 68.9 seconds. No OSP implementation/test was changed to hide this. Logs: `artifacts/collection-card-repositories.log`, `artifacts/collection-card-osp-recheck.log`. Do NOT report the entire repository suite or `npm test` green. This test does not exercise the new Card list resolver; broad OSP performance diagnosis is outside this scoped fix.

## Actual built UI/API verification

`npm run test:collection:card-browser`: PASS, exit 0. Final evidence: `artifacts/collection-card-no/run-Nru7Ir/verification.json`, screenshots in that directory, and `artifacts/collection-card-verification-roles.log`. Earlier successful full run: `run-gdekDt`. Root visually inspected the desktop long-card and mobile screenshots.

The fixture launches the actual built app against a freshly initialized loopback PostgreSQL cluster in a temporary working directory, with generated credentials/keys and encrypted synthetic PII. It never copies workspace `.env`, uploads, receipts or application data. Requests go through the real login/page/API/database; search results are not mocked. All fixture processes were stopped and the disposable database/app directories removed; no task fixture directories remained on final inspection.

Verified:

- IC/name/account find the same known existing records and their displayed full cards.
- Card A finds 51 exact-source records, page sizes 50 + 1, correct sum/count/cursors, no overlap; same customer/IC/account and same suffix with Card B returns only source B.
- Every rendered desktop Card cell equals the API string, including leading zeros and a 19-digit identifier. Wrong adjacent digits return zero.
- Input/stored whitespace handling; exact stored hyphens; missing Card does not match.
- Retired source configuration/index retains exact historical Card; tampered indexed hash and changed source account fail closed.
- Date/source/aging/classification intersections; phone/batch/payment-amount search; clearing search restores all 59 records and first page.
- Mobile search/result and no horizontal page overflow.
- Unauthenticated and logged-out search returns 401.
- Real authenticated admin and user cannot retrieve the known out-of-scope Card. Injected owner/source-link query values cannot widen access. Admin requesting an unassigned nickname is rejected.
- No browser runtime errors or external requests in the main UI run; no error-level entries in the final app log.

## Performance / query evidence

One additional candidate-resolution SQL statement per nonempty list search, not per result row. It returns distinct exact-card SOURCE candidates for HMAC verification, not Collection record sets for application-side filtering. Verified source triples are a single bound JSON parameter in the shared row/count SQL before LIMIT/OFFSET. No migration, new index, wildcard Card scan, full Collection application scan or N+1 was added.

Real `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` evidence is sanitized to timings/node/index names; never logs raw SQL parameters or full plans. In the final 59-record fixture:

- Indexed source-filtered search: 1.720 ms, one source candidate -> 51 Collection records.
- Historical source-filtered search: 0.348 ms, one source -> one record.
- Default user search without source/date filters: 2.515 ms, one returned candidate.
- Default superuser search without source/date/owner filters: 2.567 ms, one returned candidate.
- Default historical user search: 2.662 ms, one returned candidate.

Existing source/record/link indexes were used. The small unfiltered superuser plan scans Collection links in PostgreSQL, deduplicates nine linked source rows, and returns only the exact matching candidate. These are fixture measurements, NOT proof of production-scale latency. Candidate count is not artificially capped, so legitimate matching historical source links are not silently omitted. No arbitrary unlinked Saved imports are scanned.

## Exact changed-file inventory

Frontend (copy + regression tests only):

- `client/src/pages/collection-records/CollectionRecordsFilters.tsx`: add Card No to both existing placeholders.
- `client/src/pages/collection-records/CollectionRecordsFilters.test.tsx`: text input, long leading-zero value, placeholder and no numeric/truncation attributes.
- `client/src/pages/collection-records/tests/collection-record-filters.test.ts`: precision/format/filter preservation.
- `client/src/lib/api/collection-records.test.ts`: exact Card response and request query string preservation.

Backend:

- `server/repositories/collection-record-card-search-utils.ts` (new): exact-source SQL candidate resolver with shared authority verification.
- `server/repositories/collection-record-source-account-utils.ts`: extract existing hydration authority unchanged for reuse by search.
- `server/repositories/collection-record-query-filter-utils.ts`: add verified Card source tuple OR predicate inside existing outer filters.
- `server/repositories/collection-record-query-shared.ts`: internal verified link filter type.
- `server/repositories/collection-repository-record-operations.ts`: repository adapter for resolver.
- `server/repositories/collection.repository.ts`: expose resolver through existing repository facade.
- `server/storage/postgres/postgres-collection-storage.ts`: storage adapter.
- `server/storage-postgres-collection-types.ts`: internal link type/filter; declare already-supported team member filter in storage type.
- `server/storage-postgres-collection-contracts.ts`: storage resolver contract.
- `server/services/collection/collection-service-support.ts`: service storage port.
- `server/services/collection/collection-record-list-read-operations.ts`: resolve once after authorization/filter scope and share links across rows/count.
- `server/repositories/tests/collection-record-card-search-utils.test.ts` (new): 21 precision/authority/SQL/filter regression tests.
- `server/services/tests/collection-card-search-read-operations.test.ts` (new): 10 role/team/query-injection/shared-filter tests.
- `server/routes/tests/collection-route-record-doubles.ts`: adapt existing list-search test storage mock.

Verification/documentation:

- `package.json`: `test:collection:card-browser` command.
- `scripts/test-collection-card-no-isolated.mjs` (new): disposable built-app/PostgreSQL lifecycle and generated role fixtures.
- `scripts/collection-card-no-browser.mjs` (new): real desktop/mobile/API/auth before/after verification.
- `scripts/fixtures/collection-card-no-seed.ts` (new): guarded synthetic encrypted fixture data only.
- `scripts/fixtures/collection-card-no-query-plan.ts` (new): guarded SQL/EXPLAIN evidence.
- `scripts/tests/collection-card-no-isolated-runner.test.mjs` (new): five fixture safety contracts.
- `CODEX_CONTINUATION_HANDOFF_VIEW_COLLECTION_CARD_NO_SEARCH_FIX.md` (new): this report and continuation state.

## Remaining work / next actions

No required local Card-fix work remains. All task diffs were inspected; no unrelated implementation changes. The verification baseline HEAD above intentionally remains the pre-fix SHA; the user has now requested committing and pushing this completed work.

For a future account/session, first inspect `git status --short`, `git diff`, and this handoff; do not repeat the completed root-cause investigation. To reverify (PowerShell Node PATH may need `C:\Program Files\nodejs`):

```text
npm run typecheck
npm run lint
npm run test:client
npm run test:scripts
npx tsx --test server/repositories/tests/collection-record-card-search-utils.test.ts server/repositories/tests/collection-record-source-account-utils.test.ts server/repositories/tests/collection-utils.test.ts server/services/tests/collection-card-search-read-operations.test.ts client/src/pages/collection-records/CollectionRecordsFilters.test.tsx
npm run build
npm run test:collection:card-browser
npm run verify:secrets
git diff --check
```

The explicit `--expect-missing-card` mode is for an OLD built server only and must fail against the fixed build. Do not weaken default verification to make it pass.

Commit/push are authorized by the user's subsequent request; deployment still requires a separate instruction. Before any release, report the OSP timeout and check CI/release gates; do not claim all gates green. Follow the repository's existing reviewed release procedure, record source/deployed SHA and service health, then have an authorized operator search a known production Card and compare its exact source/card/count without recording full identifiers in logs. No server pull/restart/production test has been performed for this fix.

## CI smoke follow-up (2026-09-21)

The Card search change above was committed and pushed as `10efabf96e822bf7ffd2b63ba51d21a4db7b75cb`. CI run `35566082610` passed build-and-test and coverage, then failed in `Run UI smoke` at `collection stale delete conflict`. The actual error was a 30-second locator timeout: `filterCollectionRecordsBySearch` still located the field by its old placeholder, which omitted the newly added Card No copy. This was not a failed Card API or database assertion.

Follow-up fix is restricted to `scripts/ui-smoke.mjs`: select the existing desktop `#collection-records-search` ID rather than changeable placeholder copy. No retry/timeouts, application logic, permissions, migrations or workflow gates were weakened. `scripts/tests/ui-smoke-collection-search.test.mjs` executes the actual helper in an isolated VM and verifies the matching component ID, exact string preservation and returned row. The old committed helper fails this regression; the corrected helper passes.

Checks: focused selector/workflow tests PASS 8/8; full script suite PASS 393 JavaScript + 63 TypeScript tests; script ESLint, secret scan and diff check PASS. Actual smoke initially passed stale-delete after the fix; a later General Search failure in the first local diagnostic run came from a runtime-only fixture without CI's migration preparation. The disposable diagnostic runner was corrected to apply the existing migrations before app startup (no application/migration edits). A subsequent run passed stale-delete and manual ABORT before the session was interrupted.

On resume, that runner/app were confirmed stopped and `pg_ctl status` reported no server for its isolated directory. The stopped temporary fixture `sqr-collection-card-no-ayzACh` was retained because manual cleanup was denied by the execution policy; it contains only generated test data.

The fresh, fully migrated disposable full-smoke run PASSED (exit 0), including stale-delete conflict, manual ABORT, Billing Principal exports, collection receipts, backup/restore and logout. Evidence: `artifacts/ci-smoke-fix-35566082610-resumed.log` and `artifacts/ci-smoke-fix-35566082610/run-g4QasP/`. This successful run stopped its app/database and removed its own temporary fixture; existing application uploads, receipts and data were not used. Its diagnostic wrapper lives only in ignored `artifacts/`. The user subsequently authorized committing and pushing this follow-up. Do not claim remote CI green until GitHub verifies the pushed commit. No production deployment has been performed for this follow-up.
