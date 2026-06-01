# Dependency Supply Chain Notes

This project treats package provenance as part of release hardening. The normal
dependency audit gate is:

```bash
npm run audit:dependencies
```

The gate intentionally fails on new moderate-or-higher advisories and on new
external tarball sources. Any allowlist entry must include a reason in
`scripts/lib/dependency-audit.mjs`.

Final-polish dependency decisions, including the `compression@1.8.1` DoS
mitigation verification and package override removal criteria, are documented in
`docs/DEPENDENCY-NOTES.md`.

## Review Cadence

Run the dependency audit gate on every CI build and perform a scheduled
dependency review at least monthly. Review high-impact runtime packages
(`express`, `helmet`, `jsonwebtoken`, `pg`, `redis`) and heavy browser packages
(`recharts`, `framer-motion`, `jspdf`, `html2canvas`, `xlsx`) separately so
security updates and bundle-size changes are both visible.

Upgrade dependency majors through dependency-only PRs. Each major upgrade should
include the relevant targeted tests, `npm run audit:dependencies`,
`npm run verify:bundle-budgets`, and a rollback note.

## Security-Critical Runtime Pins

Direct dependencies that sit on the request/auth/database/upload/sanitization
trust boundary are pinned to exact versions in `package.json`. The dependency
audit gate fails if any of these packages are moved back to caret/range
specifiers: `bcrypt`, `busboy`, `compression`, `dompurify`, `dotenv`,
`drizzle-orm`, `drizzle-zod`, `express`, `express-rate-limit`, `helmet`,
`jsonwebtoken`, `nodemailer`, `pg`, `pino`, `redis`, `ws`, `zod`, and
`zod-validation-error`.

Security updates for these packages should be dependency-only PRs that update
both `package.json` and `package-lock.json`, run `npm run audit:dependencies`,
and include the focused auth/HTTP/database tests for the touched package family.

## Runtime Import Cycle Guard

The production TypeScript source graph must remain acyclic across `server/`,
`client/src/`, and `shared/`. Runtime cycles make startup order, singleton
initialization, and cleanup ownership harder to reason about, especially in the
auth, WebSocket, rate-limit, and database paths.

Run this guard before merging architecture or module-boundary refactors:

```bash
node --test scripts/tests/import-cycle-contract.test.mjs
```

The guard uses the local TypeScript compiler API and adds no package dependency.
It resolves relative imports plus the configured `@/` and `@shared/` aliases,
ignores type-only imports, excludes test fixtures, and fails on runtime
`import`/`export from` cycles. If a future refactor needs shared types across
two modules, move those types to a lower-level shared contract instead of adding
a reverse runtime import.

## Express 5 Runtime

The backend now runs on Express 5. Keep explicit async wrappers in place until a
separate route-by-route cleanup proves that native async rejection handling gives
the same sanitized error responses and request logging.

Express 5 route parameters can be typed as repeated values for wildcard-style
matches. Production routes that consume identifiers should normalize path
segments with `readRouteParam(...)` so repeated or missing route parameters are
rejected before they reach controllers or repositories.

For future Express upgrades, run the dependency audit gate, HTTP and route
integration tests, bundle checks, and the local smoke/a11y flow before promotion.

## Capture/PDF Libraries

`html2canvas` and `jspdf` remain isolated behind lazy import paths and bundle
budget checks. Do not import either package from the main application entry or
shared UI shells. If replacing `html2canvas`, validate the candidate against
receipt/report capture, CSP/Trusted Types behavior, mobile viewport rendering,
and the existing PDF export tests before removing the current adapter.

## SheetJS `xlsx`

`xlsx@0.20.2` is vendored locally at:

```text
vendor/sheetjs/xlsx-0.20.2.tgz
```

The tarball was originally sourced from:

```text
https://cdn.sheetjs.com/xlsx-0.20.2/xlsx-0.20.2.tgz
```

The vendored artifact must keep this integrity value:

```text
sha512-+nKZ39+nvK7Qq6i0PvWWRA4j/EkfWOtkP/YhMtupm+lJIiHxUrgTr1CcKv1nBk1rHtkRRQ3O2+Ih/q/sA+FXZA==
```

This removes install-time dependency on the external vendor CDN while
preserving the same SheetJS build used by the application import/export flows.
The tarball metadata has been checked locally: `package/package.json` declares
`Apache-2.0`, and the archive includes `package/LICENSE` with the Apache
License 2.0 text.
Server-side import parsing now goes through
`server/services/import-upload-xlsx-runtime.ts`, and browser import/export
flows go through `client/src/lib/spreadsheet/xlsx-runtime.ts`. Keep new
spreadsheet reads and writes behind those adapters so a future ExcelJS fallback
can be introduced without touching every import/export caller.
If the team later introduces an internal artifact registry, move the same
tarball there and update `package.json` and `package-lock.json` in one PR.

Do not add additional external tarball dependencies without updating the audit
gate and documenting the release rationale here.

## Package Overrides

`package.json` cannot contain comments, so every dependency override must be
documented here and mirrored in `scripts/lib/dependency-audit.mjs`. The audit
gate fails if a new override is added without a documented reason.

Current overrides:

| Package | Reason |
| --- | --- |
| `qs` | Pins patched query-string parsing behavior for transitive Express middleware until all upstream packages converge. |
| `lodash` | Pins patched lodash template handling for transitive consumers and keeps npm audit clean across nested packages. |
| `rollup` | Pins Rollup to a patched release used by the Vite toolchain and prevents vulnerable nested Rollup versions. |
| `esbuild` | Pins patched esbuild for dev/build tooling, including older `drizzle-kit` transitive `@esbuild-kit` packages. |
| `ip-address` | Pins patched IP address parsing helpers for `express-rate-limit` until the upstream dependency advances. |

When removing an override, remove its entry from this table and from the audit
helper in the same dependency-only PR.
