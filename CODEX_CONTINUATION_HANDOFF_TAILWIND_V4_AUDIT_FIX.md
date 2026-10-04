# Tailwind 4 audit fix — cross-account continuation

## Status: 2026-10-04 (Asia/Singapore)

Implementation and final local verification are COMPLETE, including the previously
failing strict Lighthouse gate. User explicitly approved small landing performance
optimization ("boleh"), then "sambung". ProductPreview retains every tab-panel ARIA
target but mounts only the active demo; RelativeDate shares one locale formatter.
No landing CSS/design change, hidden section, threshold relaxation or snapshot
update was needed. Strict Lighthouse passed twice: landing86/login90 (run-hak7tw)
and landing85/login88 (run-Qq3hTO), both with thresholdFailures=[]. These are local
measurements, not a guarantee of identical scores on another machine.

All final test processes are terminal and their disposable app/database fixtures
were stopped and removed. No deployment or production-data mutation was performed.
Final secret guard passed for all101 changed/new source files and git diff --check
passed. Completion audit passed and the goal is COMPLETE.
User explicitly requested commit and push on 2026-10-04. This checkpoint accompanies
that delivery; use git log/status and origin/main to confirm its commit/push state.
GitHub CI must be inspected after push; local verification is not remote CI evidence.
Do not redo completed implementation merely because a new account continues.

## Authorization and workspace

User approved a controlled Tailwind3→4 migration after CI dependency audit failed,
then explicitly requested a persistent goal and cross-account handoff.
Preserve existing UI, public/private CSS separation and auth/permissions. Keep
changes minimal. Commit and push are now authorized; deployment is not authorized.

- Workspace: `C:\Users\Administrator\Desktop\SQR\sumbanganqueryrahmah`.
- Branch main; pre-migration base `cfa32b0ce3dd33e7584b38a9f6148063f6b92d3f`.
- Read AGENTS.md and inspect git status/log before continuing. Preserve prior
  Dashboard / personal Account/Security work and the completed migration.
- Never read/commit dotenv or credentials; no production server/data touched.
- Serialize heavy checks on this4GB host. Typecheck/lint need2GB Node heap;
  a local1GB cap caused OOM once, not a TypeScript error.2GB rerun passed.

## Confirmed root cause

