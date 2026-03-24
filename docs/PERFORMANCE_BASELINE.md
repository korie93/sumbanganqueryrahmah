# Collection Report Performance Baseline

Use this baseline to track query performance for Collection Daily, Collection Summary, and
Nickname Summary data paths after schema/query changes.

## Command

```bash
npm run perf:collection:baseline
```

## Required Environment

Provide either:

- `DATABASE_URL`

or:

- `PG_HOST`
- `PG_PORT`
- `PG_USER`
- `PG_PASSWORD`
- `PG_DATABASE`

## Optional Tuning Inputs

- `PERF_COLLECTION_YEAR` (default: current UTC year)
- `PERF_COLLECTION_MONTH` (default: current UTC month)
- `PERF_COLLECTION_NICKNAME` (default: `SMOKE_TEST_USERNAME` or `Collector Alpha`)
- `PERF_COLLECTION_LIMIT` (default: `200`, max `500`)
- `PERF_COLLECTION_OFFSET` (default: `0`)

## Output

The script writes:

- Markdown summary: `var/perf/collection-baseline-*.md`
- Raw plan JSON: `var/perf/collection-baseline-*.json`

The baseline currently captures:

- Collection Daily paginated record listing
- Collection Daily totals and grouped-by-date queries
- Monthly target lookup
- Collection Summary month aggregation
- Nickname Summary range aggregation

Track these values between commits:

- execution time (`Execution Time`)
- planner choice (`Top Node`)
- block usage (`Shared Hit Blocks`, `Shared Read Blocks`)

If execution time regresses materially, inspect the JSON plan and compare index usage before promoting the change.
