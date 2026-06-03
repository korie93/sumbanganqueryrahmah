# Web Vitals Telemetry

SQR initializes browser Web Vitals reporting from `client/src/lib/web-vitals.ts`
and posts bounded payloads to `/api/telemetry/web-vitals`.

Security and reliability controls:

- same-origin telemetry validation
- strict payload schema
- payload size limits and drop buckets
- no user PII or auth identifiers in telemetry payloads
- server-side tests for accepted and rejected telemetry payloads

Operational usage:

- track Core Web Vitals by route pathname
- compare deploy cohorts during canary releases
- investigate regressions alongside visual and accessibility contract tests

Do not add high-cardinality user identifiers to this pipeline.
