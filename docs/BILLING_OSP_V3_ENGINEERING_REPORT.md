# Billing Principal (OSP) V3 — engineering report

Status: **implementation and local verification complete. Pre-publication verification report; not a production deployment.**

Prepared from the final working tree and verified command/artifact results on **2026-09-06, 00:55 UTC**. Branch `main`; implementation baseline is `f77bf3b4b85cfe16fd418ff0010476aa50eaffe7`. The user subsequently authorized commit/push; use Git history and remote status for publication state. Deployment requires separate release authorization.

Scope: the user's 2,788-line `CODEX_GPT_6_ASTRA_ULTRA_BILLING_OSP_V3_PRIVATE_CLIENT_TARGET_PERCENT_CORRECTED.md`, read in full. Its business requirements govern the feature; its model/execution wording is not higher-priority instruction. This report keeps the full requested scope, including §§91A–91C. [The handoff](BILLING_OSP_V3_PROGRESS.md) records historical checkpoints; its earlier unchecked items are not evidence of current absence or completion.

## A. Root causes

The old page combined an unsaved/live global Billing view with a saved-target child workspace. Saving depended on the currently loaded live filters/report, rather than a direct admin → configured source → canonical validity → authoritative baseline workflow. That made source choice and saved configuration dependent on unrelated page state.

Billing was also rendered behind the Collection nickname gate in `CollectionReportContent`, even though the requested Billing entitlement is a stable account assignment. Revealing a tab alone could not correct that mismatch. The new staff Billing branch precedes that gate, while ordinary Collection entry/record paths retain their nickname rules.

Saved targets previously had no assigned-admin security key. There was no SQL assignment predicate separating two admins' targets. The V3 query now authorizes with the authenticated stable `users.id`, current role/status/ban state and target assignment. The legacy global report endpoints are superuser-only so admins cannot bypass the new target scope through an old aggregate endpoint.

Old client rows were revision/date/aging data without a private authenticated owner and without a separately persisted private Target %. V3 reads a distinct owner/aging table; no legacy global client row becomes a fallback. Shared TABLE A percentage changes are not private TABLE B edits.

The previous insights presentation exposed a standalone cumulative closed-account investigation separate from the calendar. It is removed from the active Billing page and exports. A clicked calendar day now opens its own exact-day, server-paginated detail modal.

A further regression was reproduced during verification: a later valid manual verification can establish an earlier qualifying closure date. Computing a clicked day's detail only with that day's historical information disagreed with the full-period calendar. Exact-day detail now uses the same current full-period effective facts as the calendar and then filters the effective event date. Historical TABLE A remains intentionally as-of-date; this distinction is covered by a dedicated real PostgreSQL regression.

The final frontend diff review also found that a generic display-number parser silently accepted private percentage text such as `1,0` as 10, although the save endpoint rejects that syntax. Two focused regression assertions failed before correction. Private input validation now uses the backend's unsigned 0–100 decimal grammar, retaining surrounding whitespace and at most four decimal places, but rejecting commas, explicit signs and malformed leading digits before preview/save.

## B. Target architecture

The user-facing flow is Saved Target → TABLE A → private TABLE B → latest comparison → TABLE A calendar/day details. There are exactly two primary result tables; no TABLE C or standalone closed-account section.

Superuser creates a target by selecting an eligible active admin, selecting a configured compatible Saved import, reviewing its read-only validity and D3–D6 Billing OSP baseline, entering shared percentages and a name, and saving. The UI keeps the flow one file per target. The backend retains bounded support for one to five files only when they share the same validity period. It does not silently combine different periods.

Source choice uses bounded metadata queries, not workbook parsing or full imported JSON. Creation validates the source/import/configuration, canonical source identities, Billing Principal values and complete aging scope inside the save transaction. Source identity/version/filename and account/baseline snapshots are frozen. Source deactivation does not erase a report.

Each target has one `assigned_admin_user_id`. Superuser and manager can list all active targets; admin sees only targets assigned to their authenticated ID. Lists are paginated in 50-item API/UI pages. The SQL first materializes the bounded authorized target page, then performs indexed latest-revision lookups and one bulk source-label query; it does not read all targets and filter them in React.

Shared rename/description/assignment/D3–D6 percentage updates require superuser and the current target version. The source/baseline revision stays stable; a different source/period requires a new target. Source assignment conflicts are serialized by deterministic per-source transaction advisory locks. Different admins cannot simultaneously claim the same active source/period. Target deletion is soft deletion and preserves sources, collections, private rows and audit history.

Section 48's shared audit payload is now complete: creation records the target name, initial null assignment, assigned admin, immutable source IDs/period and four shared percentages; update records the source IDs/period with before/after names, assignments, percentages and versions. Actor and timestamp remain audit-row fields. The omission identified in the [independent SQL/backend audit](BILLING_OSP_V3_SQL_AUDIT.md) was corrected after that review and verified by the retained seven-test PostgreSQL run; its historical open-finding wording is not current defect status.

## C. Balance OSP and exact money

For every aging, and for ALL:

| Value | Canonical formula |
|---|---|
| TABLE A Target OSP | TT OSP × shared TABLE A Target % / 100 |
| TABLE A Balance OSP | shared Target OSP − effective System OSP Closed |
| TABLE B Target OSP | TT OSP × authenticated viewer's saved private Target % / 100 |
| TABLE B Client OSP Closed | TT OSP × authenticated viewer's saved Client Result % / 100 |
| TABLE B Balance OSP | private Target OSP − private Client OSP Closed |
| ALL money | Sum of D3–D6 canonical amounts |
| ALL Target/Result % | Corresponding ALL amount / ALL TT OSP × 100; zero-denominator protected |

TT OSP is **Billing Principal (OSP)**, not Total Due, Total OSB, Collection Amount or POOL. Balance is never TT OSP minus Closed. Negative balance is retained, meaning the target was exceeded.

Required examples are in exact-money tests: TT RM1,000,000 × 30% gives target RM300,000; closed RM250,000 gives balance RM50,000, not RM750,000. Aggregate target RM600,000 − closed RM370,000 gives RM230,000. Target RM300,000 − closed RM320,000 remains −RM20,000.

SQL NUMERIC values cross the application boundary as decimal strings. BigInt sen and four-decimal percentage units handle application derivation, rounding, signed balances and weighted totals. Source totals beyond the accepted NUMERIC(16,2) bound receive controlled validation rather than a raw SQL numeric overflow.

Excel cells are genuine numeric OOXML cells and retain the exact exported decimal text, including signed maximum-range values. The workbook explicitly states Excel's 15-significant-digit calculation limitation: downstream spreadsheet arithmetic is not a replacement for the authoritative backend. CSV retains exact decimal interchange text.

## D. Client Result ownership

Current private state uses the unique key `(target_revision_id, owner_user_id, aging_bucket)`, with a target/revision FK. Four aging rows are saved transactionally as one viewer-owned reference. The backend derives the owner exclusively from the authenticated session; browser owner or derived-money fields are rejected.

