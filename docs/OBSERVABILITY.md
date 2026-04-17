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
- configurable queue and utilization thresholds for pressure warnings

Ini memberi signal operasi yang cukup berguna walaupun belum menggunakan platform tracing penuh.

Env yang berkaitan:

- `PG_POOL_WARN_COOLDOWN_MS=60000`
- `PG_POOL_ALERT_WAITING_COUNT=2`
- `PG_POOL_ALERT_UTILIZATION_PERCENT=100`
- `PG_POOL_HEALTH_CHECK_INTERVAL_MS=60000`
- `PG_POOL_HEALTH_CHECK_TIMEOUT_MS=5000`

### Opt-In DB Query Profiling Untuk Semakan N+1

Repo kini juga ada profiler query per-request yang boleh dihidupkan sementara semasa staging, smoke,
atau load test untuk menyemak corak N+1 sebenar pada laluan HTTP.

Env yang berkaitan:

- `DB_QUERY_PROFILING_ENABLED=1`
- `DB_QUERY_PROFILING_ALLOW_IN_PRODUCTION=1`
- `DB_QUERY_PROFILING_SAMPLE_PERCENT=100`
- `DB_QUERY_PROFILING_MIN_QUERY_COUNT=8`
- `DB_QUERY_PROFILING_MIN_TOTAL_QUERY_MS=40`
- `DB_QUERY_PROFILING_REPEATED_STATEMENT_THRESHOLD=3`
- `DB_QUERY_PROFILING_MAX_LOGGED_STATEMENTS=5`
- `DB_QUERY_PROFILING_MAX_UNIQUE_STATEMENTS=250`

Bila aktif, request yang mempunyai query count tinggi atau statement berulang akan emit warning
berstruktur dengan:

- `queryCount`
- `totalQueryDurationMs`
- `uniqueStatementCount`
- `evictedStatementCount`
- `possibleNPlusOne`
- ringkasan `repeatedStatements`

Ini sengaja disabled secara default supaya traffic production biasa tidak berubah. Gunakan ia
untuk pengesahan terkawal di bawah load, kemudian matikan semula selepas analisis selesai.
Jika `NODE_ENV=production`, profiler kini akan kekal mati melainkan anda set kedua-dua
`DB_QUERY_PROFILING_ENABLED=1` dan `DB_QUERY_PROFILING_ALLOW_IN_PRODUCTION=1` secara
eksplisit untuk sesi troubleshooting yang sementara.
Permintaan yang menjana terlalu banyak SQL shape unik kini akan mengekalkan hanya tetingkap
LRU yang bounded supaya profiling tidak membesar tanpa had dalam runtime yang hidup lama.

### Request Timeout Semantics

Global request timeout masih dikawal melalui:

- `HTTP_REQUEST_TIMEOUT_MS=30000`

Tetapi operasi yang memang lebih berat dan dijangka mengambil masa lebih lama kini
menggunakan timeout route-scoped yang jelas:

- `BACKUP_OPERATION_TIMEOUT_MS=120000`
- `IMPORT_ANALYSIS_TIMEOUT_MS=45000`

Ini memastikan request biasa tetap bounded, sambil mengelakkan backup/export/analyze
diputuskan terlalu awal oleh timeout global yang lebih pendek.

### Browser Telemetry

Frontend menghantar Web Vitals ke:

- `POST /telemetry/web-vitals`

Dan monitor/admin flow boleh membaca ringkasan ini semula melalui route dalaman yang sesuai. Ini membantu melihat pengalaman pengguna sebenar tanpa menunggu external RUM platform.

### Optional Remote Error Tracking

Repo kini juga ada laluan remote error tracking yang opt-in untuk dua sumber:

- client runtime errors yang sudah ditangkap oleh error boundaries dan global handlers
- backend request errors yang berakhir sebagai 5xx / hidden `HttpError`

Env yang berkaitan:

- `CLIENT_ERROR_TELEMETRY_ENABLED=1`
- `VITE_CLIENT_ERROR_TELEMETRY=1`
- `REMOTE_ERROR_TRACKING_ENABLED=1`
- `REMOTE_ERROR_TRACKING_ENDPOINT=https://errors.example.com/ingest`
- `REMOTE_ERROR_TRACKING_TIMEOUT_MS=3000`

Tingkah laku sengaja kekal konservatif:

- tracking dimatikan secara default
- tiada DSN atau endpoint yang di-hardcode
- payload dihantar dalam bentuk sanitised dan bounded
- request correlation menggunakan `x-request-id` bila tersedia
- hidden server errors dihantar sebagai `Internal server error` dan bukannya mesej dalaman mentah
- kegagalan penghantaran remote hanya emit warning terhad dengan cooldown, supaya log production tidak menjadi bising

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

## 5. Log Rotation Dan Retention

Aplikasi ini sengaja log ke stdout/stderr melalui `pino`, jadi rotation dan
retention patut dikendalikan oleh lapisan runtime sebenar:

- container runtime / orchestrator
- systemd journald
- PM2 atau process manager setara

Repo ini tidak cuba mereka rotation palsu di level aplikasi kerana itu mudah
bercanggah dengan platform deploy sebenar. Semasa production review, semak:

- had retention log
- saiz maksimum per file/stream jika runtime menyokongnya
- forwarding ke sink pusat jika diwajibkan oleh operasi
