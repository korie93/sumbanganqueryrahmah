# Pembetulan CI: kestabilan dan keselamatan paparan AI

Tarikh: 9 November 2026. Branch: `codex/visual-layout-repair`. Asas: `2f3fffb24a4afc1cdca3b65ef7ea0896d547fa54`.

## Dapatan dan punca

Run GitHub Actions [42531355557](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/42531355557), job `128887614918`, gagal pada **Run Playwright visual regression snapshots**: 1,017 ujian lulus dan dua gagal. Kedua-duanya ialah `AI reading polish stability full/floating`. Assertion terakhir `expect(cspErrors).toEqual([])` menerima amaran `Executing inline event handler ... script-src-attr 'none'`; pemeriksaan identiti DOM dan kandungan selamat sebelumnya telah lulus.

Run terkini [42534856877](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/42534856877), pada asas `2f3fffb2`, selesai dengan **1,022 lulus, dua gagal yang sama dan satu flaky** pada 9 November, 08:11 MYT. `build-and-test` dan `coverage-gate` lulus. Pembetulan dalam working tree ini belum dimasukkan dalam run tersebut.

Ujian kestabilan mencampurkan dua tujuan: mengekalkan DOM sepanjang reveal jawapan, dan sengaja memasukkan HTML dengan `onerror`/`onload`. Chrome 156 melaporkan handler berbahaya semasa DOMPurify memproses HTML itu. Polisi CSP menyekat handler tersebut. Ini bukan bukti handler berjaya dilaksanakan.