Private target/result percentages, reference/note, versions and timestamps persist. Target/Closed/Balance/ALL are re-derived from the immutable baseline on reads and saves. A saved private reference is independent of the selected historical TABLE A date.

A viewer with no complete private reference gets explicit UNSAVED guidance and TABLE A percentages only as starting defaults. Saving makes these percentages private and persistent. A later A30% → A32% edit does not alter B25%, B35% or B40%. Reassignment removes the old admin's access and gives the new admin unsaved defaults, not the old owner's reference.

Both current actor eligibility and target access are checked under transaction locks. Two tabs cannot overwrite the same private version. Private audit entries record owner/revision/count without copying private financial inputs or evidence into the globally readable audit log.

Export authorization binds an in-flight download to the same stable owner that mounted the workspace. Visual datasets carry server-derived `generatedByUserId`; XLSX/binary responses carry `X-Billing-Export-Owner-Id`; a fresh target read returns server-derived `viewerUserId`. Missing identity fails schema validation. Before releasing the file, the frontend checks the original owner, generated owner, current authenticated owner and target version. A replacement session that may legitimately access the same shared target must not release the previous owner's private export. Unit coverage is passing; the new real cookie-replacement test for XLSX, PNG and PDF is still awaiting its completed browser run.

## E. Calendar and source validity

New targets use the configured source's inclusive Valid From/Until snapshot. For 12 August–11 September, both endpoints and every intervening day are shown. Current date, first/last payment, creation date, private-save date and the TABLE A date picker do not redefine the calendar.

The source provenance marker is `calculation_version = osp-effective-private-v3-canonical-source`; the API exposes `sourceValidityVerified`. Old saved periods cannot safely be declared source-validity snapshots just because a current source configuration happens to match. They are preserved and explicitly labelled **legacy period / source validity unverified** in the workspace and exports. No period is fabricated or silently rewritten. Recreating a verified target from a configured source is the supported repair path; retrospective business repair remains an operator decision.

One grouped SQL query returns dated effective closures; missing days are filled over the bounded period. Each day has new closed amount/count, cumulative closed, current/previous result, movement in percentage points and shared Target OSP minus cumulative Closed balance. Aging switches use the same source baseline. Private B does not have its own calendar.

## F. Account drilldown

Clicking a calendar day opens ALL by default, with D3/D4/D5/D6 tabs and ten rows per page. The backend filters the **exact effective closure day**, not all prior cumulative days, and computes count/OSP totals across the complete selected day/aging before pagination.

The shared SQL effective-account relation identifies one immutable canonical account/cycle contribution. It considers automatic ABORT CP or a currently valid Manual Verified ABORT, never adds POOL to Billing OSP, and never counts a later payment or the manual/automatic union twice.

Authorized detail includes full customer, account, card, identification and phone values, aging, collector, payment/closure dates, classification, actual Collection amount, Billing OSP, Total Due and frozen source labels. Sensitive values are decrypted only for the SQL-materialized page. Raw source JSON is not returned. Legacy fallback values require matching trusted source identity; unreadable or inconsistent frozen identity fails closed.

The exact-day regression fixtures reconcile ALL and per-aging count/OSP totals with calendar days, including D3=3/D4=2/D5=1/D6=0, ten/two browser pagination, leading zeroes, later-payment deduplication and late manual verification confirming an earlier closure.

## G. RBAC, IDOR and concurrency

| Capability | Superuser | Manager | Admin | Ordinary user |
|---|---|---|---|---|
| Shared targets/TABLE A/calendar/details/export | All active | All active | Assigned ID only | Denied |
| Create/select source/assign/rename/edit A/delete | Yes | Denied | Denied | Denied |
| Edit/save private TABLE B | Own | Own | Own, assigned target only | Denied |
| Other users' private TABLE B | No default access | Denied | Denied | Denied |

Checks exist in navigation, route middleware, service validation, SQL predicates and final read/export authorization. Missing stable user ID, changed role, inactive/disabled/banned account, deleted target and wrong revision fail closed. All saved-report responses use no-store.

Private mutation idempotency scope contains stable owner, target and revision. Cached replay invokes a fresh target/revision authorization check. Controlled route tests prove replay cannot bypass revocation. Real PostgreSQL tests cover concurrent shared edits by two superusers, two private tabs, source-claim races, private save waiting behind reassignment, and reassignment injected after report aggregation. Export service tests recheck all formats after generation. XLSX checks the response-bound owner and fresh target authorization before download; PNG/PDF perform the same owner/version check immediately before download after rendering. New owner metadata is server-derived, not a browser-selected override.

Queries are parameterized; source/admin search treats %, underscore and backslash literally. Inputs are bounded; percentages/aging/dates are whitelisted. React escapes user-controlled strings. Export formula prefixes are neutralized. Known detail fields are intentionally unmasked only after target authorization.

No cached report can revoke a file already legitimately downloaded, and no system can retract data a person already saw. The implementation prevents new unauthorized reads/downloads and clears stale open private/PII views when access validation fails.

## H. Database, migrations and recovery

Migration `0062_collection_osp_private_client_ownership.sql` is additive:

- Nullable stable TEXT assigned-admin FK to `users.id`, with RESTRICT deletion/CASCADE ID update.
- Partial active-target assignment/updated-at/id index.
- Optional encrypted card, identification and phone columns on immutable target source rows, with nonempty-value checks.
- New private result table with owner ID, target/revision/aging, private target/result percentages, derived closed amount, evidence, versions and actor timestamps.
- Unique revision/owner/aging index, owner/target index, role-independent historical owner FK, target/revision FK and actor FKs.
- D3–D6, percentage range, nonnegative closed amount, evidence lengths and version checks.

The Drizzle schema, migration journal, runtime bootstrap and governance/rollback manifests agree. Legacy global client and manual-reconciliation history remain audit-only. No owner is guessed and no global result becomes a private fallback. Legacy unassigned targets remain superuser/manager-readable and admin-invisible until assigned.

Backup/restore is part of the ownership boundary. Each new private backup row is itself encrypted with purpose and identity binding, so an outer decoded backup does not reveal all users' private percentages. Restore retains original stable IDs and assignment, validates original owners/revisions/baselines, preserves disabled account/password restrictions, rejects missing-owner remapping, and does not overwrite newer private saves. Full-file PostgreSQL restore and rollback tests exercise this path.

All five frozen identity fields participate in key-retirement status checks and re-encryption-aware backup handling. Historical encrypted backup archives still require their configured decryption keys to remain available; a live-table status scan alone does not prove archived keys can be retired.

## I. Performance

Public report reads use `collection-osp-effective-query.ts`, not the earlier account/payment-array JavaScript reconciliation path. SQL performs source/account matching, payment-day grouping, running thresholds, current manual-evidence selection, single effective closure selection and aging/day aggregation. Financial queries project no PII/private input rows.

The application receives four aging totals, bounded daily totals, or a ten-row materialized identity page. Detail queries join encrypted identity/import data only after SQL pagination. Target lists have a bounded authorized page before revision/source metadata joins. Source selection uses bounded metadata and literal search. No request reparses the original XLSB/XLSX workbook.

