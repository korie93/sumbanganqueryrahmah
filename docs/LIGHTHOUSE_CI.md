# Lighthouse CI Budget

SQR uses the existing `perf:pagespeed:local:strict` runner as the Lighthouse CI
gate. It invokes a pinned Lighthouse package through `npx --package`, so the
repo does not need to keep `@lhci/cli` in `devDependencies`.

## CI Flow

The `smoke-ui` job in `.github/workflows/ci.yml`:

1. Builds the app.
2. Starts `dist-local/server/cluster-local.js`.
3. Runs visual and accessibility contracts.
4. Runs `npm run perf:pagespeed:local:strict` against the already-running local
   server with `PAGESPEED_REUSE_SERVER=true`.
5. Uploads `artifacts/pagespeed` as a GitHub Actions artifact.

## Score Thresholds

Strict mode enables `PAGESPEED_ENFORCE_THRESHOLDS=true` and fails when a usable
Lighthouse report is below:

| Category | Minimum score |
| --- | ---: |
| Performance | 85 |
| Accessibility | 95 |
| Best Practices | 90 |
| SEO | 80 |

Override only for a deliberate baseline update:

```bash
PAGESPEED_MIN_PERFORMANCE_SCORE=88 \
PAGESPEED_MIN_ACCESSIBILITY_SCORE=96 \
PAGESPEED_MIN_BEST_PRACTICES_SCORE=92 \
PAGESPEED_MIN_SEO_SCORE=82 \
npm run perf:pagespeed:local:strict
```

## Local Usage

Create `.env.smoke.local` or export the same PostgreSQL variables used by smoke
tests, then run:

```bash
npm run perf:pagespeed:local:strict
```

For diagnostics that should write artifacts without enforcing score thresholds:

```bash
npm run perf:pagespeed:local
```

Reports are written to `artifacts/pagespeed` by default:

- `pagespeed-local-summary.json`
- `pagespeed-local-summary.md`
- per-route Lighthouse JSON reports
- server log when the runner starts the app itself

## Baseline Changes

Only change thresholds after reviewing:

1. CI artifact reports for the affected route.
2. Web Vitals telemetry from the same build.
3. Whether the regression is code, data, infrastructure, or a test environment
   limitation.

Document accepted baseline changes in the pull request and avoid lowering the
accessibility threshold unless an accessibility owner approves it.
