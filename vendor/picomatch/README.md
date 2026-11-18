# Picomatch 4.0.7 — SQR source patch 1

This is a local, MIT-licensed source patch, not an official upstream release.
Package name and version remain `picomatch@4.0.7`; the advisory is not hidden by
renaming or inventing a clean upstream version.

Source: the existing installed 4.0.7 package (upstream
https://github.com/micromatch/picomatch/tree/4.0.7). All ten upstream package files
are retained. Only `lib/parse.js` changes. No dependency or lifecycle script is added.
`files.sha256.json` pins all installed bytes; the audit verifier also pins that
manifest and the archive independently. `package/` is the reviewable source;
the tarball is the installable copy. Preserve bytes when checking out on Windows.

## Fix and compatibility boundary

For GHSA-fc5q-39xc-vjpf, the parser records the position of its latest wildcard
star as it emits the token. A repeated extglob
containing such a wildcard is literalized through the existing upstream safety
path. The guard also applies when `maxExtglobRecursion: false`; that option no
longer disables this wildcard guard. Ordinary globstars, brace patterns, negation,
scanner results and literal repeated extglobs keep their existing API/semantics.
Nested extglob operators themselves remain handled by upstream's existing checks.

Patterns such as `+(*a)` intentionally stop acting as patterns and match their
literal spelling instead. This is a narrowly scoped mitigation, not a claim that
all possible regular expressions or glob patterns are immune to ReDoS.

## Audit policy and removal

Raw npm audit can continue to report this version. The SQR gate accepts only this
exact advisory and its exclusively inherited dev-only findings **after** verifying
the tarball, lock resolution, file manifest and every installed file. Any new
advisory, runtime dependency, extra copy, missing/modified file or failed audit
transport still fails. No unpatched risk acceptance or threshold change is used.

Replace this vendor patch with the official release once upstream publishes a
verified fix. Remove its direct dev dependency, override and verifier together;
keep behavior regressions and rerun build/lint/browser checks.