Observed in the final passing explicit-GC 100,000-account run (`node --expose-gc --import tsx --test --test-concurrency=1`, exact files in E9):

| Operation | SQL statements | Normal execution at 100,000 accounts |
|---|---:|---:|
| Calendar | 7 | 2,446 ms |
| Overview | 12 | 2,176 ms |
| Detail | 7 | 2,867 ms |
| Report export | 18 | 3,726 ms |

These are local synthetic-fixture measurements, not production SLAs. Detailed EXPLAIN ANALYZE instrumentation took **53.96 seconds**, while ordinary detail took2.87seconds; do not conflate them. It returned10identity rows with13binds, using indexed page-only wide joins. Overview/export perform additional constant queries when the latest-comparison date differs from the historical A date; 40→100,000 account growth retained identical query counts.

The retained [final targeted PostgreSQL log](../artifacts/osp-v3-final-pg.log) records the 10,000-target EXPLAIN regression using the named assignment index and bounded revision lookup: **0.111 ms**, three fixed metadata queries. This is a list-query fixture measurement, not a full report timing. Accepted source scope remains 100,000 accounts and a 366-day period; controlled limits are not silent truncation.

The [SQL audit](BILLING_OSP_V3_SQL_AUDIT.md) also identifies an operational boundary: the 250,000 eligible-payment limit is checked after grouped reconciliation, so it bounds accepted scope, not all database work before rejection. The configured PostgreSQL statement timeout remains the execution backstop; no per-account/payment array is returned to Node. This limitation is not evidence of incorrect accepted-scope totals or an authorization bypass.

## J. Memory and resources

Frontend requests use AbortController/request identity and clear old data when target/date/aging changes. Dialog rows are disposed on close; private workspace identity/version changes remount state. Focus/visibility listeners and unload warnings have cleanup. Dirty/save/export locks prevent destructive target changes and misleading mixed state.

Each export fetches fresh owner-scoped data. Blob URLs and temporary links are released, visual canvases reset, and multi-page rendering yields to the event loop so cancellation is handled. The export guard releases in-flight state in finally and bounds both tracked users and rate-window entries.

Current Chromium repeated-use artifact: eight target switches, eight private saves, six exports and cancellation. Baseline/final counts:1,737 DOM nodes,422 listeners,3 documents,0 active Blob URLs. JS heap11,049,760→11,427,224bytes (+377,464bytes), with no unbounded growth in tested cycles.

The final explicit-GC run repeated100,000-account detail reads and observed **0.0 MiB retained heap growth**, below the unchanged32MiB threshold. The complete npm suite independently passed the same bounded-result/query assertions (GC off, observed+0.3MiB); that observation is not substituted for the explicit-GC assertion.

Transactions rollback on errors and release acquired clients. Disposable QA databases are uniquely named and cleaned by exact target name; application/dev/production data is not the test fixture.

## K. UI/UX

TABLE A has the required eight columns; TABLE B has seven, with no account count/drilldown. Money/percentages are right-aligned and tabular. Exact signed balances remain readable; status is explained in text rather than color alone. Existing neutral/primary/success/remaining design tokens and dark-mode tokens are reused.

Creation fields follow admin → source → read-only validity/baseline → shared percentages → custom name/review/save. Name and D3–D6 percentages have field-level accessible validation and disable invalid submission. Private Target/Result percentages now reject malformed separators/signs directly, so invalid syntax cannot create a misleading financial preview. Shared controls never edit private B. The selector metadata includes assignment, source, dates and an explicit MYT last-updated time.

Tables/calendar/dialogs use internal scrolling and the project's viewport constraints. The account popup's shared Table inner wrapper owns vertical and horizontal scrolling, allowing its sticky header to remain in that same scroll region; the browser assertion is retained. Native selectors, labelled inputs, keyboard-operable aging tabs, focus-managed dialogs and visible status/error guidance are retained. Empty/unsaved/inaccessible states do not fall back to global data.

Current Chromium QA passed light/dark at effective80/100/125/150% viewports and narrow layout, long metadata and exact maximum NUMERIC(16,2)/negative private balance. Sticky-header geometry, page width, Escape and dialog cleanup passed. Main agent inspected normal and maximum-money light100/narrow screenshots; tables/calendar scroll internally. These are effective viewport simulations, not all native browser zoom engines. All three actual cookie-owner replacement export attempts passed with no download/Blob URL and cleared private UI.

## L. Verification ledger

Evidence below records actual current passes. Earlier failures are kept in E15 and the handoff's resolved-regression notes; they were investigated, not removed or relabelled. Artifact logs are local/ignored evidence, not deployed data.

