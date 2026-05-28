# Observability

Dokumen ini menerangkan observability semasa yang benar-benar wujud dalam repo, dan membezakan antara apa yang sudah ada dengan apa yang masih dianggap future work.

## 1. Apa Yang Sudah Ada

### Structured Logging

Server menggunakan logging berstruktur melalui `pino` dan helper logger repo. Ini ialah sumber utama untuk:

- startup/shutdown diagnostics
- auth/session failures
- pool pressure dan health-check warnings
- AI timeout / queue / fallback behavior
- receipt scan dan quarantine warnings
- background runtime failures

### Runtime Health Endpoints

Health endpoints yang sudah wujud:

- `GET /api/health/live`
- `GET /api/health/ready`

Kegunaan:

- `live`: proses hidup
- `ready`: startup selesai dan dependency penting sudah sedia

Gunakan `ready` sebagai gate sebenar selepas deploy, bukan sekadar port terbuka.

### PostgreSQL Pool Monitoring

Repo sudah ada runtime monitor untuk pool PostgreSQL:

- pressure warnings
- periodic `SELECT 1` health check
- timeout logging untuk health check yang gagal

Ini memberi signal operasi yang cukup berguna walaupun belum menggunakan platform tracing penuh.

### Browser Telemetry

Frontend menghantar Web Vitals ke:

- `POST /api/telemetry/web-vitals`

Route canonical berada di bawah `/api/*` untuk konsistensi middleware. Legacy `POST /telemetry/web-vitals` masih diterima sementara untuk client lama, tetapi ingestion baharu perlu guna route canonical. Legacy route dijadualkan untuk dibuang selepas 2026-06-15; jangan tambah client baharu yang menghantar ke path lama. Endpoint ini dikecualikan daripada CSRF token kerana `sendBeacon`/`keepalive` browser telemetry tidak boleh diandaikan membawa header tersebut. Ia bukan endpoint ingestion umum: server masih menguatkuasakan same-site Origin/Referer signal, JSON content type, limit body 4KB, dan drop guard per-IP yang bounded. Lebihan sample dijatuhkan secara senyap dengan `204`, supaya ingestion sah tidak rosak tetapi spam tidak menambah log noise atau churn ring buffer. Jangan hantar data peribadi, token, cookie, session id, atau identifier auth ke payload Web Vitals. Monitor/admin flow boleh membaca ringkasan ini semula melalui route dalaman yang sesuai. Ini membantu melihat pengalaman pengguna sebenar tanpa menunggu external RUM platform.

### Runtime Monitor Signals

Repo juga sudah ada signal operasi seperti:

- stale conflict / 429 pressure snapshots
- runtime monitor alerts
- queue backlog / lag metrics
- AI gate / latency / circuit state

Command yang berguna:

```bash
npm run monitor:stale-conflicts
```

### Rate Limit Topology

Process-local memory rate limiting is acceptable only on strict local/test hosts. Production-like startup requires Redis (`SQR_RATE_LIMIT_STORE=redis` and `SQR_REDIS_RATE_LIMIT_URL`) so fixed-window counters, adaptive runtime-protection buckets, 2FA replay protection, and JWT logout revocation checks are shared and fail closed instead of silently downgrading to memory. WebSocket fan-out can also use Redis (`SQR_WS_SHARED_BUS=redis`, optionally `SQR_REDIS_WS_URL`) for settings broadcasts and cross-worker activity close propagation. Production multi-worker mode is allowed only when both the Redis rate-limit/replay store and WebSocket shared bus are configured. Operators should treat repeated `adaptive_rate_state_unavailable` responses or revocation-store warnings as an infrastructure incident.

When any Redis-backed runtime component is configured, the local server also runs
a lightweight Redis health monitor. It pings each unique Redis endpoint every
`SQR_REDIS_HEALTH_CHECK_INTERVAL_MS` milliseconds, logs a warning while an
endpoint remains unavailable, and logs recovery once pings succeed again. The
monitor sanitizes Redis URLs before logging so credentials are never emitted.

