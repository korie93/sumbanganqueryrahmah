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

- `POST /telemetry/web-vitals`

Route public ini dilindungi oleh throttling ringan per client window dan lebihan sample dijatuhkan secara senyap dengan `204`, supaya ingestion sah tidak rosak tetapi spam tidak menambah log noise atau churn ring buffer. Monitor/admin flow boleh membaca ringkasan ini semula melalui route dalaman yang sesuai. Ini membantu melihat pengalaman pengguna sebenar tanpa menunggu external RUM platform.

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
