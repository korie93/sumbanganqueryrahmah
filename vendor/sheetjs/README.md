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

Keep `package.json` and `package-lock.json` pointed at:

```text
file:vendor/sheetjs/xlsx-0.20.2.tgz
```
