# Dependency Supply Chain Notes

This project treats package provenance as part of release hardening. The normal
dependency audit gate is:

```bash
npm run audit:dependencies
```

The gate intentionally fails on new moderate-or-higher advisories and on new
external tarball sources. Any allowlist entry must include a reason in
`scripts/lib/dependency-audit.mjs`.

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
