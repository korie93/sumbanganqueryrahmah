# Web Vitals Telemetry

SQR initializes browser Web Vitals reporting from `client/src/lib/web-vitals.ts`
and posts bounded payloads to `/api/telemetry/web-vitals`.

Security and reliability controls:

- same-origin telemetry validation
- strict payload schema
- payload size limits and drop buckets
- no user PII or auth identifiers in telemetry payloads
- server-side tests for accepted and rejected telemetry payloads

Metric values remain finite and within `0..120000`. A delta is the difference
from the previous report, so it may be negative when an INP estimate improves;
finite deltas within `-120000..120000` are accepted without clamping. Summaries
use the metric value rather than its delta.

The browser validates against the same strict contract before either beacon or
keepalive fetch. Unsupported samples (including nonfinite or out-of-range
measurements) are dropped locally without retries or fabricated replacement
values. The server still rejects invalid payloads with `400 REQUEST_BODY_INVALID`;
this preserves validation for stale clients and forged requests. For a remaining
400, inspect its validation issue path in the response rather than treating the
console message alone as a confirmed cause.

Operational usage:

- track Core Web Vitals by route pathname
- compare deploy cohorts during canary releases
- investigate regressions alongside visual and accessibility contract tests

Do not add high-cardinality user identifiers to this pipeline.
