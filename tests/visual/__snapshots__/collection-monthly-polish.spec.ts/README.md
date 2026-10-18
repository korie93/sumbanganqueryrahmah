# Monthly Comparison visual baselines

The 1366px baselines remain shared. The 390px full-page baselines are selected
by `process.platform` because the application intentionally uses native
`system-ui` fonts. Windows and Linux wrap several phone labels differently;
normal wrapping must not be treated as a layout regression.

- `*-390-win32.png`: original reviewed Windows captures, renamed without pixel changes.
- `*-390-linux.png`: reviewed actual screenshots from GitHub CI run
  [39121768214](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/39121768214),
  job `117659698176`, commit `fe03abab92ff5f819c307400ba130ab031e36c0b`.
  The original and retry captures agree. The report is May–October 2026 with
  synthetic data, 390 × 1000 CSS viewport, DPR1, full-page height 1551px.

The Windows full-page height is 1491px. Linux wraps the subtitle, the monthly
change heading and range-total label onto additional lines; content remains
visible without clipping or overlap. Both themes were inspected before these
baselines were accepted. Do not crop the page, hide text, or widen screenshot
tolerances to accommodate platform differences.

The reflow test separately uses a strict style CSP, changes root text size via
CSSOM, and requires a computed 32px root size. Production CSP and application
styles are unchanged by this CI repair. Local Windows verification does not
replace a subsequent Linux CI run.
