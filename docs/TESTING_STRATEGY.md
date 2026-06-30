# Testing Strategy

Dokumen ini menerangkan bentuk ujian automatik yang benar-benar wujud dalam repo semasa, serta apa yang masih belum dianggap lengkap.

## 1. Unit dan Integration

Repo ini sudah mempunyai coverage untuk:

- `client` unit tests
- shared frontend/backend API contract tests
- `server` HTTP, services, repositories, routes, WebSocket, dan intelligence tests
- reviewed migration/bootstrap integration tests
- curated coverage gate untuk surface berisiko tinggi di `client` dan `server`

Perintah utama:

```bash
npm test
```

Untuk gate coverage yang lebih mewakili risk surface semasa:

```bash
npm run test:coverage:gate
```

Gate ini sekarang mengunci:

- shared API contract wrappers
- route contract kritikal untuk `imports` dan `settings`
- server-side import data pagination/read normalization
- viewer pagination adapter untuk contract bercampur
- URL safety / iframe preview helpers
- dialog viewport contract
- receipt preview downscale helpers
- local HTTP hardening untuk direct `/uploads`
- telemetry web-vitals throttling guard
- AI branch lookup fallback observability

Untuk semakan lebih cepat:

```bash
npm run test:client
npm run test:contracts
npm run test:backend
npm run test:http
npm run test:services
npm run test:repositories
npm run test:routes
```

`npm test` sengaja tidak menjalankan browser smoke, visual/a11y, build, atau release-only drills. Untuk PostgreSQL bootstrap/migration compatibility yang memerlukan database hidup, jalankan:

```bash
npm run test:db-integration
```

## 2. Browser Smoke / E2E Semasa

Repo ini sudah menggunakan `Playwright` untuk browser smoke coverage.

Perintah yang disyorkan:

```bash
npm run test:e2e:smoke
```

Alias ini menjalankan skrip Playwright yang:

- login ke app
- semak route utama
- semak navbar dan keyboard access
- semak menu pengguna, theme mode, backup flow, dan smoke UI lain
- tangkap screenshot/artifact apabila berlaku kegagalan

Untuk aliran CI tempatan yang lengkap:

```bash
npm run test:e2e:ci-local
```

Perintah ini:

- semak PostgreSQL
- build app
- hidupkan server built tempatan
- jalankan `smoke:preflight`
- jalankan browser smoke Playwright

## 3. Visual Layout Contract

Repo ini kini mempunyai `Playwright` visual layout contract yang ringan untuk route awam stabil, dan route authenticated kritikal apabila kredensial smoke disediakan.

Perintah:

```bash
npm run test:e2e:visual
```

Lapisan ini bukan pixel-diff penuh, tetapi ia mengunci regression visual yang sering berlaku pada:

- viewport/mobile overflow
- auth shell yang terkeluar dari skrin
- primary action yang tidak lagi kelihatan dalam initial viewport
- perubahan layout asas yang tidak akan ditangkap oleh unit test biasa

Jika `VISUAL_TEST_USERNAME` / `VISUAL_TEST_PASSWORD` atau `SMOKE_TEST_USERNAME` / `SMOKE_TEST_PASSWORD` tersedia, kontrak ini turut login dan menyemak app shell authenticated untuk `/`, `/collection/save`, dan `/viewer`. Tanpa kredensial, route authenticated ini diskip dengan mesej jelas supaya route awam masih boleh diuji secara standalone.

## 4. Accessibility Contract

Repo ini juga mempunyai Playwright accessibility contract yang ringan untuk route awam stabil, route authenticated kritikal apabila kredensial smoke disediakan, dan beberapa scenario screen-reader praktikal seperti pengumuman ralat borang login serta focus return untuk panel Floating AI.

Perintah:

```bash
npm run test:e2e:a11y
```

CI menggunakan wrapper berikut supaya audit kontras mempunyai entry point yang stabil:

```bash
bash scripts/a11y-contrast-check.sh http://127.0.0.1:5000
```

Lapisan ini bukan pengganti audit manual, axe penuh, atau Lighthouse accessibility score. Ia mengunci regression praktikal yang kerap berlaku:

- page mesti ada `main` landmark dan heading
- visible focusable controls mesti ada accessible name
- focusable controls tidak boleh berada dalam subtree `aria-hidden`
- duplicate `id` pada DOM route yang diperiksa akan gagal

