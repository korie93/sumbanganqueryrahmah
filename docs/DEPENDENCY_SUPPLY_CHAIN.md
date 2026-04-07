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

`xlsx@0.20.2` is currently resolved from the SheetJS CDN:

```text
https://cdn.sheetjs.com/xlsx-0.20.2/xlsx-0.20.2.tgz
```

This is allowlisted because SheetJS distributes the current community tarball
outside the npm registry. The risk is install-time dependency on an external
vendor CDN. Before production promotion, choose one controlled source:

1. Mirror the tarball in the organization's internal artifact registry.
2. Vendor the tarball through an approved release-artifact process.
3. Replace the spreadsheet stack with a registry-hosted alternative after an
   import/export compatibility test pass.

Do not add additional external tarball dependencies without updating the audit
gate and documenting the release rationale here.
