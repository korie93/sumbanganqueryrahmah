# Pembetulan smoke-ui: startup auth V17

## Kegagalan yang disahkan

Run GitHub Actions `43719580856`, commit `0d0e1447e0c35fff3ea9e89ba35d0f7d8e605eb5`,
gagal dalam job `smoke-ui`, langkah **Verify V17 authentication states and responsive views**.
Mesej: `Login helpers stay in a lazy, route-hinted chunk, not the shared HTML entry. 0 !== 1`.
Build-and-test dan coverage lulus pada run tersebut; langkah smoke selepas V17 belum dijalankan.

## Punca dan pembetulan

1. Helper navigasi dikongsi oleh App dan chrome auth yang lazy. Pemilikan chunk
   transitif meletakkannya dalam `public-auth-runtime`, menyebabkan entry mengimport
   keseluruhan runtime auth secara eager. `vite.config.ts` kini memberikan pemilikan
   eksplisit kepada `public-runtime` untuk empat modul yang memang diperlukan App.
   Route dan komponen auth kekal lazy. `AuthError` digabungkan dengan runtime auth
   supaya shell persistent tidak menambah satu lagi permintaan startup kecil.
2. Ujian browser masih menganggap shell belum dipasang dan ilustrasi ialah CSS
   pseudo-element. Ujian kini memeriksa form belum dipasang semasa chunk Login
   ditahan, kemudian memeriksa `src`, decode imej dan permintaan sebenar.
3. `context.route` mematikan HTTP cache dan pelayan statik ujian menggunakan
   `no-store`. Ini menghasilkan dua permintaan untuk preload imej dan elemen `img`.
   Probe tanpa interception, menggunakan cache immutable seperti aset production,
   menghasilkan satu permintaan. Ujian cold startup kini menggunakan fixture HTTP
   loopback dengan cache aset immutable; API kekal sintetik dan halaman dihadkan
   kepada origin fixture melalui CSP. Fixture senario auth lain tidak berubah.
4. URL modulepreload mutlak dinormalisasi hanya selepas origin dan path disahkan.
   Had **12 skrip**, maksimum **2 stylesheet**, satu permintaan imej dan larangan
   memuatkan modul private semasa anonymous startup semuanya dikekalkan.

## Fail berubah

- `vite.config.ts`: pemilikan chunk.
- `scripts/tests/vite-config.test.mjs`: regresi pemilikan, termasuk path Windows/POSIX.
- `scripts/auth-v17-built-browser.mjs`: fixture cache dan assertion mengikut DOM semasa.
- Dokumen ini: bukti dan batas pengesahan.

## Bukti pengesahan lokal

- Regresi pemilikan gagal sebelum pembetulan: run sandbox `6403245468f0`.
- Build frontend sebenar lulus: `auth-smooth-build-113099787fe3`.
- 51 ujian konfigurasi, fixture auth, view transition dan kontrak memori public auth
  lulus, tiada skip: `auth-smooth-tests-4da9e7460b18`.
- Skrip browser sebenar mencapai `AUTH_V17_BUILT_PASS (38 checks)` pada
  `auth-smooth-tests-dc3f7ad3b80c`; semakan akhir dengan CSP fixture ditambah
  turut lulus (exit 0, 53.708 saat): `auth-smooth-tests-d087f72ba51d`.

Browser menggunakan build sebenar dengan API rekaan: login BM/EN pada lebar
320, 360, 390, 430, 768, 1024, 1280, 1366, 1440 dan 1920; MFA, pemeliharaan nilai,
submit berganda, ralat login, lupa/reset kata laluan, accessibility dan CSP/Trusted Types.
Ini ujian automatik, bukan pemeriksaan visual manual atau ujian backend production.

Semua eksekusi projek dibuat dalam WSL/bwrap tanpa rangkaian luar, dengan had
CPU, memori, proses dan masa. Harness lokal menyesuaikan path dan binary Chromium.
Oleh sebab sandbox melaporkan `navigator.onLine=false` walaupun loopback berfungsi,
harness mensimulasikan nilai online/offline dan event secara eksplisit; assertion
CI asal tidak dipadam atau dilonggarkan. Pemulihan rangkaian native masih perlu
disahkan oleh runner CI biasa.

Keseluruhan pipeline CI, snapshot visual dan Lighthouse belum dijalankan semula
untuk patch ini. Tiada perubahan UI, backend, permission, data atau deployment.
