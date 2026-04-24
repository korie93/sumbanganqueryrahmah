# Testing Strategy

Dokumen ini menerangkan bentuk ujian automatik yang benar-benar wujud dalam repo semasa, serta apa yang masih belum dianggap lengkap.

## 1. Unit dan Integration

Repo ini sudah mempunyai coverage untuk:

- `client` unit tests
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

Untuk semakan lebih cepat:

```bash
npm run test:client
npm run test:http
npm run test:services
npm run test:repositories
npm run test:routes
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

Repo ini kini mempunyai `Playwright` visual layout contract yang ringan untuk route awam yang stabil.

Perintah:

```bash
npm run test:e2e:visual
```

Lapisan ini bukan pixel-diff penuh, tetapi ia mengunci regression visual yang sering berlaku pada:

- viewport/mobile overflow
- auth shell yang terkeluar dari skrin
- primary action yang tidak lagi kelihatan dalam initial viewport
- perubahan layout asas yang tidak akan ditangkap oleh unit test biasa

## 4. Accessibility Contract

Repo ini juga mempunyai Playwright accessibility contract yang ringan untuk route awam stabil.

Perintah:

```bash
npm run test:e2e:a11y
```

Lapisan ini bukan pengganti audit manual, axe penuh, atau Lighthouse accessibility score. Ia mengunci regression praktikal yang kerap berlaku:

- page mesti ada `main` landmark dan heading
- visible focusable controls mesti ada accessible name
- focusable controls tidak boleh berada dalam subtree `aria-hidden`
- duplicate `id` pada DOM route awam akan gagal

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
- accessibility contract semasa ialah invariant guard ringan, bukan axe/Lighthouse audit penuh untuk semua route authenticated
- device QA sebenar masih diperlukan untuk route padat, touch target ergonomics, dan polish di peranti sebenar
- belum ada read replica/reporting topology test kerana seni bina production semasa masih single-primary
- observability penuh seperti OpenTelemetry belum diaktifkan

Maksudnya:

- kita **sudah ada** browser E2E/smoke framework yang nyata
- kita **sudah ada** visual layout contract ringan untuk route awam
- kita **sudah ada** accessibility contract ringan untuk route awam
- tetapi kita **belum** patut mendakwa sudah ada visual regression suite pixel-baseline penuh
- kita **belum** patut mendakwa accessibility suite penuh merentas semua route authenticated

## 7. Release Gate Yang Disyorkan

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
