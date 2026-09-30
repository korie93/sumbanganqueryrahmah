# Dependency Notes

This file records the final-polish dependency decisions that operators need during release reviews. The canonical automated gate remains:

```bash
npm run audit:dependencies
```

That command runs `npm audit --json`, fails on moderate-or-higher advisories, rejects unexpected external tarballs, enforces documented package overrides, and checks exact pins for security-critical runtime packages.

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

## compression@1.8.1

`compression@1.8.1` remains in use because the Express middleware API is stable and current `npm audit` does not report a vulnerability for this package in this project. The risk being controlled here is CPU or memory pressure from broad compression behavior, not request decompression.

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
