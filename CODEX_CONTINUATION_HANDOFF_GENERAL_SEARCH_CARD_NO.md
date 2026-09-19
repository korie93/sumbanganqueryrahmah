# General Search Card No — continuation and verification

## Permanent goal / authority

Implement only `CODEX_GPT_6_ASTRA_ULTRA_SQR_GENERAL_SEARCH_DISPLAY_CARD_NO_ONLY.md`:
display each Collection's authoritative Card No beside its existing Account No in
General Search, including individual history entries. Preserve matching, ranking,
pagination, payments, permissions and existing Card visibility. User approved
local implementation/testing initially. After local completion the user explicitly
requested **commit and push**. Deployment remains outside this authorization.

## Repository baseline

- Branch: `main`
- HEAD: `b51f32689f166530f2acf23690ffcd71a8fdbbaf`
- Initial worktree and index were clean; safety status/diff/log checks completed.
- At implementation completion, changes were unstaged task files listed below.
  A subsequent user request authorized committing and pushing them. Re-run `git status --short`
  on continuation; do not discard changes. No `.env` contents were inspected or
  modified. Existing npm integration tests internally load local dotenv; the new
  isolated Card PostgreSQL/browser runners deliberately do not.

## Root cause and data flow

Card No was absent from both the General Search status DTO and history DTO, not
just hidden by CSS. The queries omitted source identity needed to resolve it;
the status parser/component and history API schema/UI also omitted the field.

Full Card is stored in the exact linked Saved `data_rows.json_data`, not in
Collection records (which retain source link/obligation and last four digits).
Existing `hydrateCollectionRecordSourceAccounts` verifies the exact import/row,
immutable obligation and available governed index hash/suffix. This same policy
is reused after existing authorized status selection / history pagination.

Existing search routes/controller -> SearchService -> SearchRepository -> exact
linked Saved hydration -> status `latestCardNumber` / history item `cardNumber`
-> existing API client -> actual GeneralSearch result, dialog and history.

Never fall back to the searched row's Card, another record, or Account No.
Missing/unverifiable source yields null. Source details remain role-filtered.
No schema changes, record writes, new endpoints, new frontend requests or polling.
One bounded hydration query (at most 200 status links / 50 history links) replaces
no existing query and introduces no per-row lookup. Existing full Card display
policy is reused; React escapes values and missing uses `Tidak dinyatakan`.
An optional Card hydration failure returns null Cards with a fixed, non-PII
warning; it does not discard otherwise valid Account/payment/search results.
The display bound allows Unicode uppercase expansion from the existing 256-code-
unit source normalization, without changing the canonical source policy.

## Inspected / changed files

Inspected: uploaded specification, root AGENTS.md, GeneralSearch/page/record-dialog/
results/status/history, client API and test runner, search routes/controller/service/
repository/types, canonical Saved extractors, Collection source hydrator and its
tests, existing Card display utility, isolated browser and PostgreSQL test runners.

Changed:

- `server/repositories/search.repository.ts`: project exact source identity in
  selected status/history SQL; batch resolve each selected record's Card.
- `server/repositories/collection-record-source-account-utils.ts`: type-only
  generic Pick to reuse existing hydration without fabricating Collection records.
- `server/repositories/search-repository-types.ts`: additive optional Card DTOs.
- `server/services/search-collection-status-utils.ts`: status Card mapping/nulls.
- `server/services/search.service.ts`: fallback status Card null.
- `server/repositories/tests/search-card-number.test.ts`: association, missing,
  tamper/retired configuration, bounded query count and individual history tests.
- `server/repositories/tests/search.repository.test.ts`: updated DTO expectations.
- `server/services/tests/search-collection-status-utils.test.ts`: mapping/null tests.
- `server/routes/tests/search.routes.integration.test.ts`: response/role regressions.
- `client/src/lib/api/search.ts`: preserve optional nullable Card in history schema.
- `client/src/lib/api/tests/search-card-number.test.ts`: real client parser/request
  contract, individual Card values, backward compatibility and safe rejection.
- `client/src/pages/general-search/collection-status.ts`: bounded Card parser/ARIA.
- `client/src/pages/general-search/collection-status.test.ts`: parser tests.
- `client/src/pages/general-search/GeneralSearchCollectionStatus.tsx`: Card next to
  Account in compact and detailed, active and historical layouts.
