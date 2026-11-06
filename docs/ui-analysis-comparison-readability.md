# Analysis Compare — pembalutan identifier

Status: siap dan disahkan setempat pada 6 November 2026. Ini susulan kecil kepada pembaikan layout terdahulu; laporan terdahulu kekal sebagai rekod binaannya sendiri.

## Punca dan perubahan

`break-all` memecahkan perkataan dan nombor pada mana-mana aksara. Screenshot desktop sebelum menunjukkan “Not availab” diikuti “le”. Senarai akaun juga boleh terpotong di tengah nombor walaupun nombor itu boleh dimuatkan sepenuhnya pada baris seterusnya.

Dalam [SavedCustomerComparisonResults.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/analysis/SavedCustomerComparisonResults.tsx:88), tujuh penggunaan `break-all` ditukar kepada `break-words`. Tiga pembungkus medan mobile menerima `min-w-0` supaya token luar biasa panjang boleh membalut dalam grid.

Perubahan terhad kepada kelas CSS pada komponen ini. Nilai, sifar awal, separator akaun `, `, separator IC ` / `, fallback, saiz tulisan, grid, breakpoint dan skrol dalaman jadual dikekalkan. Tiada library, JavaScript runtime baharu, backend, permission atau navigasi diubah.

## Bukti sebelum dan selepas

Kedua-dua binaan diuji dengan fixture sintetik yang sama: empat rekod biasa dan empat rekod stress. Data stress merangkumi IC 12 digit, telefon 10–11 digit, akaun 16–20 digit, lapan akaun, IC berbeza, medan kosong, sisi tanpa rekod, serta token 128–286 aksara. Fixture ini menguji persembahan frontend, bukan ketepatan algoritma pemadanan backend.

| Ukuran | Sebelum | Selepas |
|---|---:|---:|
| Kes browser: 2 fixture × 6 lebar × 2 tema | 24 | 24 |
| Bacaan medan merentas semua kes | 400 | 400 |
| Perkataan fallback terpecah di tengah | 24 | 0 |
| Token nombor biasa 10–20 digit terpecah | 196 | 0 |
| Teks melimpah keluar dari kotak medan | 0 | 0 |
| Lebar dokumen melimpah viewport | 0 | 0 |
| Kes dengan ralat runtime | 0 | 0 |
| Pelanggaran axe dalam 8 imbasan | 0 | 0 |

Bilangan pembalutan ialah pemerhatian berulang merentas viewport dan tema, bukan bilangan isu unik. Pengesahan turut membandingkan semua teks medan dan saiz font sebelum/selepas secara tepat; semuanya sama.

Lebar diuji: **320, 375, 768, 1024, 1366 dan 1920px**, tema cerah dan gelap. Screenshot penuh dihasilkan pada 375 dan 1366px bagi kedua-dua fixture dan tema, lapan gambar setiap binaan. Pemeriksaan visual manual selepas meliputi fixture biasa pada desktop cerah/mobile gelap serta fixture stress pada desktop gelap/mobile cerah. Ukuran DOM meliputi semua 24 kes; ini tidak mendakwa semua viewport diperiksa secara visual manual.

Token luar biasa panjang masih membalut apabila tidak muat. Identifier bertanda sempang boleh membalut pada sempang. Jadual lebar menggunakan skrol dalamannya; tiada pemotongan nilai atau `nowrap` menyeluruh ditambah.

## Keputusan semakan

| Semakan | Keputusan | ID bukti |
|---|---|---|
| Build frontend dalam sandbox | Lulus | `receipt-adaptive-build-480bffc49ebd` |
| ESLint komponen berubah | Lulus | `receipt-adaptive-tests-d9273061bb0c` |
| TypeScript semantik fail berubah, konfigurasi CI asal | Lulus | `receipt-adaptive-tests-6f0801d6805b` |
| Tiga ujian SavedCustomerComparison sedia ada | 3/3 lulus | `receipt-adaptive-tests-90e7bea8d36a` |
| Browser sebelum, binaan `89757acd3c0c` | 24 kes selesai; defect direplikasi | `receipt-adaptive-tests-dcfc9308c115` |
| Browser selepas, binaan `480bffc49ebd` | 24 kes lulus | `receipt-adaptive-tests-f4226cdaec48` |
| Assertion perbandingan teks/font/pembalutan | Lulus | `receipt-adaptive-tests-f4226cdaec48-readability-verification.json` |
| `git diff --check` bagi komponen | Lulus | Setempat |

Typecheck ini berfokus pada fail berubah; keseluruhan graf projek dan keseluruhan CI tidak dijalankan semula untuk perubahan kelas ini. Benchmark CPU 4×/6× tidak diulang. Tiada akses production atau data pelanggan digunakan. Semua aplikasi, build, ujian dan Chromium dijalankan dalam sandbox WSL sedia ada dengan had sumber asal.

Bukti mentah setempat berada dalam [folder bukti selepas](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-f4226cdaec48) dan [keputusan assertion](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/receipt-adaptive-tests-f4226cdaec48-readability-verification.json). Harness dan fixture ujian kekal di luar aplikasi.

SHA-256 komponen yang disahkan: `f9db4bee80c73c4b3d5410431dbfe3acb571fa0c9f0d2c544a022a2765479aa2`.