| Evidence | Actual inspected source/result |
|---|---|
| E1 — complete-suite checkpoint | [osp-v3-full-tests-latest.log](../artifacts/osp-v3-full-tests-latest.log), complete `npm test` sequence ending 2026-09-05 ~14:41 UTC: client 1,022+479; scripts 331+51; contracts 124; auth 126; HTTP 327; services 549; repositories 308; routes 467; WS 85; intelligence 12. Every summary has zero failure/skip. Predates final race/provenance/detail adjustments. |
| E2 — newer full-suite attempt | [osp-v3-final-tests.log](../artifacts/osp-v3-final-tests.log): fresh full `npm test` **49659 exit0**, completed2026-09-06 00:49:32UTC. All12stages: client1029+479,scripts331+51,contracts124,auth126,HTTP327,services551,repositories310,routes467,WS85,intelligence12. Every summary has zero failure/skip. Includes final owner/strict-input/audit/exact-day/index changes. Prior scanner failure did not recur; no timeout/assertion weakened. |
| E3 — general UI | [qa-result.json](../artifacts/collection-save-access-1788655824303_f84446/qa-result.json) and [log](../artifacts/osp-v3-generic-ui-latest.log): `node scripts/collection-save-access-qa-local.mjs --ui-smoke`, **exit0,2026-09-06 00:51:39UTC**. All phases passed, including login/navigation/themes, Collection mutations, manual ABORT, Billing, receipts, actual backup/restore and logout; exact QA DB removed. |
| E4 — multi-owner OSP browser | [qa-result.json](../artifacts/collection-save-access-1788655139301_a8e53f/qa-result.json) and [OSP result](../artifacts/collection-save-access-1788655139301_a8e53f/osp-v3-results.json): `node scripts/collection-save-access-qa-local.mjs --osp-v3`, **exit0 at2026-09-06 00:41:26UTC**, all six feature groups, no page errors; includes ownership/calendar/full PII/real exports/sticky-header geometry and reassignment. |
| E5 — actual restart/resources | [Restart result](../artifacts/collection-save-access-1788655139301_a8e53f/osp-v3-restart-results.json) and [resource result](../artifacts/collection-save-access-1788655139301_a8e53f/osp-v3-resources.json): all four restart-phase groups passed: owner persistence, repeated cycles/cancel, maximum money/long metadata and real three-format cookie owner-switch denial. Exact generated DB removed. |
| E6 — targeted PostgreSQL/security | [PG log](../artifacts/osp-v3-final-pg.log):7/7passed at00:31UTC, with audit/ownership/pagination/index evidence. Current [complete suite](../artifacts/osp-v3-final-tests.log) and [sequential PostgreSQL gate](../artifacts/osp-v3-explicit-gc-latest.log) both include the latest SQL differential, owner/audit/access/race/source-history tests without skips. Service and route export/replay tests passed in E2. |
| E7 — exact-money/export tests | [Math tests](../server/lib/collection-osp-reconciliation.test.ts), [calendar/ALL tests](../server/repositories/tests/collection-osp-v7-calendar.test.ts), [source precision tests](../server/repositories/tests/collection-osp-source-precision.test.ts), [service XLSX tests](../server/services/tests/collection-osp-v7-operations.test.ts) and [visual tests](../client/src/pages/collection/billing-principal-visual-export.test.ts) passed in E2. Exact required86–88/91B/91C amounts, negative values, weighted ALL, raw numeric OOXML, safe formula text,366-day pages and cancellation covered. |
| E8 — recovery | [Full-file PostgreSQL restore](../server/repositories/tests/backups-osp-v3-postgres.integration.test.ts), [private envelopes](../server/repositories/tests/backups-collection-osp-private-utils.test.ts), [stable user access](../server/repositories/tests/backups-restore-user-access.test.ts), PII status/reencryption and legacy backup tests passed in E2. Actual encrypted-file freshDBrestore passed again in E9; actual browser backup/restore passed E3. |
| E9 — performance | [Explicit-GC log](../artifacts/osp-v3-explicit-gc-latest.log), **12/12passed,0skipped,exit0 at00:54UTC**, exact CI command: `node --expose-gc --import tsx --test --test-concurrency=1 server/repositories/tests/collection-osp-v7-postgres.integration.test.ts server/repositories/tests/collection-osp-effective-query.postgres.test.ts server/repositories/tests/backups-osp-v3-postgres.integration.test.ts server/repositories/tests/collection-osp-v3-performance.postgres.test.ts`. 100,000accounts,10-row indexed PIIpage,13binds,constant queries,0.0MiBretainedgrowth;100,001staccount controlled rejection.10,000target assignment EXPLAIN0.122ms/3fixedqueries. |
| E10 — build/lint/security/coverage | **Typecheck/lint/build97402exit0**, [build](../artifacts/osp-v3-build-latest.log) `sqr-1.0.0-f77bf3b4b85c-20260906T003517Z`, [lint](../artifacts/osp-v3-lint-latest.log), all application changes present. Post-fixture final typecheck/scopedlint/QA script syntax80993exit0. [Security](../artifacts/osp-v3-security-latest.log):10MJS+246TS passed. [Coverage](../artifacts/osp-v3-coverage-latest.log):317/317, selected86.77%lines/73.54%branches,50314exit0. |
| E11 — UI helpers/contracts | `node node_modules/tsx/dist/cli.mjs --test client/src/pages/collection/billing-principal-report-utils.test.ts client/src/pages/collection/BillingPrincipalSavedTargetValidation.test.ts client/src/pages/collection/BillingPrincipalWorkspaceLifecycle.test.ts`: **19/19 passed**, zero skipped, in this agent's newest focused run. The new malformed-percentage tests first reproduced two failures, then passed after the narrow validator fix. Scoped ESLint and diff check passed. |
| E12 — SQL/final backend audit | [SQL audit](BILLING_OSP_V3_SQL_AUDIT.md): effective-account/source/PII/authorization/query-limit review and **3/3** isolated real PostgreSQL differential tests, with the exact-day late-manual case. The audit's later §106 pass identified missing §48 audit fields; current implementation and E6 now verify that correction. Operational post-aggregation payment-limit caveat remains in I/N. |
| E13 — owner-bound exports | Mandatory stable owner DTO/header/target-read and original-owner/current-viewer/version checks inspected;35/35 focused tests passed and included in E2. E5 proves actual cookie replacement between generation and final GET for XLSX/PNG/PDF, both viewers authorized for unchanged target: **zero downloads/Blob URLs, private UI cleared**. |
| E14 — latest source-contract gates | Root confirmed process 25991 **exit 0** for repo hygiene, secrets, schema governance **56 tables**, migration rollback **62/62**, Drizzle check, PII/amount/browser-storage/env/JSON/design-token contracts and XLSX vendor integrity. This is attributed process evidence; no invented consolidated artifact. |
| E15 — newer browser attempt | Resolved: prior sticky-header failure on earlier build corrected and E4 passed. Maximum-money fixture initially exceeded per-source NUMERIC(14,2); corrected to100 valid999999999999.99rows+0.99, exactly target maximum, without widening production limits. E5 passed; no assertions/role/export limits weakened. |

Current bundle budgets and dependency audit passed (22611exit0; no moderate+ vulnerabilities). Full suite E2, generic UI E3, OSP/restart E4/E5 and explicit-GC E9 passed against current app code. Final Git status/stat/diff and untracked files were reviewed, staged diff is empty, whitespace/secret gates pass; no production/dev database writes.

`npm test` and `npm run test` are the same package script; no duplicate run is necessary solely for the two spellings. Coverage above covers the repository's selected coverage gate, not a claim that the new Billing feature or whole repository independently has that percentage.

### Full specification evidence matrix

Every section below has been checked against current implementation plus the indicated executed evidence. The final suite E2 supersedes old checkpoint test passes; E3/E4/E5 are current built-app results. All113 numbered specification entries are represented (0–109 plus91A/B/C). Operational limitations in N are not hidden.

