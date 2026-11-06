# Analysis Compare — petunjuk skrol di atas jadual

Status pembaikan yang diluluskan: **siap dan disahkan setempat**, 6 November 2026. Ujian rentas modul yang panjang belum lulus; batas ini diterangkan di bawah.

## Perubahan

Label terapung di pertengahan jadual menutup sebahagian teks akaun. Label kini mempunyai ruang sendiri dalam bar di atas jadual: teks di kiri, empat anak panah dan peratus kedudukan di kanan. Bar boleh membalut apabila bekas sempit. Label kekal stabil ketika pengguna sampai ke hujung kanan; seluruh bar hilang apabila jadual tidak lagi memerlukan skrol.

- [HorizontalScrollHint.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/HorizontalScrollHint.tsx:19): pilihan `hintPlacement="above"`; lalai `overlay` dikekalkan. Elemen JSX sedia ada digunakan semula tanpa menambah DOM pada mod lalai. Gradient tepi mod baharu dihadkan kepada viewport jadual.
- [SavedCustomerComparisonResults.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/analysis/SavedCustomerComparisonResults.tsx:150): hanya jadual Customer & Account Comparison mengaktifkan pilihan baharu.

Tiada perubahan pada data, font medan, lebar minimum jadual, kad mobile, navigasi aplikasi, backend atau permission. Tiada dependency, observer atau listener baharu. Pengiraan skrol, ref, `role`, `tabIndex`, label ARIA dan urutan empat butang asal dikekalkan. Jadual Column Difference dan consumer lain tidak ditukar ke mod baharu.

## Bukti paparan dan interaksi

Sebelum: binaan `receipt-adaptive-build-480bffc49ebd`, tangkapan `receipt-adaptive-tests-4de3c5f773f2`.

Selepas: binaan `receipt-adaptive-build-b5cd5ab8d5cb`, tangkapan akhir `receipt-adaptive-tests-6920d926d1bb`.

| Pemeriksaan Analysis Compare | Keputusan |
|---|---|
| 2 fixture × 6 lebar × 2 tema | 24 kes lulus |
| Lebar | 320, 375, 768, 1024, 1366, 1920px |
| Bar berada sepenuhnya di atas viewport jadual | 12 keadaan overflow lulus |
| Kad mobile; hint/kawalan desktop tersembunyi | 8 keadaan lulus |
| Jadual muat pada 1920px; hint/kawalan hilang | 4 keadaan lulus |
| Enter, Space, Tab/Shift+Tab, ArrowRight/ArrowLeft, 0→100→0 | 4 senario, 24 peralihan lulus |
| Teks panduan panjang dalam bekas 260px | Kedua-dua tema lulus; kumpulan kawalan kekal utuh |
| Nilai, separator dan font medan sebelum/selepas | Semua 400 bacaan sepadan |
| Overflow dokumen / ralat runtime | 0 / 0 |
| Imbasan axe | 8 imbasan, 0 pelanggaran |

Screenshot penuh diambil pada 375/1366px bagi kedua-dua fixture dan tema, lapan gambar setiap binaan. Pemeriksaan visual akhir meliputi desktop biasa cerah/gelap, desktop stress gelap dan mobile biasa cerah. Keempat-empat fail screenshot mobile 375px sama tepat mengikut SHA-256 sebelum/selepas. Lebar lain disemak melalui ukuran DOM; tidak didakwa semuanya diperiksa secara visual manual.

Tangkapan awal selepas ujian keyboard (`bf89eff1e172`) ditolak untuk perbandingan visual kerana halaman masih berskrol. Harness memulihkan fokus neutral dan skrol halaman ke awal, kemudian mengambil set akhir `6920d926d1bb`; kod aplikasi tidak berubah antara kedua-duanya.

[Gambar sebelum](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-4de3c5f773f2/admin-analysis-compare-dark-1366.jpg) · [Gambar selepas](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-6920d926d1bb/admin-analysis-compare-dark-1366.jpg) · [Assertion perbandingan](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/receipt-adaptive-tests-6920d926d1bb-scroll-hint-verification.json).

## Semakan kod dan regresi

| Semakan | Keputusan / ID bukti |
|---|---|
| Build frontend | Lulus — `receipt-adaptive-build-b5cd5ab8d5cb` |
| ESLint dua fail berubah | Lulus — `receipt-adaptive-tests-f268fecc24b6` |
| TypeScript semantik dua fail berubah, konfigurasi CI asal | Lulus — `receipt-adaptive-tests-5814dd26e5d2` |
| Empat kontrak sumber skrol + tiga ujian Comparison sedia ada | 7/7 lulus — `receipt-adaptive-tests-ac5324d902b9` |
| Detector Impeccable sebelum/selepas | Exit 0, JSON `[]`; semakan mekanikal sahaja |
| Activity berasingan: 6 lebar × 2 tema | 12 kes lulus — `receipt-adaptive-tests-e4ce1632b366`; kanan→hujung100%→awal0% pada desktop kedua-dua tema |
| Viewer berasingan: 6 lebar × 2 tema | 12 kes lulus — `receipt-adaptive-tests-8d7013440a1f`; kanan→hujung100%→awal0% pada 768px kedua-dua tema; fixture muat tanpa overflow pada desktop |
| `git diff --check` dua fail | Lulus; amaran normalisasi LF/CRLF sahaja |

Gabungan akhir ialah **48 kes browser terfokus**, dengan 16 imbasan axe tanpa pelanggaran. Angka ini tidak termasuk pengulangan diagnostik dan tidak menggantikan ujian rentas modul yang belum lulus.

## Batas pengesahan

Ujian sedia ada `dashboard scaling and data tables preserve reachable content` **belum lulus dalam sandbox**. Cubaan `receipt-adaptive-tests-1a3e4dec6a82` tidak menemui baris Activity pada assertion; cubaan diagnostik `receipt-adaptive-tests-55569f012669` mencapai had 90 saat, dengan cleanup selepas context ditutup. Route, payload fixture dan permission sepadan sumber, tetapi punca runtime ujian panjang itu belum disahkan. Kejayaan ujian Activity berasingan tidak menggantikan keputusan ujian panjang ini. Tiada timeout, threshold, assertion atau logik Activity dilonggarkan untuk mendapatkan keputusan hijau.

Semua aplikasi, ujian dan Chromium berjalan dalam sandbox WSL sedia ada menggunakan data sintetik dan had sumber asal. Typecheck seluruh graf projek, keseluruhan CI, peranti fizikal, Safari dan benchmark CPU 4×/6× tidak diulang untuk perubahan ini. Semakan ini tidak membuktikan keseluruhan aplikasi bebas regresi. Harness dan fixture tambahan kekal di luar aplikasi; tiada production diakses.

Hash SHA-256 fail yang dibina:

- `HorizontalScrollHint.tsx`: `5f0f1b978a290c288dbaa7cc8c4ff581dc9bf3dfb677ec23337f1a630ef30468`.
- `SavedCustomerComparisonResults.tsx`: `9258e62853f5c73df9f6f1548a358c07e7cec3ed166213999e0040f8ab90a2c1`.
