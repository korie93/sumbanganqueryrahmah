# Vendored SheetJS Tarball

This directory vendors the SheetJS `xlsx@0.20.2` tarball so installs do not
depend on the external SheetJS CDN.

Source:

```text
https://cdn.sheetjs.com/xlsx-0.20.2/xlsx-0.20.2.tgz
```

Expected integrity:

```text
sha512-+nKZ39+nvK7Qq6i0PvWWRA4j/EkfWOtkP/YhMtupm+lJIiHxUrgTr1CcKv1nBk1rHtkRRQ3O2+Ih/q/sA+FXZA==
```

The repo also stores the `sha512sum`-compatible value in
`vendor/sheetjs/CHECKSUMS.sha512`. CI verifies this file with:

```sh
npm run verify:xlsx-vendor-integrity
```

Keep `package.json` and `package-lock.json` pointed at:

```text
file:vendor/sheetjs/xlsx-0.20.2.tgz
```

When intentionally upgrading SheetJS, replace the tarball, regenerate
`CHECKSUMS.sha512`, update `package.json` and `package-lock.json`, then run
`npm run verify:xlsx-vendor-integrity`, `npm run audit:dependencies`, and the
targeted import/export tests.

License verification:

```text
package/package.json license: Apache-2.0
package/LICENSE: Apache License 2.0
```