| Spec section(s) | Requirement and implementation evidence | Verification state |
|---|---|---|
| 0 | Baseline/worktree/package/schema/route audit; branch/HEAD inspected; no unrelated reset or deployment. | Verified: baseline/package/schema audit and final tracked/untracked diff review; no unrelated reset or deployment.
| 1 | Exactly A/B → comparison → calendar. Page/workspace/insights/export sections. | Verified: current page/workspace/export source and E2/E3/E4/E7.
| 2 | Sixteen requested defects mapped across A–K and rows below. | Verified across A–K and full matrix; original16defects retained in scope.
| 3 | Four-role matrix enforced in nav, routes, services, SQL. | Verified: E2/E4/E6 four-role and SQL predicates.
| 4–5 | Assignment distinct from authenticated private owner; stable composite uniqueness and derived fields. | E4/E5/E6/E8. |
| 6–7 | A eight columns in required order; B seven/no accounts. | E3/E4/E7. |
| 8–11 | Target-based signed balances, ALL sums, weighted percentages, exact sen. | E7, required values in C. |
| 12–14 | Eligible admin → bounded configured source → validity/TT preview → percentages/name/save. | E3; source/private PostgreSQL E6. |
| 15–16 | One assigned ID; cross-admin SQL isolation across metadata/read/export. | E4/E6; list SQL current inspection. |
| 17–19 | Manager all/shared-readonly, SU config/own B, admin assigned/own B. | E4/E6. |
| 20–21 | Custom safe name; versioned SU D3–D6 A edits leave B untouched. | E4/E6/E11. |
| 22–23 | Billing-only TT and frozen source/version/name/validity/baseline/actor persistence. | E4/E5/E6. |
| 24–26 | Disabled source history retained; inclusive configured period; mixed validity rejected. | E6; legacy provenance exception in E. |
| 27 | Conflicting cross-admin same-source/period claim blocked under transaction lock. | Actual concurrent-claim test E6. |
| 28–30 | Canonical automatic/valid manual union; unique logical accounts; no POOL addition/CP-only closure. | Verified: E2/E6 differential matrix, exact-day late-manual regression and E7 exact totals.
| 31–33 | Own Target/Result %; no owner fallback; unsaved defaults become persistent independent B. | E4/E5/E6/E7. |
| 34–35 | Latest system vs own latest client; historical A date does not replace B. | E4/E5/E6. |
| 36–38 | No standalone account UI; exact-day modal, default ALL, D3–D6 resets. | E3/E4/E6. |
| 39–43 | Full authorized fields, no raw JSON, ten-row deterministic SQL page, full-filter sums/counts reconcile. | Verified: E2/E4/E6/E9 SQL page/count/full PII and current full-period calendar consistency.
| 44 | Daily/cumulative/current/previous/delta/target-based balance across aging. | E6/E7; current grouped SQL inspected. |
| 45–47 | Root causes documented; stable indexed assignment and bounded manager all-target query. | A/B/G/I; E6/E9. |
| 48–50 | Shared create/update name, old/new assignment, source IDs/period, percentages, actor/time/version audit; reassignment without B transfer; soft target-only delete. | Verified: §48 missing fields corrected and asserted in E2/E6/E9; actual E4/E5 reassignment, soft deletion and owner retention.
| 51–54 | Server validation/atomic save/current actor/target locks/private session ownership/version checks. | E6/E7; current transaction code inspected. |
| 55–57 | Private weighted ALL, zero denominator and clear UNSAVED state. | E4/E6/E7. |
| 58–60 | Fresh authorized PNG/PDF/XLSX, own B only, server-bound stable owner identity before download, metadata/A/B/comparison/calendar/no accounts, numeric safe cells. | Verified: E2/E4/E5/E7/E13; three actual owner-switch formats denied, numeric Excel consumer limitation retained.
| 61–64 | IDOR, owner/derived-field forgery, SQL/XSS controls, full PII limited to authorized scope. | Verified: E2/E4/E6/E10 role, forgery, bounded parameterization and authorized full detail.
| 65–67 | Abort stale requests, clear PII, cleanup listeners/URLs/transactions/export state. | E5/E8/E9/E11. |
| 68 | Indexed bounded target list and metadata-only source selection. | E6/E9: 10,000-target named assignment index, 0.111 ms; >50 paging and literal search passed. |
| 69–71 | Effective accounts/aging/day SQL grouping, bounded SQL detail before PII, no N+1. | E6/E9; previous JS-only gap corrected. |
| 72–75 | Logical form layout, numeric alignment, semantic tokens, constrained day popup. | Verified: inspected current UI, E2/E3/E4/E5/E11; semantic header accents and sticky-popup geometry passed.
| 76–77 | 80/100/125/150 effective viewport/light/dark/narrow; long target/source/admin names/max money. | Verified: E4/E5 current effective zoom/theme/narrow matrix and large/long/signed values; screenshots inspected. Other native browser zoom engines are not claimed.
| 78 | Explicit no-target/no-assignment/private-unsaved/no-day/source-error states; no global fallback. | E3/E4/E6 and current UI inspection. |
| 79–81 | Additive real schema, unassigned admin denial, legacy global client audit-only/unresolved ownership. | E6/E8; no fabricated owner/period. |
| 82–84 | Invalid Save disabled, strict private percentage syntax, accessible errors, complete selected metadata/Last Updated, keyboard controls. | Verified: E2/E3/E4/E5/E11 strict validation, disabled save, labelled errors, metadata and keyboard/focus/scroll behavior.
| 85 | Controlled project error/status conventions; no raw SQL/stack response. | E6/E10. |
| 86 | System RM1m/30%/250k => 50k balance, not 750k. | E7 exact test. |
| 87 | Client RM1m/30%/25% => 250k closed/50k balance. | E7 exact test. |
| 88 | ALL 600k target − 370k closed => 230k, same rule for B. | E7 exact test. |
| 89 | Assigned configured target values survive reload/relogin/restart with Aug12–Sep11 calendar. | E3/E4/E5/E6. |
| 90 | Two admins see only their targets; direct foreign ID denied. | E4/E6. |
| 91 | Manager all targets, A/calendar/detail, no shared mutation. | Verified: E2/E4/E6/E9 including >50targetmanagerpagination, A/calendar/details and shared-write denial.
| 91A | SU A30→32, manager/admin readonly; saved B unchanged. | E4/E6. |
| 91B | SU25/20, manager35/28, admin40/30 yield distinct own targets/closed/balances; shared A stays independent. | E4/E5/E6 plus exact RM1m examples in E7. |
| 91C | ALL private target/result percentages use sum/ALL TT, not arithmetic average. | E7 private ALL/helper tests. |
| 92–93 | Each owner reloads own B; forged owner rejected/ignored securely. | E4/E5/E6. |
| 94 | Both configured endpoints included, outside cells unavailable, private date irrelevant. | E4/E6/E7. |
| 95–96 | Six-account per-aging fixture plus twelve-account browser pagination; complete leading-zero PII; foreign admin zero rows. | E4/E6. |
| 97–98 | Standalone section gone; unticked source retains shared/private/history/calendar. | E3/E4/E6/E7. |
| 99 | Old admin loses/new gains without private transfer; all-scope roles retain access. | E4/E5/E6. |
| 100 | Authentication/role/IDOR/mass assignment/forged source/admin/SQL/XSS/export controls. | E4/E6/E10; no universal security claim. |
| 101 | Distinct SU edit race, private tabs, access change during reads/detail/export and waiting save; export session owner switch. | Verified: E2/E6/E9 real PostgreSQL races and E5/E13 real same-target cookie-owner export replacement.
| 102 | Indexed list, bounded options, constant queries, SQL grouping/page, no workbook reparse. | E6/E9; production workload validation still operational. |
| 103 | Repeated target/save/dialog/aging/export/cancel cleanup. | E5 actual counters; E9 backend retained heap. |
| 104 | Actual components/routes/schema/services/source/export/tests located. | A–M current source inventory. |
| 105 | Actual package commands and honest results. | Verified: all commands/results in L; current fullsuite/build/typecheck/lint/browser/security/coverage/explicitGC passed.
| 106 | Final status/stat/full diff/staged diff and focused risk review. | Verified: actual status/stat/tracked diff/untracked files and empty staged diff reviewed by root plus bounded backend/frontend audits. Percentage/audit/owner-binding findings corrected and tested.
| 107 | A–N engineering report, tests/files/risks and section evidence. | Complete: A–N report,86fileinventory,113sectionmatrix, executed evidence and explicit operational risks.
| 108 | Forbidden architecture/auth/math/source/PII/per-account-query changes checked across implementation. | Verified in final current-source review plus E2/E4/E5/E6/E7/E9. No forbidden shared B, unsafe admin visibility, wrong balance/source/OSP or standalone account surface.
| 109 | Entire requested end state, with all listed quality gates. | Complete for requested implementation/local verification; all stated functional and quality gates supported by E2–E15. No deployment/commit/push included.

