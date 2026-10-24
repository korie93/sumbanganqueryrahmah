# Dependency Notes

This file records the final-polish dependency decisions that operators need during release reviews. The canonical automated gate remains:

```bash
npm run audit:dependencies
```

That command runs `npm audit --json`, fails on moderate-or-higher advisories, rejects unexpected external tarballs, enforces documented package overrides, and checks exact pins for security-critical runtime packages.

## 2026-10-24 parser, mail and validation security updates

[CI run 40090798066](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/40090798066)
on `72a80840` failed Audit dependencies for `body-parser` (high), `nodemailer`
(moderate), `zod` (high), and the inherited `zod-validation-error` finding.
These are complete advisory results, not registry transport errors.

The manifest/lock update changes eight resolved packages only:

- `body-parser` 2.3.0 to 2.4.0 for
  [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828),
  with its required `qs` 6.16.1, `iconv-lite` 0.7.3 and nested `content-type` 2.1.0.
  Express remains pinned to 5.2.1 and continues to resolve a compatible 2.x parser.
- `nodemailer` 10.0.13 to 10.1.7 for the quoted local-part, group delimiter and
  nested-comment recipient-parser corrections: [GHSA-85x2-q946-cp5h](https://github.com/advisories/GHSA-85x2-q946-cp5h),
  [GHSA-m943-m63m-w62w](https://github.com/advisories/GHSA-m943-m63m-w62w), and
  [GHSA-8c8m-p3m8-cjg8](https://github.com/advisories/GHSA-8c8m-p3m8-cjg8).
- `zod` 3.25.76 to 4.6.7 for
  [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
  No patched 3.x release exists in the registry. `drizzle-zod` moves to 0.8.3 and
  `zod-validation-error` to 4.0.2 for supported Zod 4 integration.

The major validation update includes required source compatibility changes rather
than using the legacy `zod/v3` entrypoint: string-key records are explicit, enum-key
counts remain sparse via `partialRecord`, parser output types and issue paths
remain safe, and existing UUID-shaped nickname IDs remain accepted with `guid`.
Runtime environment diagnostics and accepted timestamp formats are preserved.
Regression cases cover these behaviors, generated Drizzle inserts, bounded
collections, recipient parsing and compressed JSON handling. Shared contract tests
are included in the existing `test:contracts` command used by CI.

No audit threshold, exception, retry, override or lifecycle-script allowlist is
relaxed. Registry metadata provides exact tarball integrity; only the eight
reviewed lock entries change. The owner approved downloading official packages for
sandbox-only verification. All patched tarballs matched their registry SHA-512
integrity; no dependency lifecycle scripts or production operations ran.

Local verification on 2026-10-24:

- A fresh npm bulk-advisory query for the final lock graph returned no findings.
  Actual `npm audit` and the unchanged project gate then passed inside the sandbox
  against a loopback replay of that captured response. The target process had no
  external network access; this was not a deployed-server probe.
- `npm ci --dry-run --ignore-scripts --no-audit` passed manifest/lock resolution
  using only reviewed registry metadata served on isolated loopback. This verifies
  resolution consistency, not a fresh complete install.
- Dependency/security regressions: 175 passed; API/shared/Drizzle contracts: 140
  passed; final auth/runtime validation and Viewer handoff: 113 passed; existing
  auth/AI/Viewer service regressions: 114 passed; actual disposable PostgreSQL
  regressions: 42 passed. Every listed run had zero failed or skipped tests.
- TypeScript passed for backend/shared and frontend/shared as separate scopes with
  the project compiler options. The external frontend config explicitly included
  the installed Node types so its relocated config retained test type discovery.
- Backend/shared and frontend lint passed; these scoped results do not establish
  a full CI pass.
- Full combined TypeScript exceeded its bounded resource profile. Additional
  production build and bundle verification could not start because the host disk
  filled during disposable build-snapshot preparation. Temporary agent-created
  source copies were removed; no application data or user files were cleaned.
  Full build, browser smoke, bundle budgets and the complete CI remain unverified.

Zod 4 optional properties differ from union schemas containing `undefined`.
Explicit outer optional/default handling preserves omitted, undefined and null
normalization, while original union alternatives retain auth error codes/messages.
UTF-16 field and Viewer handoff limits remain unchanged for astral Unicode.

Rollback: revert this dependency update and its Zod compatibility changes together;
do not pair Zod 3 with the Zod 4 schema code. A rollback restores the known advisory
findings, so review remediation before deployment. No database migration is needed.

## 2026-10-23 DOMPurify and IPv6 zone-parser security patches

[CI run 39888068031](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/39888068031)
on `dcdaed52` stopped at Audit dependencies, reporting `dompurify` (critical)
and `ip-address` (moderate). The same two findings reproduced locally. This is
an advisory failure, not another registry timeout or a Viewer/Saved UI failure.

Only two resolved packages change:

- `dompurify`: exact direct pin `3.4.16` to `3.4.17`, deduplicated for `jspdf` too.
  This closes the shadow-root/template bypass
  [GHSA-cg2g-xh64-v4q7](https://github.com/advisories/GHSA-cg2g-xh64-v4q7),
  detached-subtree handling
  [GHSA-mrv2-3pqr-j5jr](https://github.com/advisories/GHSA-mrv2-3pqr-j5jr),
  and the XHTML SMIL guard issue
  [GHSA-c6gr-qvv4-5v3f](https://github.com/advisories/GHSA-c6gr-qvv4-5v3f).
  See the [3.4.17 release notes](https://github.com/cure53/DOMPurify/releases/tag/3.4.17).
- `ip-address`: existing override floor `^10.7.2` to `^10.7.4`, locked to `10.7.4`.
  This closes the quadratic IPv6 zone-identifier parsing issue
  [GHSA-rxp7-6hxx-x8q5](https://github.com/advisories/GHSA-rxp7-6hxx-x8q5).
  Existing IPv4/IPv6 subnet keys and shared-office NAT policies remain unchanged.

`npm update dompurify ip-address --ignore-scripts --no-audit --no-fund` updates
the manifest/lock/install without executing dependency lifecycle scripts. No
audit severity, retries, exceptions, package-source policy, runtime sanitizer
allowlist, CSP or install-script permissions are relaxed. No force-wide upgrade.

Verification on 2026-10-23:

- Live `npm run audit:dependencies`: PASS, no moderate-or-higher findings.
- `npm ls dompurify ip-address --all`: one patched DOMPurify shared with jsPDF,
  and patched `ip-address` under `express-rate-limit`.
- `npm ci --ignore-scripts --dry-run --no-audit --no-fund`: PASS manifest/lock
  consistency; this is not a claim of a fresh CI installation.
- Dependency audit/retry/IP/glob tests: 143 PASS. The added zone regression uses
  only 64 percent characters plus each line terminator, not a denial-of-service
  payload or a flaky timing threshold; valid scoped IPv6 remains supported.
- Sanitizer/Trusted Types/monthly-report unit contracts: 22 PASS. Actual local
  Chromium confirms supported DOMPurify, unsafe markup removal, plain AI text,
  and preserved report title/style/table/SVG/Print content, not just Node fallbacks.
- Targeted rate-limit/runtime/API-protection tests: 62 PASS in a clean child
  environment with dotenv disabled, including shared-NAT and strict brute-force
  isolation checks. No production endpoint, account, database or email was used.
- Production build and zero-sourcemap gate, full typecheck and client lint pass.

Browser QA boundary: an additional strict Trusted Types probe found the existing
custom bridge returns empty trusted HTML with `require-trusted-types-for 'script'`.
A four-case A/B test using unchanged application sources against both old
`3.4.16` and patched `3.4.17` reproduced identical empty strict-mode results;
ordinary HTML, AI and report outputs remain identical. This is a preexisting
bridge limitation, not a regression introduced by this dependency patch, and is
recorded separately from the dependency upgrade. The user subsequently approved
fixing it: `trusted-types.ts` now shares DOMPurify's native module policy with
the AI and report sanitizers instead of using the string-only bridge and a
private instance. Existing sanitizer allowlists and CSP remain unchanged.
The permanent `npm run test:trusted-types:browser` regression verifies the fix
with real native Trusted Types; see the sanitizer ownership section in
`docs/CONTENT_SECURITY_POLICY.md`. The original A/B evidence records the
pre-fix baseline and should not be mistaken for current post-fix results.
Evidence is in ignored `artifacts/dependency-dompurify-ab-20261023/` and
`artifacts/dependency-audit-20261023-*` logs; current browser regression results
are in `artifacts/trusted-types-browser/`. Rebuild from the final committed
lockfile and run the normal GitHub gates before deployment; local results do not
claim a green remote rerun, production exposure, or production deployment.

## 2026-10-22 bounded audit transport recovery

[CI run 39711452342](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/39711452342)
failed because the audit child exceeded its 120-second process limit, not because
it returned an advisory. The same timeout reproduced locally. No dependency
version, lockfile, severity threshold or exception changes are needed for this
transport failure.

The audit child now receives `--fetch-timeout=30000 --fetch-retries=0`, keeping
HTTP waits below the existing 120-second process cap rather than npm's longer
[default network budget](https://docs.npmjs.com/cli/v11/using-npm/config/#fetch-timeout).
The wrapper permits at most two attempts, separated by 1.5 seconds, only for a
process timeout or an explicit transient network/HTTP 429/500/502/503/504 error.
These flags apply only to the audit child; user/global npm configuration is not
changed. A timed-out child is killed rather than left running.

A complete report, including any finding, is never retried away. Invalid or
truncated reports without a process timeout, auth/config errors, buffer overflow
and non-timeout signals still fail immediately. Exhausted transport retries also
fail closed; success still requires the existing complete-report validation and
all package metadata checks. Retry messages never print raw npm diagnostics,
registry URLs, response bodies or credentials. Offline runner and CLI-stub tests
cover timeout recovery, exhaustion, findings after retry and error sanitization.

Local verification: the complete script suite passed 821 checks with one existing
optional baseline diagnostic skipped. It ran with dotenv disabled and synthetic
test settings; local `.env` files were not changed. Syntax, repository hygiene,
diff whitespace and changed-file secret guards passed. The live npm endpoint
continued to time out, including a separate one-package advisory probe while its
GET ping returned HTTP 200. The hardened gate recognized the real npm timeout
wrapper, exhausted its two attempts and correctly failed closed. This is not a
clean advisory result: obtain a fresh complete audit after endpoint recovery
before claiming CI/release readiness. Application code and package manifests
remain unchanged.

## 2026-10-21 Vite editor security patches

The dependency gate reproduced a high-severity finding in locked `vite@8.0.16`.
The advisory feed identifies three issues in its bundled development-server
editor launcher:

- [GHSA-698v-4r3x-3vcv](https://github.com/vitejs/launch-editor/security/advisories/GHSA-698v-4r3x-3vcv):
  Windows command argument percent escaping.
- [GHSA-r825-w8mm-5pxw](https://github.com/vitejs/launch-editor/security/advisories/GHSA-r825-w8mm-5pxw):
  editor CLI argument interpretation.
- [GHSA-587h-7wmj-h5pm](https://github.com/vitejs/launch-editor/security/advisories/GHSA-587h-7wmj-h5pm):
  Windows executable existence-check bypass (high severity).

Pin Vite to `8.1.6`, the first patched release for the affected `8.0.0`–`8.1.5`
line. This is a same-major build-tool update; the lockfile also updates its
Rolldown/native-binding dependency family. The version supports the project's
Node 24 runtime and remains shared with `@vitejs/plugin-react@6.0.2`.
No audit threshold, override or lifecycle permission changes are needed.
Installation uses `npm install --ignore-scripts --no-audit --no-fund` after the
manifest update. A clean-install check, the audit gate, Vite/config/CSS and audit
regressions, production build, bundle budgets and built browser checks verify
compatibility before publishing.

Full and production dependency audits both report zero findings after the
update. Rolling back the manifest/lockfile restores the affected Vite version;
it is a compatibility recovery option, not a security fix.

Local verification on 2026-10-21: `npm ci --ignore-scripts --no-audit --no-fund`,
the full audit gate, production audit, typecheck, production build, sourcemap
and bundle-budget gates, secret scan and repository hygiene passed. Script
suites passed 771 tests (one existing optional Viewer baseline diagnostic
skipped). All 25 selected built-app Chromium cases passed, covering login/Home,
Collection exit, account nickname assignment and Account Management across
desktop/mobile and light/dark themes. Only dev dependency entries changed;
runtime package metadata is unchanged. These are local results; the GitHub
workflow needs the updated manifest and lockfile published before rerunning.

## 2026-10-07 security patches and fail-closed audit

The production post-deployment audit for `7e99b17a` identified 11 runtime
package findings. A fresh full local audit also identified three build-time
findings (14 total). These findings are not evidence of exploitation. Updates:

- `compression`: exact `1.8.2`, addressing premature-response-close zlib cleanup
  ([GHSA-vc2v-76pw-4v95](https://github.com/advisories/GHSA-vc2v-76pw-4v95)).
- `proxy-addr`: lockfile-only `2.0.8` within Express's existing `^2.0.7` range,
  addressing mapped-IPv6 trust-range matching
  ([GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h)).
  No application proxy trust or rate-limit settings change.
- OpenTelemetry auto-instrumentations: exact `0.79.0`, the first release with
  all eight patched database instrumentations; SDK and HTTP trace exporter
  align to exact `0.221.0`. This removes unconditional `db.user` attributes
  ([GHSA-qqmp-wf37-98f9](https://github.com/advisories/GHSA-qqmp-wf37-98f9)).
  The app's telemetry enablement and destination remain unchanged. External
  collector dashboards using legacy HTTP/network/database semantic attribute
  names may need adjustment; none were found in repository consumers.
- `source-map-js`: lockfile-only `1.2.2`, within existing PostCSS ranges,
  addressing invalid indexed-map offsets
  ([GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)).
- Remove the unused `@tailwindcss/typography` dev dependency. No Tailwind plugin
  registration or `prose` class consumers exist in the app; removing it also
  removes its vulnerable `postcss-selector-parser` chain
  ([GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf)).
  No CSS source, theme, selector override or visual design change is needed.

Targeted npm updates use `--ignore-scripts --no-audit --no-fund`. OpenTelemetry's
transitive packages move within the upgraded package's supported ranges; no new
dependency override or vulnerability exception is introduced. The resolved
`protobufjs@7.6.6` postinstall was reviewed: it only reads package metadata and
prints a version-scheme warning, with no network access or writes. Its existing
exact-version lifecycle permission moves from `7.6.5` to `7.6.6` only.

The audit gate now requires a complete npm audit v2 report and consistent
severity counts. Empty/truncated output, npm error reports, unsupported shapes,
timeouts, signals and abnormal exit statuses must fail closed with sanitized
diagnostics. Valid findings remain subject to the same moderate+ threshold;
no allowlist or retry-to-ignore behavior is added. Historical green CI is not
proof that the latest registry advisory feed is clean, nor is the reason for
the earlier CI/production difference assumed.

Before release, run the focused dependency regressions, script suite, HTTP/auth
and telemetry checks, typecheck/lint, production build, bundle budgets and built
browser checks. Use the committed lockfile and normal approved release process.
Do not patch the immutable production directory or use `npm audit fix --force`.
Rolling back to the previous lockfile reintroduces affected packages; it is a
compatibility recovery option, not a security remediation.

Local verification on 2026-10-07: full and production npm audits reported zero
findings; the hardened audit gate, typecheck, lint, build, bundle budgets and
secret scan passed. Tests passed: 1,811 client, 704 selected backend, 708 scripts
(one existing optional baseline check skipped), 29 built layout checks and 38
built auth checks. All 30 emitted CSS content hashes were unchanged. These are
local checks, not a GitHub CI or production deployment result; live PostgreSQL
and Redis integration gates were not run for this dependency patch.

## CI Automation

Dependency audit automation is active in GitHub Actions:

- `.github/workflows/ci.yml` runs `npm run audit:dependencies` in the main build-and-test job.
- `.github/workflows/ci.yml` also runs the same gate in the smoke-ui job before build and browser checks.
- `.github/workflows/release-verification.yml` runs `npm run audit:dependencies` before release readiness verification and SBOM generation.

Release policy:

- New moderate, high, or critical advisories block CI.
- New dependency overrides must be documented in this file and mirrored in `scripts/lib/dependency-audit.mjs`.
- New external tarball sources are blocked unless they are vendored and covered by an integrity verification script.
- Major dependency upgrades should be dependency-only pull requests with rollback notes.

## 2026-10-03 Tailwind 4 migration

[CI run 37118294053](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/37118294053)
failed the dependency gate on `braces@3.0.3` and its Tailwind 3 transitive chain.
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) had no
patched braces version at migration time. The user approved the major migration.

- Pin `tailwindcss` and the official `@tailwindcss/postcss` adapter to `4.3.3`;
  pin `tailwind-merge` to the compatible `3.7.0`. Remove unused autoprefixer.
- The lockfile removes braces, micromatch, fast-glob and chokidar. There is no
  vulnerability exception, threshold reduction, vendored fork or forced override.
- Preserve v3 visual values in `tailwind.compat.cjs`, explicit content boundaries,
  one public preflight, original sibling spacing semantics and forced-colors focus
  treatment. See `docs/CSS_ARCHITECTURE.md` for the compatibility bridge.
- Firefox's supported floor is now128 (Tailwind4 requirement); Chrome120 and
  Safari17.4 floors remain unchanged. Production CSS targets the same browser set.
- Build and existing screenshot baselines must pass without updating images merely
  to accept migration differences. Bundle limits remain140KB raw/24KB gzip for
  authenticated CSS; the current result is135.6KB/22.7KB after equivalent HSL
  alpha simplification. Live audit currently has no moderate+ findings.

Rollback must revert the manifest, lockfile, compiler config and CSS/class migration
together; downgrading only Tailwind is not compatible and reintroduces the advisory.
No backend, database, deployment, or permission changes are required.
Final verification evidence is recorded in
`CODEX_CONTINUATION_HANDOFF_TAILWIND_V4_AUDIT_FIX.md`.

## 2026-10-01 CI Security Patch

[CI run 36787892874](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/36787892874)
on `af4f7dc4` failed `build-and-test` at **Audit dependencies** on
`@grpc/grpc-js` (high). Coverage and smoke UI were skipped; this run did not
reach the Lighthouse gate. The same audit failure reproduced locally.

Only two resolved packages change, without a new override:

- `@grpc/grpc-js`: lockfile-only `1.14.4` to `1.14.5`, within OpenTelemetry's
  existing `^1.14.3` dependency range. The upstream patch fixes handling of
  unauthorized TLS peer certificates in certain server configurations
  ([GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j)) and
  disclosure of handler exception details
  ([1.14.5 release notes](https://github.com/grpc/grpc-node/releases/tag/%40grpc%2Fgrpc-js%401.14.5)).
  This transitive package arrives through the OpenTelemetry SDK's gRPC exporters;
  SQR's configured trace exporter remains HTTP. No app authentication or TLS
  configuration is changed, and the audit finding alone does not establish that
  SQR's production configuration was exploitable.
- `dompurify`: exact runtime pin `3.4.13` to `3.4.16`, also reused by `jspdf`.
  This removes the additional low-severity hook/`IN_PLACE` finding reported by
  npm audit ([3.4.16 release notes](https://github.com/cure53/DOMPurify/releases/tag/3.4.16)).
  The application's sanitizer policies and allowlists remain unchanged.

The targeted command was `npm update @grpc/grpc-js dompurify --ignore-scripts
--no-audit --no-fund`, after updating the exact DOMPurify manifest pin. No
package lifecycle scripts ran, other resolved packages changed, or audit
thresholds/exceptions/install-script permissions were relaxed.

`scripts/tests/dependency-grpc-regressions.test.mjs`, included in `test:scripts`,
checks ordinary unary request compatibility, sanitized handler errors and the
unauthorized-certificate boundary. It uses an ephemeral loopback listener and
an unconnected TLS socket, not production telemetry, credentials or a database.
An additional local Chromium probe exercised the actual application DOMPurify
paths for trusted HTML, AI display and Monthly Collection report HTML, checking
that safe formatting survives and unsafe elements/attributes are removed.

Local verification:

- `npm run audit:dependencies`: PASS; raw `npm audit --json` reports zero
  vulnerabilities at every severity, including low.
- `npm ci --ignore-scripts --dry-run --no-audit --no-fund`: PASS manifest/lock
  consistency (a dry run, not a fresh installation claim).
- Production build, sourcemap guard, TypeScript, bundle budgets and secret scan:
  PASS.
- Client tests: 614 PASS. Script suites: 572 PASS, one existing skip, using a
  clean test environment without local dotenv configuration.
- Built auth browser suite: 38 PASS, including login/MFA, password recovery,
  strict CSP and Trusted Types. The isolated real-DOM sanitizer probe also passed.
- Login Lighthouse with real security headers: performance 90, accessibility
  100, best practices 100, LCP 3.3 s; all existing login gates pass. The first
  attempt produced `NO_NAVSTART` rather than a usable score; one repeat passed
  without code or threshold changes. Both reports remain in the ignored
  `artifacts/login-lcp-fix/perf-dependency-patch-login-ci-headers*.json` files.

Verification logs are retained under ignored `artifacts/dependency-20261001-*`
and `artifacts/dependency-dompurify-probe.mjs`. Production was not modified.

## 2026-09-30 CI Security Patch

[CI run 36714876215](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/36714876215) on `b171cfd0` failed the dependency audit on `brace-expansion` (high), `ip-address` (moderate), and `nodemailer` (high). The same gate reproduced all three locally. These dependencies were unchanged by the V17 authentication UI commit; the current registry advisories now reject the previous locked versions.

Only these three resolved packages are updated:

- `nodemailer`: exact runtime pin `9.1.1` → `10.0.13`. The audited 9.x line has no offered fix; the new version addresses the DNS/TLS-servername and address-parser advisories, including [GHSA-g57g-f23g-4646](https://github.com/advisories/GHSA-g57g-f23g-4646). [Nodemailer 10](https://github.com/nodemailer/nodemailer/releases/tag/v10.0.0) requires Node 20+, which fits SQR's existing Node 24 requirement. Its bundled ESM/CJS declarations require importing `Transporter` explicitly in `server/mail/mailer.ts`; no transport settings, credentials, message content or delivery policy change. Version [10.0.13](https://github.com/nodemailer/nodemailer/releases/tag/v10.0.13) also includes the subsequent parser/SASL fixes.
- `ip-address`: existing override floor `^10.4.0` → `^10.7.2`, locked to `10.7.2`. This addresses cross-family subnet comparisons and bounded IPv6 parsing, including [GHSA-j6r3-76f7-8jcv](https://github.com/advisories/GHSA-j6r3-76f7-8jcv). Existing rate-limit policies and IPv4/IPv6 key behavior are not changed.
- `brace-expansion`: lockfile-only `5.0.9` → `5.0.12`, within the existing `minimatch` dependency range. This addresses nesting/rewrite resource limits, including [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr). No new override is needed.

Audit severity thresholds, workflow gates, install-script allowlist and all other resolved packages are unchanged. `npm update nodemailer ip-address brace-expansion --ignore-scripts --no-audit --no-fund` performed the targeted lock/install update without executing package lifecycle scripts.

Regression coverage (automatically included by `test:scripts`):

- Existing dependency tests retain mail serialization and file/URL access restrictions.
- `scripts/tests/nodemailer-upgrade.test.mjs` uses a synthetic loopback SMTP receiver to verify text/HTML delivery, safe quoted-recipient envelopes, rejection handling and fail-closed `requireTLS`; it never sends real email.
- `scripts/tests/dependency-ip-glob-regressions.test.mjs` verifies address-family boundaries, link-local/mapped/NAT64 classification, input bounds, rate-limit keys and small bounded glob expansions. No resource-exhaustion workload or remote network request is used.

Local verification on 2026-09-30:

- `npm run audit:dependencies`: PASS, no moderate-or-higher advisory remains.
- `npm ci --ignore-scripts --dry-run --no-audit --no-fund`: PASS manifest/lock consistency; this is a dry run, not a claim of a fresh CI installation.
- `npm run typecheck`, `npm run lint`, `npm run build`: PASS, including zero production source maps.
- `npm run test:scripts`: 565 PASS, one existing optional base-HEAD Viewer probe skipped. Includes all new dependency regressions.
- Targeted mail, mail-template, dev-outbox, client-IP and rate-limit suites: 56 PASS, zero skips.
- `npm run test:auth`: final isolated repeat 144 PASS, zero skips. The first run had one failure in the unchanged five-microsecond CSRF timing assertion; the same full command passed when repeated alone without weakening or changing that test. Logs for both attempts are retained locally.
- Repository hygiene, secret scan and `git diff --check`: PASS.

Evidence logs are in ignored `artifacts/dependency-fix-*.log`; no real SMTP credentials or production data were used. The failed remote run above is confirmed, but no remote rerun or deployment is claimed by these local results.

Release/rollback boundary: this is a dependency-focused fix, not a production deployment. If compatibility problems appear after release, stop the rollout and use the normal approved-release rollback procedure; the previous dependency graph remains vulnerable and must not be described as a security fix. Do not suppress the audit to restore green CI. Rebuild release artifacts from the final committed lockfile and rerun the existing CI gates before deploying.

## 2026-09-09 CI Security Patch

[CI run 34291870873](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/34291870873) stopped at the dependency audit before application tests ran. The fix updates only two resolved packages:

- `nodemailer`: exact runtime pin `9.0.1` to `9.1.1`, retaining the compatible 9.x line. This includes the address-parser fixes in 9.1.0 and the legacy content-resolution access-control fix in [9.1.1](https://github.com/nodemailer/nodemailer/releases/tag/v9.1.1).
- `js-yaml`: existing override floor `^4.3.1` to `^4.3.2`, locked to `4.3.2`. This closes the empty-merge-source work-limit bypass described in [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh), without moving ESLint's parser to a new major version.

The audit threshold, exact-pin policy, and lifecycle-script allowlist are unchanged. `scripts/tests/dependency-security-regressions.test.mjs` checks offline mail serialization, transporter file/URL restrictions in the legacy message API, and bounded YAML merge-work accounting. It runs with `npm run test:scripts`; `npm run audit:dependencies` checks the installed dependency graph against current advisories.

## compression@1.8.2

`compression@1.8.2` fixes the premature-response-close memory leak identified in the advisory above while preserving the Express middleware API. The existing application controls below still bound broad compression behavior; they are not substitutes for the upstream security patch and do not concern request decompression.

Verified mitigation:

- API response compression is registered in `server/internal/local-http-compression.ts`.
- API compression is scoped to `/api` responses only.
- WebSocket upgrade requests are excluded from compression.
- Compression threshold is `1024` bytes, so tiny responses are not compressed.
- Gzip level is explicitly set to `6`, balancing CPU cost and response size.
- Binary API responses are left uncompressed by the standard `compression.filter(...)` content-type check.
- Inbound JSON body limits are enforced before route handlers in `server/internal/local-http-body-parsers.ts`.
- Nginx import and telemetry body limits are contract-tested against Express limits.

Verification commands:

```bash
npm run test:http
npm run test:scripts
npm run audit:dependencies
```

Operational notes:

- Monitor repeated large API responses and high CPU during traffic spikes before raising compression level.
- Prefer keeping Node compression scoped to API responses; static assets can also be compressed by Nginx when the deployment terminates TLS at the edge.
- Revisit this package during the monthly dependency review, especially if Express publishes a different recommended compression strategy.

## Package Override Notes

`package.json` does not support comments. Each override below is therefore documented here and mirrored in `scripts/lib/dependency-audit.mjs`; the audit gate fails when a new override lacks a documented reason.

| Package | Override reason | CVE/Issue context | Safe to remove when |
| --- | --- | --- | --- |
| `@babel/core` | Pins the patched Babel 7 line for ESLint tooling until `eslint-plugin-react-hooks` resolves the fixed release transitively. | Local arbitrary-file-read advisory in vulnerable Babel source-map processing. | The lint toolchain resolves Babel 7.29.7 or newer without override support. |
| `gaxios` | Pins the compatible patch that removes deprecated runtime cleanup dependencies from GCP metadata detection. | Removes the unsupported `rimraf@5` to `glob@10` chain while retaining the Gaxios 7 API used by OpenTelemetry. | `gcp-metadata` depends on `gaxios` 7.1.5 or newer directly. |
| `qs` | Pins patched query-string parsing behavior for transitive Express middleware until all upstream packages converge. | Query parser hardening and historical prototype-pollution class risk. | Direct and transitive Express middleware no longer resolve a vulnerable `qs` version and `npm run audit:dependencies` stays clean without the override. |
| `lodash` | Pins patched lodash template handling for transitive consumers and keeps npm audit clean across nested packages. | Template injection and prototype-pollution advisory class across older lodash releases. | `npm ls lodash` shows only patched versions without override support. |
| `rollup` | Pins Rollup to a patched release used by the Vite toolchain and prevents vulnerable nested Rollup versions. | Build-tool supply-chain hardening for Rollup advisories. | Vite and related build packages resolve the patched Rollup release by default. |
| `esbuild` | Pins patched esbuild for dev/build tooling, including older `drizzle-kit` transitive `@esbuild-kit` packages. | Dev-server exposure and vulnerable nested esbuild advisory class. | `drizzle-kit` and Vite dependencies no longer pull an affected esbuild range. |
| `ip-address` | Pins patched IP address parsing helpers for `express-rate-limit` until the upstream dependency advances. | Rate-limit client identity parsing hardening. | `express-rate-limit` resolves a patched `ip-address` transitively without an override. |
| `js-yaml` | Pins patched YAML parsing for ESLint transitive config loading until `@eslint/eslintrc` resolves the patched range by default. | Quadratic-complexity YAML merge-key DoS advisory class in older transitive parser versions. | ESLint resolves patched `js-yaml` transitively and `npm run audit:dependencies` stays clean without the override. |
| `minimatch` | Pins patched minimatch 10 while legacy React ESLint plugins still request minimatch 3; `scripts/lib/eslint-plugin-minimatch-compat.mjs` preserves their callable API. | Brace-expansion memory-exhaustion DoS through vulnerable glob expansion. | Both React ESLint plugins support the minimatch 10 object API or remove their minimatch dependency. |

Quarterly review checklist:

```bash
npm run audit:dependencies
npm outdated
npm ls @babel/core gaxios qs lodash rollup esbuild ip-address minimatch
```

## Install Script Allowlist

`allowScripts` in `package.json` pins the exact reviewed versions that may run lifecycle scripts during `npm ci`. Native binary setup is allowed for `bcrypt`, `esbuild`, and the optional `msgpackr-extract` accelerator. The pinned `core-js` and `protobufjs` postinstall scripts are also explicitly reviewed. A version change intentionally returns the npm warning until that new script is reviewed and approved.

When removing an override, update `package.json`, `package-lock.json`, this table, and `scripts/lib/dependency-audit.mjs` in the same dependency-only change.