The Redis integrations use long-lived multiplexed clients rather than a large
application-side connection pool. Keep Redis `maxclients` sized for every app
process plus publisher/subscriber duplicates, and watch reconnect warnings:
`Redis rate-limit store reconnect scheduled`, `Redis 2FA replay store
unavailable`, `Redis session revocation store unavailable`, and `Redis
WebSocket shared bus unavailable`. These indicate shared runtime state is at
risk and should page the operator for production deployments. Session
revocation Redis failures emit the structured event
`session_revocation_redis_failure`, increment
`sessionRevocationRedisErrorsTotal`, and mark readiness degraded until Redis
recovers; the payload is limited to provider, operation, classification, and
sanitized error name/code so JWT ids and user identifiers are not logged.

HTTP throttling responses expose `Retry-After`, `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` plus the legacy-compatible `X-RateLimit-*` variants so browser clients and operational probes can back off without parsing log output. Authenticated requests are counted against both an IP bucket and a per-user bucket (`SQR_RATE_LIMIT_USER_READS_PER_MINUTE`, `SQR_RATE_LIMIT_USER_WRITES_PER_MINUTE`, `SQR_RATE_LIMIT_USER_UPLOADS_PER_MINUTE`). CSRF rotation also returns the fresh token in `X-CSRF-Token` alongside the readable `sqr_csrf` cookie for clients that prefer header-based refresh handling after sensitive mutations.

Runtime WebSocket upgrades are rate limited by IP. Accepted sockets are also bounded by `SQR_WS_MAX_CONNECTIONS`, inbound messages larger than `SQR_WS_MAX_MESSAGE_BYTES` close with code `1009`, and messages at or above 64KB emit a structured warning without payload contents. The current client protocol does not require high-frequency inbound messages, so repeated client messages over the rate cap are treated as abuse and closed with a policy-violation code.

Runtime WebSocket socket ownership is centralized through the lifecycle registry in `server/ws/runtime-socket-lifecycle-registry.ts`. Cleanup paths for close, error, heartbeat timeout, shared-bus close, broadcast failure, and server shutdown must deregister the socket from the same registry so `connectedClients`, activity entries, instance entries, cleanup callbacks, and tracked sockets return to zero together. The focused WebSocket test suite includes rapid reconnect and cleanup-failure drills; run `npm run test:ws` after any runtime socket lifecycle change.

The collection rollup PostgreSQL `LISTEN` subscriber owns notification, error, and end handlers through an explicit listener registry. Reconnect paths unsubscribe the old client before attaching a new one, and `getDiagnostics().pendingListenerCleanups` should remain `1` while connected and `0` after stop. Run `npx tsx --test server/tests/collection-rollup-refresh-notification.test.ts server/http/tests/collection-rollup-refresh-notification.test.ts` after changes to the rollup notification lifecycle.

Cluster master fatal handlers are wrapped at the `process.on("uncaughtException")` and `process.on("unhandledRejection")` boundary. If structured logging or the graceful fatal shutdown path throws, the wrapper writes a final stderr line and exits with code `1` so the process supervisor can restart instead of leaving a half-shutdown master alive.

## 2. Apa Yang Belum Dianggap Siap

Perkara berikut masih patut dianggap future work:

- OpenTelemetry end-to-end tracing
- central trace/span correlation across HTTP, DB, WebSocket, dan background jobs
- vendor-backed observability stack seperti Grafana Tempo, Honeycomb, Datadog, atau New Relic
- read-replica lag observability kerana topologi semasa masih single-primary

Maksudnya:

- repo ini **bukan kosong observability**
- tetapi repo ini **belum** patut didakwa mempunyai full distributed tracing platform

## 3. Cadangan Praktikal Semasa

Untuk operasi harian yang disiplin, minimum yang patut dipantau:

1. `GET /api/health/ready`
2. server logs berstruktur
3. `npm run monitor:stale-conflicts`
4. smoke/UI verification selepas deploy
5. bundle budget gate untuk client payload besar

## 4. Bila Perlu Tambah OpenTelemetry

OpenTelemetry mula berbaloi apabila sekurang-kurangnya satu daripada ini benar:

- lebih daripada satu app instance production aktif
- query latency perlu ditrace merentas route/service/repository dengan lebih halus
- ada worker/background topology yang lebih kompleks
- perlu korelasi request merentas reverse proxy, app, queue, dan external AI provider

Sebelum titik itu, logging berstruktur + health endpoints + runtime monitor repo ini biasanya memberi nisbah manfaat/risk yang lebih baik.
