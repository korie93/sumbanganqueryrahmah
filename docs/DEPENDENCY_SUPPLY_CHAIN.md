# Dependency Supply Chain Notes

This project treats package provenance as part of release hardening. The normal
dependency audit gate is:

```bash
npm run audit:dependencies
```

The checksum-only supply-chain gate is:

```bash
npm run verify:dependency-supply-chain
```

The gate intentionally fails on new moderate-or-higher advisories and on new
external tarball sources. It also verifies that the vendored `xlsx` tarball
still matches the pinned SHA-512 checksum in `package-lock.json` and the audit
metadata in `scripts/lib/dependency-audit.mjs`. Any allowlist entry must
include a reason, advisory references, and quarterly review metadata in
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
The vendored tarball checksum is verified in CI and release verification before
the repository proceeds to the full audit/build stages.
If the team later introduces an internal artifact registry, move the same
tarball there and update `package.json` and `package-lock.json` in one PR.

Maintenance expectations for the vendored tarball:

- review upstream SheetJS releases and advisories at least quarterly
- keep the vendored checksum, `package-lock.json` integrity, and CI metadata in sync
- update this document in the same PR whenever the vendored artifact changes
- prefer a fresh vendored tarball or internal artifact mirror over ad-hoc local patches

Do not add additional external tarball dependencies without updating the audit
gate and documenting the release rationale here.

## Package Overrides

`package.json` cannot contain comments, so every dependency override must be
documented here and mirrored in `scripts/lib/dependency-audit.mjs`. The audit
gate fails if a new override is added without a documented reason.

Current overrides:

| Package | Advisory / CVE | Reason | Review cadence | Last reviewed |
| --- | --- | --- | --- | --- |
| `qs` | `GHSA-hrpp-h998-j3pp`, `CVE-2022-24999` | Pins patched query-string parsing behavior for transitive Express middleware until all upstream packages converge. | Quarterly | 2026-04-15 |
| `lodash` | `GHSA-35jh-r3h4-6jhm`, `CVE-2021-23337`, `GHSA-p6mc-m468-83gw`, `CVE-2020-8203` | Pins patched lodash template handling for transitive consumers and keeps npm audit clean across nested packages. | Quarterly | 2026-04-15 |
| `rollup` | `GHSA-gcx4-mw62-g8wm`, `CVE-2024-47068` | Pins Rollup to a patched release used by the Vite toolchain and prevents vulnerable nested Rollup versions. | Quarterly | 2026-04-15 |
| `dompurify` | `GHSA-p3vf-v8qc-cwcr`, `CVE-2024-48910`, `GHSA-39q2-94rc-95cp` | Pins patched DOMPurify releases for the Trusted Types runtime and transitive HTML sanitization consumers. | Quarterly | 2026-04-16 |
| `esbuild` | `GHSA-67mh-4wv8-2f99` | Pins patched esbuild for dev/build tooling, including older `drizzle-kit` transitive `@esbuild-kit` packages. | Quarterly | 2026-04-15 |

When removing an override, remove its entry from this table and from the audit
helper in the same dependency-only PR.
