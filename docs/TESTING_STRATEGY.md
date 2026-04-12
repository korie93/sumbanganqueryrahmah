# Testing Strategy

Dokumen ini menerangkan bentuk ujian automatik yang benar-benar wujud dalam repo semasa, serta apa yang masih belum dianggap lengkap.

## 1. Unit dan Integration

Repo ini sudah mempunyai coverage untuk:

- `client` unit tests
- `server` HTTP, services, repositories, routes, WebSocket, dan intelligence tests
- reviewed migration/bootstrap integration tests

Perintah utama:

```bash
npm test
```

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

## 3. Bundle Budget Gate

Heavy client chunks seperti `charts`, `excel`, `pdf`, dan `capture` sudah dikawal melalui budget gate.

Jalankan:

```bash
npm run verify:bundle-budgets
```

Ini membantu pastikan dependency besar seperti `recharts`, `xlsx`, `jspdf`, dan `html2canvas` tidak melampaui had chunk yang sudah disemak.

## 4. Apa Yang Belum Dianggap Lengkap

Beberapa item audit masih wajar dianggap terbuka atau separa terbuka:

- belum ada visual regression baseline yang menyemak piksel/screenshot secara menyeluruh
- smoke Playwright semasa lebih kepada browser journey verification, bukan snapshot diff penuh
- belum ada read replica/reporting topology test kerana seni bina production semasa masih single-primary
- observability penuh seperti OpenTelemetry belum diaktifkan

Maksudnya:

- kita **sudah ada** browser E2E/smoke framework yang nyata
- tetapi kita **belum** patut mendakwa sudah ada visual regression suite penuh

## 5. Release Gate Yang Disyorkan

Untuk local/staging sebelum promotion:

```bash
npm run typecheck
npm run verify:bundle-budgets
npm run test:client
npm run test:http
npm run build
npm run test:e2e:smoke
```

Untuk gate yang lebih berat:

```bash
npm run release:verify:local
```
