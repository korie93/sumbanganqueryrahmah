# Load Testing Baseline

Repo ini belum mengintegrasikan full load/stress testing ke CI, tetapi ia kini
ada baseline yang sengaja kecil dan maintainable untuk digunakan semasa staging
atau pre-release verification.

## Starting Point

Gunakan fail scaffold:

- `load-tests/k6/sqr-smoke.js`

Scenario ini fokus pada laluan yang realistik dan bernilai tinggi:

1. health/readiness check
2. login flow
3. imports listing
4. backups listing

## Suggested Workflow

1. Sediakan environment staging dengan dataset yang realistik.
2. Export pemboleh ubah berikut:
   - `SQR_LOAD_BASE_URL`
   - `SQR_LOAD_USERNAME`
   - `SQR_LOAD_PASSWORD`
3. Jalankan `k6 run load-tests/k6/sqr-smoke.js`
4. Pantau:
   - structured logs
   - `/api/health/ready`
   - pool pressure warnings
   - request timeout warnings
   - DB query profiling jika dihidupkan untuk analisis terkawal

## Why This Is Intentionally Small

Load tests yang terlalu besar dan terlalu awal biasanya cepat drift. Scaffold ini
lebih berguna sebagai baseline yang mudah dikekalkan dan diperluas daripada satu
script "mega test" yang rapuh.

## Safe Next Expansions

- tambah scenario collection records read-heavy
- tambah scenario import upload untuk fail kecil
- tambah threshold assertions pada latency percentile staging
- tambah separate soak test profile untuk WebSocket concurrency
