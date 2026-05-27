# Bundle Size Monitoring

SQR enforces client bundle budgets with `npm run verify:bundle-budgets` after `npm run build`.
CI also writes `artifacts/bundle/bundle-budget-report.json` and uploads it as a build artifact.

## Current Baseline

Baseline captured on 2026-05-27 from `dist-local/public/assets`.

| Chunk | Budget Raw | Budget Gzip | Current Raw | Current Gzip |
| --- | ---: | ---: | ---: | ---: |
| main-js | 260 KB | 20 KB | 50.2 KB | 16.3 KB |
| main-css | 140 KB | 14 KB | 64.7 KB | 11.3 KB |
| authenticated-css | 140 KB | 24 KB | 125.1 KB | 19.0 KB |
| app-shell-css | 20 KB | 4 KB | 14.0 KB | 2.8 KB |
| charts | 760 KB | 130 KB | 434.0 KB | 114.5 KB |
| excel | 525 KB | 170 KB | 482.6 KB | 157.1 KB |
| pdf | 420 KB | 140 KB | 381.4 KB | 125.4 KB |
| capture | 225 KB | 55 KB | 197.6 KB | 46.7 KB |
| settings | 180 KB | 20 KB | 46.7 KB | 14.5 KB |
| collection-records | 100 KB | 18 KB | 48.3 KB | 14.0 KB |

## Review Rules

- Keep `html2canvas`, `jspdf`, `xlsx`, charts, and other heavy tools in lazy chunks.
- Tighten budgets only after a clean production build establishes a stable lower baseline.
- Raise a budget only with a clear product reason and an updated table in this document.
- Attach or inspect the JSON artifact when a PR changes routing, lazy imports, exports, charts, or vendor code.