GitHub CI run37118294053 /job111189250290 failed Audit dependencies. Coverage and
smoke were skipped, not independent failures. Local audit reproduced five high
findings via Tailwind3→braces/chokidar/micromatch/fast-glob.
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) had no
patched braces version at verification time. Do not add audit exceptions or run
npm audit fix --force. [Official migration guide](https://tailwindcss.com/docs/upgrade-guide).

## Implemented changes

- Exact official pins: tailwindcss4.3.3, @tailwindcss/postcss4.3.3,
  tailwind-merge3.7.0. Remove unused autoprefixer; regenerate lockfile.
  Only existing resolved versions changed: Tailwind, merge and jiti1→2.
  Vulnerable braces/micromatch/fast-glob/chokidar chain is absent.
- tailwind.compat.cjs freezes v3 sRGB palette/scales with MIT notice.
- Reference theme, unlayered utilities, explicit bounded sources; public alone
  owns preflight. Authenticated exclusions cover public-only routes/test files.
  Existing runtime font/spacing/shadow tokens do not self-reference.
- scripts/lib/tailwind-postcss-compat.mjs preserves following-sibling spacing and
  dividers including hidden/reverse/grouped selectors; simplifies only equivalent
  opaque HSL+transparent mixes/fallbacks to stay inside unchanged CSS budgets.
- Animate-plugin resets use zero specificity so v4 variant ordering cannot erase
  explicit side/state/swipe modifiers. Negative token distances use valid calc()
  instead of legacy plugin's invalid -var(). Actual browser motion is tested.
- Explicit Radix CSS vars; outline-hidden preserves forced-colors behavior;
  v4 trailing ! syntax fixes desktop Home visibility; preserve /srgb gradients
  and old default blue50% focus ring.
- Transform-only centering for Dialog/AlertDialog and matching fullscreen General
  Search override; transform-only Select offsets/Toast swipes/legacy login toggle
  prevent additive motion. SideTab transition list includes translate.
- Vite performs CSS minification once for supported browsers. Firefox floor128;
  Chrome120/Edge120/Safari17.4 unchanged, documented.
- Actual smoke uncovered old Backup text locators selecting hidden mobile crumbs:
  all3 now require exact main-content heading. Profile helper waits for visible
  controls after lazy shell mount. Sidebar overlap assertion added. No auth/error
  assertion removed or timeouts/thresholds weakened.
- No backend, database, auth, permission, workflow or snapshot-baseline changes.

## Verified evidence on final source

Ignored local artifact logs (not release files):

| Requirement | Evidence |
| --- | --- |
| Live audit | tailwind-v4-landing-raw-audit.json validated report version2 and all severities/total0; tailwind-v4-landing-audit-policy.log passes unchanged moderate+ policy |
| Reproducible lock | npm ci --dry-run --ignore-scripts --no-audit --no-fund passed; npm ls chain absent |
| Full tests | tailwind-v4-landing-full-tests.log:4,640 pass,0 fail,64 existing conditional skips (4,704 total) |
| Typecheck | tailwind-v4-landing-typecheck.log: exit0 |
| Full lint | tailwind-v4-landing-lint.log: client/server exit0 |
| Production build | tailwind-v4-landing-build.log: pass,0 production sourcemaps |
| Bundle budgets | tailwind-v4-landing-verify-bundle-budgets.log: all pass, original limits unchanged |
| CSS compatibility | tailwind-v4-compat-final.log:9/9 pass; production and optimized compiler output |
| Browser regression | tailwind-v4-landing-all-browser.log:107/107 pass, original screenshots unchanged |
| Landing built | tailwind-v4-landing-browser-final.log:22 checks pass,8 widths; all preview tabs/ARIA,keyboard,touch,anchors,carousel,WCAG,CSP,login round-trip |
| Actual UI smoke | tailwind-v4-landing-final-smoke.log: all phases through logout pass; run-xbkUUV |
| Visual layout | tailwind-v4-smoke/run-Qq3hTO/visual:47 route/viewport JSON/captures, gate exit0 |
| Strict Lighthouse | tailwind-v4-landing-final-pagespeed.log and tailwind-v4-landing-final-release-gates.log: two strict passes, no threshold failures; all temporary fixtures cleaned |
| Smoke regressions | tailwind-v4-smoke-contracts.log:15/15 pass |
| Hygiene | Repo hygiene, secret scan (including changed/untracked source), token guards and git diff --check pass |

Earlier-migration supplemental evidence (before the last compatibility-plugin
edits, not claimed as independent final-source runs): auth feedback contracts
passed in tailwind-v4-auth-browser.log; public password 32 cases passed in
tailwind-v4-public-build.log; Auth V17 38 checks passed in tailwind-v4-auth-v17.log;
landing 22 checks passed in tailwind-v4-landing.log. The later full 107-browser
suite, actual UI smoke and layout gate above did run against the final build.
The final follow-up also passed hygiene and both design-token guards; a sandbox
Git inventory error128 required a read-only unsandboxed rerun, which passed.
Hero and security screenshots from the final mobile run were visually inspected.

Final CSS sizes: public58.5KB raw/12.1KB gzip (limits140/14); authenticated135.6KB
raw/22.7KB gzip (limits140/24). No threshold or snapshot adjustments.

All temporary PostgreSQL/app fixtures were stopped and removed by validated-path
cleanup. Synthetic evidence is retained under ignored artifacts. Existing uploads,
receipts and collection records were not used. No remote CI rerun is claimed.
Lock installation verification was a dry run, not a fresh full Linux install.
Browser execution evidence is Chrome; Firefox/Safari runtime checks remain
manual/staging checks, not claimed as completed by this migration.

## Historical failing gate and before/after diagnosis (resolved)

- Strict Lighthouse actual app run-ZV4aoc: landing performance79 (<85), a11y96,
  bestPractices100, SEO100; login90/100/100 (login SEO66 is not a gated metric).
- Isolated repeat run-VWouwp: landing79, login90. Log
  tailwind-v4-pagespeed-repeat.log. No concurrent heavy tests during this run.
- Controlled CSS comparison: verified SHA512 of approved release7a2cd32e archive;
  extracted ONLY its public CSS into artifacts/tailwind-v3-css-reference. Git
  diff7a2cd32e..HEAD confirms unchanged landing source/public entry/public config.
  Current app/JS plus old CSS in a disposable copy scores landing76, login90.
  Log tailwind-v3-css-pagespeed-comparison.log; run-FZWwpj. Current repo build
  was NOT replaced; no old vulnerable packages installed. This mixed-artifact
  diagnostic alone cannot establish full old-release baseline performance.
- Full prior-release comparison: extracted only dist-local/public (HTML, JS, CSS
  and assets) from the same SHA512-verified approved release 7a2cd32e archive,
  after checking archive paths and excluding links. Ran this frontend with the
  same disposable current backend/DB and unchanged Lighthouse settings, without
  modifying the repository build or installing old packages. Run-YHcGmb scores
  landing83 (<85), a11y96, bestPractices100, SEO100; login90/100/100. Landing FCP
  1.9s, LCP3.1s, TBT370ms, CLS0. Log: tailwind-v3-full-pagespeed-comparison.log.
  Therefore the current migration is not necessary for a local threshold failure,
  but the measurements do NOT establish no performance regression (current79 vs
  full baseline83). Neither result is a strict Lighthouse pass.
- Gate reports overallStatus=success for valid Lighthouse reports even when
  thresholdFailures is nonempty; runner correctly exits1. Do not misreport it.
- Landing's dominant cost is existing Style/Layout and long initial-render task;
  no landing performance/design source changes were made in this migration.
- Additional read-only migration-specific review found no justified compiler/CSS
  correction to make. In the existing current/full-old reports, style/layout was
  514ms/558ms and document completion was 595ms/625ms. The first external stylesheet
  request started at 1255ms/896ms; public CSS at 1274.5ms/906.5ms. The extra current
  delay is already visible before external CSS/JS downloads, so migration CSS
  parsing cannot directly explain that gap. This supports investigating navigation
  or host scheduling, but is not proof of equivalence or a passing gate. Exact
  document TTFB is unavailable: Lighthouse's response-time audit reports "No
  navigations insights found". Do not mislabel document completion as TTFB.
  Public CSS transfer grows only 558 bytes; no private CSS leakage or unbounded
  selector generation was found. Do not add speculative CSS patches to chase a score.

The earlier authorization blocker is resolved by the user's explicit approval.
Small landing follow-up: conditional preview demo content removes148 initially
hidden DOM elements (690→542 in the local profiler), without dropping tab-panel
ARIA targets; shared Intl.DateTimeFormat retains the same en-GB calendar dates.
No speculative CSS containment, grid changes or font override was retained.
No section is lazy-hidden; hash navigation and full-page layout remain eager.
The lazy-preview-only Lighthouse step reached84/85 (run-RErGgq), still a failure;
the final two-change patch reached86/85 with login90 (run-hak7tw), strict PASS.
Confirmation after the full regressions/actual smoke/layout also passed at85/85
with login88 (run-Qq3hTO). CLS remained0; landing accessibility96, bestPractices100,
SEO100. Login accessibility/bestPractices100; no SEO threshold applies to login.
New browser assertions verify all three panels and empty inactive content at all
eight widths. A new RelativeDate unit test verifies shared formatting across day,
month and year boundaries. All these tests passed on the final source.

Commit/push are now requested. Inspect GitHub CI for the pushed commit; deploy
only after release approval. There is no remaining local code or
verification task in this goal. Preserve all101 changed/new task files (93 tracked
changes and8 new files); do not revert the migration when switching accounts.

To continue from another account, open this same checkout and ask: "Read
CODEX_CONTINUATION_HANDOFF_TAILWIND_V4_AUDIT_FIX.md, inspect the current diff, and
continue only the remaining work I authorize." The file is the portable checkpoint;
goal metadata may be tied to the current chat/account. Another machine also needs
the uncommitted patch/new source files, not just this document. Do not lose those
files or commit them without permission. Ignored artifacts stay on this machine.

## Safe runners if further checks are needed

- node artifacts/tailwind-v4-verify.mjs test (or run SCRIPT): sanitized OS-only
  environment, nonexistent dotenv, PGport1;1GB tests/2GB typecheck and lint.
- node artifacts/run-dashboard-v79-chrome.mjs --workers=1: built static frontend,
  intercepted APIs, installed Chrome, no production DB. Do not update snapshots.
- node artifacts/personal-auth-browser-verify.mjs: synthetic dev auth harness.
- node artifacts/test-ci-smoke-isolated-35566082610.mjs: real smoke on fresh
  temp PostgreSQL17, loopback only, random synthetic accounts, disposable app cwd.
  Validates data_directory before mutations, cleans only its own validated temp
  tree after child shutdown. Read helper before running. Existing receipt scanner
  fixture is intentional CI-only, not production security configuration.
- The same ignored helper --release-gates runs real layout then strict Lighthouse;
  --pagespeed-only runs just strict Lighthouse. --baseline-css is diagnostic ONLY,
  requires --pagespeed-only, and substitutes prior public CSS in disposable copy.
- --baseline-public is also diagnostic ONLY and requires --pagespeed-only; it
  substitutes the complete extracted prior public frontend in the disposable copy.
  It cannot be combined with --baseline-css. Neither mode changes source/dist or
  validates the current release as passing.
- Helpers are local artifacts: another machine must reproduce the isolation,
  never substitute production credentials. Latest sessions are terminal; no
  background service is intentionally retained.

## Rollback

Revert manifest/lock/config/CSS/class migration together, not Tailwind alone. Old
graph remains vulnerable; rollback is not a security fix. Rebuild release from
final committed source and pass CI before deployment. A separately observed audit
runner malformed-report validation weakness is outside this advisory fix; do not
weaken the gate or expand scope silently.