Jika `A11Y_TEST_USERNAME` / `A11Y_TEST_PASSWORD` atau `SMOKE_TEST_USERNAME` / `SMOKE_TEST_PASSWORD` tersedia, kontrak ini turut login dan menyemak app shell authenticated untuk `/`, `/collection/save`, dan `/viewer`. Tanpa kredensial, route authenticated ini diskip supaya contract route awam kekal boleh dijalankan secara standalone.

CI dan local smoke orchestration menjalankan kontrak ini selepas visual layout contract dan sebelum smoke UI penuh.

## 5. Bundle Budget Gate

Heavy client chunks seperti `charts`, `excel`, `pdf`, dan `capture` sudah dikawal melalui budget gate.

Jalankan:

```bash
npm run verify:bundle-budgets
```

Ini membantu pastikan dependency besar seperti `recharts`, `xlsx`, `jspdf`, dan `html2canvas` tidak melampaui had chunk yang sudah disemak.

## 6. Apa Yang Belum Dianggap Lengkap

Beberapa item audit masih wajar dianggap terbuka atau separa terbuka:

- belum ada visual regression baseline pixel-diff penuh dengan golden screenshot merentas semua route
- visual contract semasa lebih fokus pada layout invariants untuk route kritikal, bukan diff piksel menyeluruh
- accessibility contract semasa ialah invariant guard ringan dengan subset authenticated apabila kredensial wujud dan beberapa scenario screen-reader utama, bukan axe/Lighthouse audit penuh untuk semua route authenticated
- device QA sebenar masih diperlukan untuk route padat, touch target ergonomics, dan polish di peranti sebenar
- belum ada read replica/reporting topology test kerana seni bina production semasa masih single-primary
- belum ada k6/Artillery load suite dalam CI; buat masa ini load/chaos testing perlu dijalankan sebagai drill staging berjadual kerana endpoint chaos sengaja mengganggu runtime
- observability penuh seperti OpenTelemetry belum diaktifkan

Maksudnya:

- kita **sudah ada** browser E2E/smoke framework yang nyata
- kita **sudah ada** visual layout contract ringan untuk route awam
- kita **sudah ada** accessibility contract ringan untuk route awam, subset authenticated utama apabila kredensial smoke tersedia, dan scenario screen-reader untuk ralat borang serta panel Floating AI
- tetapi kita **belum** patut mendakwa sudah ada visual regression suite pixel-baseline penuh
- kita **belum** patut mendakwa accessibility suite penuh merentas semua route authenticated

## 7. Load dan Chaos Testing Roadmap

Load testing production tidak patut dijalankan terus terhadap domain pengguna sebenar. Gunakan staging yang mempunyai PostgreSQL dan Redis terasing, data sintetik, serta `OPERATIONS_DEBUG_ROUTES_ENABLED=0` kecuali ketika drill terkawal.

Repo ini menyediakan smoke load runner ringan tanpa dependency tambahan untuk baseline awal:

```bash
LOAD_SMOKE_BASE_URL=https://staging.example.test \
LOAD_SMOKE_PATH=/api/health/live \
LOAD_SMOKE_REQUESTS=200 \
LOAD_SMOKE_CONCURRENCY=10 \
npm run perf:load-smoke
```

Runner ini sesuai untuk health/readiness dan endpoint read-only staging. Ia bukan pengganti k6/Artillery, tetapi memberi JSON summary status code dan latency percentile untuk gate manual sebelum suite load penuh.

Cadangan urutan sebelum integrasi k6/Artillery dalam CI:

1. Rate-limit drill: hantar traffic terkawal ke `/api/auth/login`, `/api/search/global`, dan `/api/collection/daily/overview`; sahkan status 429 muncul tanpa pool pressure berpanjangan.
2. WebSocket drill: buka sambungan bertahap dan sahkan heartbeat/idle close membersihkan `connectedClients`.
3. Chaos drill: aktifkan route chaos hanya di staging, inject DB latency/memory pressure secara pendek, dan sahkan circuit breaker/degrade mode pulih selepas window tamat.
4. CI gate: selepas angka baseline stabil, tambah skrip k6/Artillery sebagai job manual/approval-gated supaya PR biasa tidak lambat atau flaky.

## 8. Release Gate Yang Disyorkan

Untuk local/staging sebelum promotion:

```bash
npm run typecheck
npm run test:coverage:gate
npm run verify:bundle-budgets
npm run test:client
npm run test:http
npm run build
npm run test:e2e:visual
npm run test:e2e:a11y
npm run test:e2e:smoke
```

Untuk gate yang lebih berat:

```bash
npm run release:verify:local
```