## M. Files changed and purpose

Inventory captured from actual `git status --porcelain=1`: **86 changed/untracked paths, including this report and the SQL audit**. Generated/ignored test artifacts are evidence, not source changes or committed secrets. Refresh this inventory after subsequent edits.

| File | Purpose |
|---|---|
| [.github/workflows/ci.yml](../.github/workflows/ci.yml) | Seed a per-run ephemeral eligible admin for the assigned-target CI smoke workflow. |
| [client/src/lib/api/collection-billing-principal.ts](../client/src/lib/api/collection-billing-principal.ts) | Typed/Zod contracts for assignment, validity provenance, private percentages/balances, full detail, bounded options/preview/pagination and mandatory stable export/target-read owner identity. |
| [client/src/pages/CollectionReport.tsx](../client/src/pages/CollectionReport.tsx) | Expose staff Billing navigation and suppress nickname selection only on the account-assigned Billing page. |
| [client/src/pages/collection-report/CollectionReportContent.tsx](../client/src/pages/collection-report/CollectionReportContent.tsx) | Render authorized Billing before the unrelated nickname gate; retain Collection entry restrictions elsewhere. |
| [client/src/pages/collection-report/useCollectionReportNavigation.ts](../client/src/pages/collection-report/useCollectionReportNavigation.ts) | Hide/deny Billing navigation for ordinary users and enforce staff route selection. |
| [client/src/pages/collection/BillingPrincipalDayDialog.tsx](../client/src/pages/collection/BillingPrincipalDayDialog.tsx) | Exact-day ALL/D3–D6 ten-row popup with full authorized details, stable pagination and stale-request cleanup. |
| [client/src/pages/collection/BillingPrincipalInsights.test.ts](../client/src/pages/collection/BillingPrincipalInsights.test.ts) | Full configured month ranges, stable calendar grid, exact-day ten-row filters and unchanged-target/original-owner export authorization. |
| [client/src/pages/collection/BillingPrincipalInsights.tsx](../client/src/pages/collection/BillingPrincipalInsights.tsx) | Full-validity calendar, exact-day entry point, fresh owner-scoped exports, response/current-session owner checks before download and cancellation. |
| [client/src/pages/collection/BillingPrincipalReportPage.tsx](../client/src/pages/collection/BillingPrincipalReportPage.tsx) | Saved-target-only staff workspace keyed by authenticated identity; remove the live global report surface. |
| [client/src/pages/collection/BillingPrincipalSavedTargetDialog.tsx](../client/src/pages/collection/BillingPrincipalSavedTargetDialog.tsx) | Superuser assigned-admin/source preview/shared percentages form with read-only dates and accessible validation. |
| [client/src/pages/collection/BillingPrincipalSavedTargetShell.tsx](../client/src/pages/collection/BillingPrincipalSavedTargetShell.tsx) | Bounded target selector, shared management, current authorization, legacy provenance/metadata and draft/busy transition locks. |
| [client/src/pages/collection/BillingPrincipalSavedTargetValidation.test.ts](../client/src/pages/collection/BillingPrincipalSavedTargetValidation.test.ts) | Name/percentage validity, disabled-submit/accessibility wiring and explicit MYT timestamp rendering. |
| [client/src/pages/collection/BillingPrincipalSavedTargetWorkspace.tsx](../client/src/pages/collection/BillingPrincipalSavedTargetWorkspace.tsx) | Eight-column A, seven-column private B, exact previews, unsaved/discard state, latest comparison and operation lifecycle locks. |
| [client/src/pages/collection/BillingPrincipalV7Api.test.ts](../client/src/pages/collection/BillingPrincipalV7Api.test.ts) | Assigned/private API contracts and fail-closed missing owner DTO/binary-header tests. |
| [client/src/pages/collection/BillingPrincipalWorkspaceLifecycle.test.ts](../client/src/pages/collection/BillingPrincipalWorkspaceLifecycle.test.ts) | Dirty/save/export transitions, unload warning cleanup and shared management locks. |
| [client/src/pages/collection/billing-principal-report-utils.test.ts](../client/src/pages/collection/billing-principal-report-utils.test.ts) | Exact private preview, weighted totals/signed balances and strict percentage grammar/no malformed preview regressions. |
| [client/src/pages/collection/billing-principal-report-utils.ts](../client/src/pages/collection/billing-principal-report-utils.ts) | BigInt private Target/Closed/Balance and weighted ALL previews; unsigned exact percentage validation aligned with backend syntax. |
| [client/src/pages/collection/billing-principal-v7-test-fixture.ts](../client/src/pages/collection/billing-principal-v7-test-fixture.ts) | Owner-aware A/B, source-provenance, calendar and export fixtures. |
| [client/src/pages/collection/billing-principal-visual-export.test.ts](../client/src/pages/collection/billing-principal-visual-export.test.ts) | Five report sections, no standalone PII, 366-day bounds, numeric alignment and cancellation/text wrapping. |
| [client/src/pages/collection/billing-principal-visual-export.ts](../client/src/pages/collection/billing-principal-visual-export.ts) | PNG/PDF A/B/comparison/calendar layout, balance/owner/provenance metadata, numeric alignment and fresh pre-download authorization. |
| [docs/BILLING_OSP_V3_PROGRESS.md](../docs/BILLING_OSP_V3_PROGRESS.md) | Persistent implementation/evidence handoff for another session or account; historical checkpoints are explicitly dated. |
| [docs/BILLING_OSP_V3_SQL_AUDIT.md](../docs/BILLING_OSP_V3_SQL_AUDIT.md) | Independent effective-SQL/differential/final backend audit with resource limits, exact-day evidence and historical §48 finding now corrected. |
| [drizzle/0062_collection_osp_private_client_ownership.sql](../drizzle/0062_collection_osp_private_client_ownership.sql) | Add stable assignment, encrypted full-detail fields, private percentages, owner uniqueness/FKs/checks and indexes. |
| [drizzle/meta/_journal.json](../drizzle/meta/_journal.json) | Register additive migration 0062 in migration order. |
| [scripts/billing-osp-v3-smoke.mjs](../scripts/billing-osp-v3-smoke.mjs) | Real multi-owner browser/RBAC/export/calendar/layout/resource/restart fixtures, sticky popup/large-value/long-metadata layout and actual cookie replacement during all three exports. |
| [scripts/collection-save-access-qa-local.mjs](../scripts/collection-save-access-qa-local.mjs) | Exact disposable PostgreSQL QA scope, staff identities, OSP mode, actual server restart and terminal result artifacts. |
| [scripts/collection-v7-pii-status.test.ts](../scripts/collection-v7-pii-status.test.ts) | New snapshot fields, unreadable ciphertext and key rewrite/retirement status tests. |
| [scripts/collection-v7-pii-status.ts](../scripts/collection-v7-pii-status.ts) | Audit all five encrypted snapshot identity fields for safe key retirement. |
| [scripts/db-migration-rollback.manifest.mjs](../scripts/db-migration-rollback.manifest.mjs) | Register the additive V3 migration rollback classification. |
| [scripts/db-schema-governance.manifest.mjs](../scripts/db-schema-governance.manifest.mjs) | Register new private table and owned indexes/constraints for governance. |
| [scripts/tests/ui-smoke-navigation-contract.test.mjs](../scripts/tests/ui-smoke-navigation-contract.test.mjs) | Replace obsolete global Billing smoke expectations with V3 assigned/private workflow contracts. |
| [scripts/ui-smoke.mjs](../scripts/ui-smoke.mjs) | Create assigned target from configured validity, verify private save/shared edit/calendar and fresh exports in generic UI smoke. |
| [server/internal/collection-bootstrap-osp-private-schema.ts](../server/internal/collection-bootstrap-osp-private-schema.ts) | Idempotent additive runtime bootstrap/deferred FK registration matching migration 0062. |
| [server/internal/collection-bootstrap-source-schema.ts](../server/internal/collection-bootstrap-source-schema.ts) | Invoke the additive V3 schema bootstrap in the established collection bootstrap order. |
| [server/lib/collection-osp-reconciliation.test.ts](../server/lib/collection-osp-reconciliation.test.ts) | Required exact balance/private examples, rounding, zero and existing effective-settlement invariants. |
| [server/lib/collection-osp-reconciliation.ts](../server/lib/collection-osp-reconciliation.ts) | Exact private percentage normalization, percentage-derived money and signed target-minus-closed helper. |
| [server/lib/saved-collection-link-utils.ts](../server/lib/saved-collection-link-utils.ts) | Extract known full display fields while preserving leading zeroes; never return arbitrary source JSON. |
| [server/repositories/backups-collection-osp-private-utils.ts](../server/repositories/backups-collection-osp-private-utils.ts) | Encrypt whole private backup rows with purpose/identity binding; restore original owners only and retain newer private records. |
| [server/repositories/backups-collection-v7-pii-utils.ts](../server/repositories/backups-collection-v7-pii-utils.ts) | Re-encrypt optional frozen card/identification/phone backup values and reject unreadable ciphertext. |
| [server/repositories/backups-payload-collection-utils.ts](../server/repositories/backups-payload-collection-utils.ts) | Include stable saved-target assignment in backup DTO mapping. |
| [server/repositories/backups-payload-utils.ts](../server/repositories/backups-payload-utils.ts) | Stream new encrypted private row envelopes and added frozen PII through existing backup paging. |
| [server/repositories/backups-payload-write-utils.ts](../server/repositories/backups-payload-write-utils.ts) | Include private-result counts in prepared backup metadata. |
| [server/repositories/backups-repository-types.ts](../server/repositories/backups-repository-types.ts) | Backup private-envelope types, assigned ID and new section counts. |
| [server/repositories/backups-restore-collection-dataset-types.ts](../server/repositories/backups-restore-collection-dataset-types.ts) | Restore DTOs for assignment and new encrypted detail fields. |
| [server/repositories/backups-restore-collection-governance-utils.ts](../server/repositories/backups-restore-collection-governance-utils.ts) | Keep source/legacy target restore SQL type-safe for streamed VALUES input. |
| [server/repositories/backups-restore-collection-v7-normalize-utils.ts](../server/repositories/backups-restore-collection-v7-normalize-utils.ts) | Normalize stable assignment and encrypted identity values without fabricated ownership. |
| [server/repositories/backups-restore-collection-v7-write-utils.ts](../server/repositories/backups-restore-collection-v7-write-utils.ts) | Restore assigned target/source snapshots with valid actor/source joins and typed timestamps/arrays. |
| [server/repositories/backups-restore-core-datasets-utils.ts](../server/repositories/backups-restore-core-datasets-utils.ts) | Preserve backed-up stable user IDs and access restrictions; only absent legacy fields receive defaults. |
| [server/repositories/backups-restore-stats-utils.ts](../server/repositories/backups-restore-stats-utils.ts) | Initialize/count the private-result restore section. |
| [server/repositories/backups-restore-utils.ts](../server/repositories/backups-restore-utils.ts) | Restore private envelopes after users/targets/baselines within the existing transaction. |
| [server/repositories/collection-osp-effective-query.ts](../server/repositories/collection-osp-effective-query.ts) | Reusable source-scoped SQL effective-account relation, aging totals and grouped closure days with no PII/private row projection. |
| [server/repositories/collection-osp-repository-error.ts](../server/repositories/collection-osp-repository-error.ts) | Shared controlled OSP repository error without circular source-helper dependency. |
| [server/repositories/collection-osp-source-scope-repository-utils.ts](../server/repositories/collection-osp-source-scope-repository-utils.ts) | Bounded literal options, canonical preview/date validation, source precision and transactional exclusive assignment checks. |
| [server/repositories/collection-osp-v7-repository-utils.ts](../server/repositories/collection-osp-v7-repository-utils.ts) | Authoritative target ownership, transactions, private reads/writes, complete shared audit, indexed target lists, SQL aggregates, exact-day detail and final authorization rechecks. |
| [server/repositories/collection.repository.ts](../server/repositories/collection.repository.ts) | Expose configured-target options and source preview through the repository facade. |
| [server/repositories/tests/backups-collection-osp-private-utils.test.ts](../server/repositories/tests/backups-collection-osp-private-utils.test.ts) | Encrypted private evidence roundtrip, owner/identity tampering, bounds and permitted newline handling. |
| [server/repositories/tests/backups-collection-v7.test.ts](../server/repositories/tests/backups-collection-v7.test.ts) | Frozen PII and legacy-safe backup normalization/restore contracts. |
| [server/repositories/tests/backups-osp-v3-postgres.integration.test.ts](../server/repositories/tests/backups-osp-v3-postgres.integration.test.ts) | Actual encrypted backup file into a fresh DB, stable private ownership/full PII/access restrictions and rollback/non-overwrite proof. |
| [server/repositories/tests/backups-repository-encryption.test.ts](../server/repositories/tests/backups-repository-encryption.test.ts) | Include the private-envelope dataset in the encrypted backup contract. |
| [server/repositories/tests/backups-restore-user-access.test.ts](../server/repositories/tests/backups-restore-user-access.test.ts) | Stable user ID, status and password restriction preservation; strict invalid-field rejection. |
| [server/repositories/tests/collection-osp-effective-query.postgres.test.ts](../server/repositories/tests/collection-osp-effective-query.postgres.test.ts) | SQL versus BigInt differential scenarios, exact-day/current-calendar consistency and fail-closed scope/baseline evidence. |
| [server/repositories/tests/collection-osp-source-precision.test.ts](../server/repositories/tests/collection-osp-source-precision.test.ts) | Controlled NUMERIC(16,2) boundary/overflow verification. |
| [server/repositories/tests/collection-osp-v3-performance.postgres.test.ts](../server/repositories/tests/collection-osp-v3-performance.postgres.test.ts) | 40 versus 100,000 accounts, bounded SQL/results, page-only PII EXPLAIN and retained-resource regressions. |
| [server/repositories/tests/collection-osp-v7-calendar.test.ts](../server/repositories/tests/collection-osp-v7-calendar.test.ts) | A/B exact totals, weighted private targets, date/contribution semantics and resource bounds. |
| [server/repositories/tests/collection-osp-v7-postgres.integration.test.ts](../server/repositories/tests/collection-osp-v7-postgres.integration.test.ts) | Real PostgreSQL ownership, concurrency, assignment, full PII, source deactivation, pagination and indexed-list EXPLAIN regressions. |
| [server/routes/collection/collection-billing-principal-v7-routes.ts](../server/routes/collection/collection-billing-principal-v7-routes.ts) | Staff reads/private writes, superuser configuration, no-store responses, server-bound binary export owner header and owner/revision-scoped replay reauthorization. |
| [server/routes/collection/collection-source-match-routes.ts](../server/routes/collection/collection-source-match-routes.ts) | Restrict legacy unassigned global Billing aggregates to superuser, closing an assignment bypass. |
| [server/routes/tests/collection-billing-principal-v7-routes.integration.test.ts](../server/routes/tests/collection-billing-principal-v7-routes.integration.test.ts) | Role matrix, ordinary/unauthenticated denial, private replay ownership and controlled conflicts. |
| [server/routes/tests/operations.routes.integration.test.ts](../server/routes/tests/operations.routes.integration.test.ts) | Update backup result fixtures for the additional private section. |
| [server/services/backup-operations-integrity-utils.ts](../server/services/backup-operations-integrity-utils.ts) | Recognize new private-result totals in backup integrity checks. |
| [server/services/collection.service.ts](../server/services/collection.service.ts) | Forward viewer/query/options/preview to the established collection service. |
| [server/services/collection/collection-osp-v7-export-guard.ts](../server/services/collection/collection-osp-v7-export-guard.ts) | Bound single-flight exports, four formats per minute, and tracked-user memory. |
| [server/services/collection/collection-osp-v7-operations.ts](../server/services/collection/collection-osp-v7-operations.ts) | Validate staff/shared/private inputs, derive session ownership, use canonical calendar scope and build safe A/B exports with final reauthorization. |
| [server/services/collection/collection-record.service.ts](../server/services/collection/collection-record.service.ts) | Service facade forwarding for V3 target options/preview/pagination. |
| [server/services/collection/collection-service-support.ts](../server/services/collection/collection-service-support.ts) | Extend storage port selection for V3 capabilities. |
| [server/services/collection/collection-source-governance-operations.ts](../server/services/collection/collection-source-governance-operations.ts) | Reject non-superuser use of legacy globally scoped Billing report operations. |
| [server/services/tests/backup-operations-integrity-utils.test.ts](../server/services/tests/backup-operations-integrity-utils.test.ts) | Private-section integrity totals regression. |
| [server/services/tests/backup-operations.service.test.ts](../server/services/tests/backup-operations.service.test.ts) | Backup/restore service fixtures include private result counts. |
| [server/services/tests/collection-osp-v7-export-guard.test.ts](../server/services/tests/collection-osp-v7-export-guard.test.ts) | Four-format quota, single-flight release and bounded guard-state tests. |
| [server/services/tests/collection-osp-v7-operations.test.ts](../server/services/tests/collection-osp-v7-operations.test.ts) | Mass-assignment/role tests, exact numeric XLSX and formula protection, export generation reauthorization and size limits. |
| [server/storage-postgres-collection-contracts.ts](../server/storage-postgres-collection-contracts.ts) | Typed stable viewer/assignment/private/options/preview storage contracts. |
| [server/storage-postgres-collection-types.ts](../server/storage-postgres-collection-types.ts) | V3 viewer, provenance, private balance and full drilldown types. |
| [server/storage/postgres/postgres-collection-storage.ts](../server/storage/postgres/postgres-collection-storage.ts) | Forward the V3 contract through PostgreSQL storage. |
| [shared/schema-postgres-collection.ts](../shared/schema-postgres-collection.ts) | Declare assigned-admin FK/index, encrypted snapshot detail and private owner/aging table. |
| [shared/schema-postgres.ts](../shared/schema-postgres.ts) | Export the new private schema table. |
| [docs/BILLING_OSP_V3_ENGINEERING_REPORT.md](BILLING_OSP_V3_ENGINEERING_REPORT.md) | This A–N report, complete changed-file inventory, verification limitations and specification evidence matrix. |

