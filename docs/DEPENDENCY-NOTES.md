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
| `qs` | Pins patched query-string parsing behavior for transitive Express middleware until all upstream packages converge. | Query parser hardening and historical prototype-pollution class risk. | Direct and transitive Express middleware no longer resolve a vulnerable `qs` version and `npm run audit:dependencies` stays clean without the override. |
| `lodash` | Pins patched lodash template handling for transitive consumers and keeps npm audit clean across nested packages. | Template injection and prototype-pollution advisory class across older lodash releases. | `npm ls lodash` shows only patched versions without override support. |
| `rollup` | Pins Rollup to a patched release used by the Vite toolchain and prevents vulnerable nested Rollup versions. | Build-tool supply-chain hardening for Rollup advisories. | Vite and related build packages resolve the patched Rollup release by default. |
| `esbuild` | Pins patched esbuild for dev/build tooling, including older `drizzle-kit` transitive `@esbuild-kit` packages. | Dev-server exposure and vulnerable nested esbuild advisory class. | `drizzle-kit` and Vite dependencies no longer pull an affected esbuild range. |
| `ip-address` | Pins patched IP address parsing helpers for `express-rate-limit` until the upstream dependency advances. | Rate-limit client identity parsing hardening. | `express-rate-limit` resolves a patched `ip-address` transitively without an override. |
| `js-yaml` | Pins patched YAML parsing for ESLint transitive config loading until `@eslint/eslintrc` resolves the patched range by default. | Quadratic-complexity YAML merge-key DoS advisory class in older transitive parser versions. | ESLint resolves patched `js-yaml` transitively and `npm run audit:dependencies` stays clean without the override. |

Quarterly review checklist:

```bash
npm run audit:dependencies
npm outdated
npm ls qs lodash rollup esbuild ip-address
```

When removing an override, update `package.json`, `package-lock.json`, this table, and `scripts/lib/dependency-audit.mjs` in the same dependency-only change.
