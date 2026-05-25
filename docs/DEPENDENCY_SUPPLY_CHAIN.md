# Dependency Supply Chain Notes

This project treats package provenance as part of release hardening. The normal
dependency audit gate is:

```bash
npm run audit:dependencies
```

The gate intentionally fails on new moderate-or-higher advisories and on new
external tarball sources. Any allowlist entry must include a reason in
`scripts/lib/dependency-audit.mjs`.

## Review Cadence

Run the dependency audit gate on every CI build and perform a scheduled
dependency review at least monthly. Review high-impact runtime packages
(`express`, `helmet`, `jsonwebtoken`, `pg`, `redis`) and heavy browser packages
(`recharts`, `framer-motion`, `jspdf`, `html2canvas`, `xlsx`) separately so
security updates and bundle-size changes are both visible.

Upgrade dependency majors through dependency-only PRs. Each major upgrade should
include the relevant targeted tests, `npm run audit:dependencies`,
`npm run verify:bundle-budgets`, and a rollback note.

## Express 5 Migration Plan

The current Express 4 stack is protected by explicit async wrappers and HTTP
contract tests. Express 5 should be handled as a planned migration, not a drive-by
audit fix:

1. Create a dependency-only branch that updates Express and its middleware
   peers.
2. Run all route integration tests and verify async errors still reach the
   centralized error handler.
3. Re-check body-parser, query parsing, rate-limit, CSRF, and upload middleware
   behavior against the existing HTTP contract tests.
4. Promote only after smoke UI and authenticated accessibility checks pass in
   staging.

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
| `dompurify` | Pins DOMPurify sanitizer fixes for transitive HTML sanitization consumers. |
| `esbuild` | Pins patched esbuild for dev/build tooling, including older `drizzle-kit` transitive `@esbuild-kit` packages. |

When removing an override, remove its entry from this table and from the audit
helper in the same dependency-only PR.