## N. Operational risks and release notes

1. **No blanket bug-free/security guarantee.** Role/privacy/formula/resource protections are supported by the specified regression and browser tests, not a claim about every possible deployment or input.
2. **Not deployed.** This is a pre-publication verification snapshot. The user subsequently authorized commit/push; production migration, release approval and backup policy remain separate actions. No production/dev records were used for QA.
3. **Legacy provenance/ownership must not be invented.** Unassigned/unverified old targets remain explicitly labelled and admin-invisible until assigned. Historical global client references are audit-only, never copied into another owner's private B. Recreate a verified configured-source target when historical provenance cannot be established.
4. **Excel consumer precision.** Numeric XML retains exact decimals, but Excel arithmetic has15-significant-digit precision. Use authoritative backend/exact CSV for extreme-value reconciliation. Per-source values retain NUMERIC(14,2); per-aging target aggregates are bounded NUMERIC(16,2).
5. **Performance is workload-specific.** Local100,000account/10,000target figures are not production SLAs. The250,000payment check follows aggregation; configured statement timeouts guard database work, and output to Node is bounded. Full distributions/capacity still require normal operational monitoring.
6. **Exports are intentionally bounded.** Single-flight process guard,4exports/user/minute,16MiB dataset limit, bounded page/canvas lifecycle and request cancellation remain. Existing deployment-wide API limiting handles multi-process scope.
7. **PII/key retention.** Authorized day details are deliberately full/unmasked. Fixture artifacts contain synthetic values; never publish real sensitive exports. Archived encrypted backups still need their historical decryption keys; this feature does not authorize production key retirement.
8. **Browser coverage.** Chromium effective80/100/125/150% layouts, light/dark/narrow and repeated resource cycles passed. This is not a claim of all native zoom engines or indefinite zero memory growth. Observed explicit-GC backend retained growth was0.0MiB; browser retained growth377,464bytes with stable DOM/listeners/Blob counts.
9. **Resolved regressions remain documented.** Late-manual exact-day consistency, private-input grammar, audit field completeness, popup scroll ownership and cross-owner export reauthorization were corrected. The prior scanner timing failure passed isolated and full reruns without relaxed assertions; oversized QA source rows were corrected within existing source limits.
