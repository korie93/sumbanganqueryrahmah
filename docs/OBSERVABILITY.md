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

Process-local memory rate limiting is acceptable only for single-worker/single-instance deployments. Redis (`SQR_RATE_LIMIT_STORE=redis` and `SQR_REDIS_RATE_LIMIT_URL`) shares fixed-window counters, adaptive runtime-protection buckets, 2FA replay protection, and JWT logout revocation checks across app processes. WebSocket fan-out can also use Redis (`SQR_WS_SHARED_BUS=redis`, optionally `SQR_REDIS_WS_URL`) for settings broadcasts and cross-worker activity close propagation. Production multi-worker mode is allowed only when both the Redis rate-limit/replay store and WebSocket shared bus are configured. When Redis is explicitly configured for adaptive protection or session revocation, the system fails closed instead of silently falling back to process-local memory; operators should treat repeated `adaptive_rate_state_unavailable` responses or revocation-store warnings as an infrastructure incident.

HTTP throttling responses expose `Retry-After`, `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` so browser clients and operational probes can back off without parsing log output. CSRF rotation also returns the fresh token in `X-CSRF-Token` alongside the readable `sqr_csrf` cookie for clients that prefer header-based refresh handling after sensitive mutations.

Runtime WebSocket upgrades are rate limited by IP. Accepted sockets are also bounded by `SQR_WS_MAX_CONNECTIONS` and each socket has a lightweight inbound message cap. The current client protocol does not require high-frequency inbound messages, so repeated client messages over the limit are treated as abuse and closed with a policy-violation code.

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
