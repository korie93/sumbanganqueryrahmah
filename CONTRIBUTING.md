# Contributing

## Visual Regression Baselines

Visual snapshots for key UI routes live under `tests/visual/__snapshots__`.
Run the checks against a built local or CI server:

```bash
VISUAL_BASE_URL=http://127.0.0.1:5000 npm run test:visual
```

After an intentional UI change, update baselines deliberately:

```bash
VISUAL_BASE_URL=http://127.0.0.1:5000 npm run test:visual:update
```

Authenticated baselines require `VISUAL_TEST_USERNAME` and
`VISUAL_TEST_PASSWORD`, or the existing smoke-test credential variables.