Perbezaan persekitaran menyembunyikan masalah setempat: preview statik tidak mempunyai CSP Express, manakala Chromium headless 148 tidak menghasilkan diagnostik yang sama walaupun arahan CSP berkaitan ditambah. Microprobe Chrome 156 terhadap sanitizer sebenar menghasilkan 40 diagnostik CSP bagi 52 kes, dengan sifar execution sentinel dan sifar nod berbahaya dalam hasil DOM yang diperiksa. Perilaku penghalangan inline handler selaras dengan [spesifikasi CSP](https://www.w3.org/TR/CSP/#directive-script-src-attr); kiraan dan lokasi diagnostik di atas ialah pemerhatian runtime projek ini.

Eksperimen membenarkan pembalut BODY dalaman menghapuskan operasi clone yang diperhatikan tetapi **tidak menghapuskan diagnostik**. Hipotesis itu ditolak dan perubahan sanitizer diundur sepenuhnya. Punca kegagalan CI ialah jangkaan ujian yang tidak membezakan input biasa daripada diagnostik penghalangan input berbahaya.

## Pembetulan

Hanya `tests/visual/ai-reading-polish.spec.ts` diubah:

- Tambah polisi CSP berkaitan kepada respons navigasi ujian. Polisi sedia ada dikekalkan; polisi tambahan mengenakan sekatan bersama.
- Kekalkan ujian kestabilan dengan input biasa dan syarat **sifar diagnostik keselamatan**. Semua pemeriksaan identiti DOM, pertumbuhan senarai/kod, Unicode, draf, sejarah dan scroll dikekalkan.
- Tambah dua ujian input berbahaya, untuk chat penuh dan terapung. Ujian memeriksa hasil teks/senarai/kod tepat, Trusted Types native tersedia, sifar handler atau elemen berbahaya dalam mutasi log chat, sifar execution sentinel/dialog dan tiada permintaan AI tambahan.
- Terima hanya diagnostik penghalangan yang dibuktikan: `script-src-attr`, `inline`, `enforce`, daripada URL chunk DOMPurify yang benar-benar dimuatkan dengan HTTP 200. Mesej console mesti sepadan dengan diagnostik Chrome yang diperhatikan. Diagnostik CSP/Trusted Types lain masih menggagalkan ujian.
- Periksa nama atribut dalam MutationObserver supaya handler yang ditambah dan dibuang dalam kelompok mutasi sama tetap dikesan.
- Kendalikan `/api/csp-report` khusus dalam ujian serangan: hanya POST dalam tempoh serangan, envelope legacy `application/csp-report` atau Reporting API `application/reports+json` yang sah, directive/URI/disposition tepat dan sumber sanitizer jika disertakan. Laporan lain direkod sebagai kegagalan. Baseline biasa tetap wajib sifar laporan; endpoint fixture lain tidak dilonggarkan.

Kod aplikasi, UI, sanitizer, CSP server, dependencies, API, auth, permission dan data tidak diubah. Tiada threshold prestasi atau bajet amaran dilonggarkan.

## Pengesahan

Semua pelaksanaan kod sasaran dilakukan bersiri dalam sandbox WSL `SQR-Audit`, dengan data sintetik: CPU 100%, RAM 768 MiB, swap 0, 128 proses, masa CPU 120 saat dan wall time 180 saat bagi setiap job. Tiada pakej atau binary baharu dimuat turun. Chrome 156 yang telah diluluskan dan tersedia digunakan secara baca sahaja.

| Semakan | Keputusan | Receipt |
|---|---|---|
| Lint fail ujian akhir | Lulus | `2e5ecbfab6d5` |
| TypeScript semantik terfokus, pilihan compiler CI asal | Lulus | `ca19b23652ca` |
| Unit sanitizer dan pemformatan, kod aplikasi tidak berubah | 11/11 lulus | `cb61bb98c306` |
| UI kestabilan penuh, CSP ketat, fail akhir | Lulus | `fab1b681e9a9` |
| UI kestabilan terapung, CSP ketat, fail akhir | Lulus | `a15476feb228` |
| UI input berbahaya penuh, fixture laporan akhir | Lulus | `1708dca9b76c` |
| UI input berbahaya terapung, fixture laporan akhir | Lulus | `3ad69b93b102` |
| Microprobe Chrome 156 + laporan CSP HTTP sebenar | 52 kes lulus | `1c313ccb2d7a` |

Keenam-enam semakan akhir lint/types/stability/security menggunakan SHA-256 fail ujian `afbaca5caa756c0997e3031026791735136e85d83f8d6d0eb506f705d2639f59`. Ujian keselamatan aplikasi merekod sifar unsafe chat node/execution/dialog dan satu permintaan AI bagi setiap paparan pada Chromium 148. Kiraan CSP/report ialah sifar pada browser tersebut; ia tidak membuktikan Chrome 156 tidak mengeluarkan diagnostik.

Microprobe akhir `ai-csp-probe-v3-reporting` menggunakan Chrome `156.0.8078.80`: dua konteks × 26 kes, 40 event/diagnostik CSP, dua POST automatik `application/csp-report` yang sah, sifar laporan bagi input biasa, sifar external request/page error dan browser ditutup bersih. Laporan mengandungi `script-src-attr`/`inline`/`enforce` dengan sumber `/purify.mjs`. Kiraan laporan tidak disamakan dengan kiraan event; penghantaran `report-to` berkelompok tidak diuji.

Hash 2,055 fail aplikasi dalam katalog sumber ujian sepadan dengan build sedia ada `0ba7d87532bf`; tiada perubahan aplikasi untuk dibina semula. Typecheck penuh projek dan keseluruhan suite CI tidak dijalankan semula setempat bagi perubahan ujian ini.

## Pemerhatian lain yang belum disahkan

Run terbaru mempunyai satu ujian **flaky**, `AI keyboard behavior rotation: touch landscape preserves focus, draft and reading` (`tests/visual/ai-keyboard-viewport.spec.ts:202`). Percubaan pertama mengekalkan fokus/draf tetapi jurang scroll bawah ialah 126 px, melebihi 2 px; retry pertama lulus dalam 4.4 saat. Ia bukan salah satu daripada dua kegagalan kekal.

Semakan sumber menunjukkan kemungkinan scroll akibat reflow ketika putaran disalah anggap sebagai pengguna membaca sejarah. Ini **hipotesis**, belum direproduksi atau dibuktikan. Tiada perubahan dibuat kepada mekanisme scroll dan tiada timeout/threshold ditambah untuk menyembunyikannya. Diagnosis lanjut memerlukan jejak urutan scroll/resize/ResizeObserver dan checkpoint sebelum putaran.

## Batas bukti

- Ujian aplikasi penuh/terapung setempat menggunakan Chromium headless 148. Microprobe Chrome 156 menguji sumber sanitizer sebenar dan DOMPurify, tetapi tidak merangkumi keseluruhan lifecycle React atau backend.
- Chrome 156 untuk keseluruhan aplikasi mencapai had sumber sandbox; percubaan itu dihentikan dan tidak dikira lulus. Had sumber tidak dinaikkan.
- MutationObserver meliputi subtree log chat semasa reveal yang diuji, bukan semua DOM detached dalaman DOMPurify atau semua kesan asinkron masa hadapan.
- Ujian hostile-input meliputi payload sintetik yang dinyatakan dalam kod; ia bukan audit menyeluruh semua kemungkinan XSS.
- Pembetulan ini tidak mendakwa semua amaran production telah dihapuskan. Diagnostik penghalangan bagi input sengaja berbahaya boleh tetap berlaku.
- Keseluruhan workflow selepas perubahan ini memerlukan run GitHub Actions pada commit yang mengandungi pembetulan.

## Lokasi bukti setempat

Harness dan receipt berada di luar repositori: `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/`.

Log CI asal: `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ci-ai-session-20261109/previous-8c/job-128887614918.log`; SHA-256 `865637f5fecb9a09b3003a6481085369c6d2d0cea07dfaad855c05508d0771d9`.

Microprobe red: `receipt-adaptive-tests-0546bc0d314d`. Eksperimen BODY yang ditolak: `receipt-adaptive-tests-01f77c52eb00`. Microprobe defense: `receipt-adaptive-tests-67feeb37600e` (52 kes, 40 diagnostik yang diperiksa, sifar external request/page error, browser ditutup bersih).