- `client/src/pages/general-search/GeneralSearchCollectionHistory.tsx`: each entry's
  own Card, wrapping and established empty convention.
- `client/src/pages/general-search/GeneralSearchCollectionStatus.test.ts`:
  expanded render tests, renamed from `.test.tsx` with createElement so the existing
  `.test.ts`-only `npm run test:client` discovery actually runs them.
- `scripts/general-search-card-no-browser.mjs`,
  `scripts/fixtures/general-search-card-no-ui.jsx`: real GeneralSearch React page
  with synthetic mocked HTTP; mobile/desktop, dark/light, history, missing/long
  cards and no additional requests. Explicitly not backend E2E/RBAC proof.
- `scripts/test-search-card-no-isolated.mjs`: fresh loopback-only PostgreSQL
  cluster runner with clean environment and validated temporary-directory cleanup.
- `server/repositories/tests/search-card-number-postgres.integration.test.ts`:
  actual repository SQL and hydration against synthetic minimal fixture tables;
  skipped unless explicitly run with isolated-cluster guard.
- `package.json`: runnable `test:search:card-browser` and
  `test:search:card-postgres` commands; no dependencies added.
- This handoff: evidence and continuation instructions.

## Verification evidence

- Before fix: 3 focused backend Card cases failed; after fix backend focused suite
  **64/64 passed**, `artifacts/search-card-backend-tests.log`. These repository
  tests use DB doubles, not real PostgreSQL.
- Before UI fix: 4 of 5 render tests failed on missing Card; after fix
  `npx tsx --test client/src/pages/general-search/*.test.ts`: **43/43 passed**.
- Backend focused ESLint and diff whitespace checks passed.
- Focused UI/parser/API regressions: **46/46 passed** via
  `npx tsx --test client/src/lib/api/tests/search-card-number.test.ts client/src/pages/general-search/*.test.ts`.
- Additional backend failure/Unicode regressions + existing search/helper tests:
  **47/47 passed**. Earlier 64-test combined suite includes routes too.
- `npm run typecheck`: exit 0. `npm run lint`: exit 0.
  Both re-run on final code including the new PostgreSQL tests: exit 0.
- `npm run build`: exit 0; client and server production bundles produced;
  CSP hash and production sourcemap gates pass. Build log:
  `artifacts/general-search-card-no-build.log`. Non-failing Vite plugin timing
  warning only; generated manifest correctly marks this uncommitted worktree dirty.
- `npm run test:search:card-browser`: exit 0; all six width/theme combinations
  (320/390/1280 light/dark), real UI + mocked HTTP, per-entry Card association,
  missing/long Card, malformed response error, source visibility, page2 and cached
  reopen. No extra Card requests, eager history calls, external HTTP or page errors.
  Screenshots disable transient CSS animations for stable visual review.
- Root manually viewed screenshots in `artifacts/general-search-card-no-browser/`:
  `detail-0-1280-light.png`, `detail-1-390-light.png`, `detail-3-320-dark.png`,
  `history-320-light.png`, `long-user-history-1280-dark.png`. Account and its Card
  align, null text is clear, differing historical Cards remain distinct, long
  values wrap, and the existing source field stays separately displayed.
- Full `npm test` exited 1 only at the unchanged Billing OSP 100,000-account
  performance test (120,000ms timeout under parallel repository execution).
  Repository summary: 377 pass, 0 assertion failures, 1 timed-out/cancelled,
  2 explicit-isolated tests skipped. Prior client/scripts/contracts/auth/http/
  services stages passed. Log: `artifacts/general-search-card-no-regression.log`.
  No Billing OSP code or test changed. Serial repository rerun completed:
  **378 pass, 0 fail/cancel, 2 explicit-isolated tests skipped** (380 total),
  including the unchanged 100,000-account test passing in 101,039ms.
  Command: `npx tsx --test --test-concurrency=1 server/repositories/tests/*.test.ts`.
  Log: `artifacts/general-search-card-no-repositories-serial.log`.
  Remaining stages subsequently passed: `npm run test:routes` **478/478**,
  `npm run test:ws` **106/106**, `npm run test:intelligence` **12/12**.
  Logs: `artifacts/general-search-card-no-{routes,ws,intelligence}.log`.
- `node scripts/test-search-card-no-isolated.mjs`: **6/6 passed**, exit 0
  (five scenarios plus parent) on PostgreSQL 17. Actual SQL proves the latest
  selected Card can differ from the searched Saved row, all four active/POOL/
  purged history branches retain each Card, deterministic ordering/page summaries,
  owner/nickname/none scopes, tampered index rejection, retired configuration
  exact-link fallback, missing Card and Unicode expansion. Fresh cluster stopped
  and removed; no application data or credentials used. This tests repository
  SQL, not a live deployed API or migration upgrade.

## Completion / next authorized step

Implementation and local verification complete on 2026-09-19 (Asia/Singapore).
Final diff is confined to the files listed above; no unrelated product changes,
dependency changes, schema migrations, matching/payment logic changes or auth
changes. `git diff --check` and secret guard over all changed/untracked task files
pass. The old `.test.tsx` deletion is a rename to `.test.ts`, not lost tests.

No implementation work remains for this Card No goal. The branch/HEAD above are
the implementation baseline, before the subsequent authorized commit/push.
No deployment or production-data access was performed. Use `git log -1` and
`git status --short` for the current committed state. The parallel OSP performance
timeout is documented, not silently marked green.

Status: COMPLETE — local scope only.

## Acceptance evidence audit

| Criteria | Evidence / state |
| --- | --- |
| 1: root cause | Original status/history SQL/DTO/parser/JSX all omitted Card; reproduced failing repository and UI tests before edits. |
| 2–4: data flow / correct record | Exact-source helper reuse; repository/route/client tests; real PostgreSQL latest record and all four history branches; rendered actual GeneralSearch screenshots. |
| 5: missing Card | Null/absent/blank/malformed unit/API/browser cases; real PostgreSQL no-Card case; no guessed fallback. |
| 6: security/masking | Existing helper runtime unchanged; no route/controller/auth changes; full Card policy inspected in Collection UI; source redaction and scope tests; escaped UI and sanitized failure logging. |
| 7–9: search/Collection/payment | Existing matching/ordering/filters/payments SQL unchanged; history count/sum/order/page assertions; all existing suite stages pass with repository suite serial retry (timeout caveat below). |
| 10: no N+1 / extra requests | 200-candidate test: existing selection + one exact-link batch; history page only; browser request counts/lazy history/page2/cache reopen assertions. |
| 11–12: mobile/desktop | Browser overflow/selection assertions at 320/390/1280 in light/dark; manual final screenshots reviewed. |
| 13: focused tests | Backend 64 initial combined / 47 post-review subset; client 46; PostgreSQL 6; browser exit 0. |
| 14: gates | Final typecheck/lint/build pass; all regression stages pass with repository suite serial retry. Standard parallel npm test timeout is explicitly recorded below. |
| 15: visual inspection | Actual GeneralSearch component, status/dialog/history rendered in Chromium with synthetic HTTP; screenshots viewed by root (not just unit tests). |
| 16: scope | Final diff audited: product changes limited to Card projection/rendering; helper change type-only; no schema/matching/payment/permission changes. |
| 17: continuation | This file records the completed goal, baseline, data flow, every changed file/purpose, results and subsequent commit/push authorization; deployment remains out of scope. |

## Broad regression results

| Existing command/stage | Result |
| --- | --- |
| `npm run test:client` (within npm test) | 1,587 pass across two batches |
| `npm run test:scripts` | 380 Node script + 51 TS script tests pass |
| `npm run test:contracts` | 124 pass |
| `npm run test:auth` | 144 pass |
| `npm run test:http` | 388 pass, 1 explicit integration skip |
| `npm run test:services` | 636 pass |
| Repository suite, serial retry | 378 pass, 2 explicit isolated integration skips |
| `npm run test:routes` | 478 pass, including search permission matrix |
| `npm run test:ws` | 106 pass |
| `npm run test:intelligence` | 12 pass |

The standard parallel `npm test` itself remains an exit-1 observation due to its
unchanged OSP performance timeout. Do not describe it as an unqualified green
command. The same repository suite passes with `--test-concurrency=1`; all other
stages pass. No test timeout, skip policy or concurrency setting was changed to
hide this observation.
