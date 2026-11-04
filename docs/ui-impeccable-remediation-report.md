# Laporan pembaikan UI/UX Impeccable SQR

5 November 2026 · baseline `ab44bda4fe34e4b3e1bd3cc17f48a73e1c97b343` · frontend sahaja.

**Siap dalam skop yang diluluskan: 21 isu dibaiki, termasuk kesemua 9 P1. S12 dan S21 kekal ditangguhkan mengikut arahan pengguna. Skor audit baharu: 15/20 berbanding 13/20.** Build, regresi dan pengesahan browser selesai seperti bukti di bawah. Typecheck seluruh projek dan pipeline npm CI standard belum dapat disahkan lulus; batas ini kekal dinyatakan.

## Integriti reka bentuk dan skop

SQR mengekalkan logo, palet neutral cerah/gelap, navigasi, modul dan aliran operasi sedia ada. Pembaikan tertumpu pada draf yang selamat, maklum balas yang tepat, label, semantik, kontras dan susun atur teks. Tiada reka bentuk SaaS baharu, library tambahan atau pemansuhan animasi berfungsi. Backend, database, API, autentikasi/sesi, penguatkuasaan permission dan data Collection tidak diubah.

Sembilan P1 dibaiki dan diuji dahulu, diikuti P2 yang selamat, polish tempatan dan audit akhir. Mod Impeccable: harden (state/aksesibiliti), clarify (label/feedback/preview), layout/adapt (Maintenance), optimize/harden (AI), kemudian polish/audit. Context/playbook/craft-floor digunakan; detector ialah bukti tambahan dan bukan pengganti screenshot atau ujian tindakan.

## Status S01–S23

`Dibaiki` bermaksud perubahan kod dan bukti khusus yang dinyatakan; bukan jaminan semua browser/akaun produksi telah diuji. Pautan utama di bawah dilengkapkan dengan inventori fail penuh.

| ID | Keutamaan | Hasil sebenar | Bukti utama |
|---|---|---|---|
| S01 | P1 | Dibaiki. Save Target disekat ketika calendar mempunyai draf; pemilikan mutasi segerak mengelakkan save/refresh serentak; scope/refresh latar tidak menggantikan draf. | Unit guard/draft; Playwright Daily: target PUT 0 semasa draf, pending review kekal 1, refresh latar tidak mengosongkannya. |
| S02 | P1 | Dibaiki. Nama aksesibel disclosure kumpulan menyertakan nickname ketua; expanded/controls kekal. | Ujian markup beberapa kumpulan dan browser keyboard. |
| S03 | P1 | Dibaiki. Job Import yang dipulihkan diberi keutamaan walaupun objek File asal tiada; status/Resume menggunakan job sedia ada. | Unit workflow dan Playwright pemulihan job asinkron/Resume. |
| S04 | P1 | Dibaiki. Viewer virtual mempunyai table/rowgroup/row/columnheader/cell, jumlah dan indeks baris yang betul; virtualisasi dikekalkan. | Unit markup, browser AX tree: 1 table / 2 rowgroup / 23 row / 6 header / 132 cell bagi fixture 200 baris. |
| S05 | P1 | Dibaiki. AND/OR mempunyai pressed state; baris filter mempunyai nama unik untuk medan/operator/nilai. | Unit aksesibiliti, browser keyboard/state. |
| S06 | P1 | Dibaiki. Audit Logs membezakan loading/error/empty, menyediakan Retry, menyembunyikan hasil/summary/export lama apabila query berubah dan menolak respons lapuk. | Reducer/export guards; Playwright 503 → Retry → berjaya dan failed filter. |
| S07 | P2 | Dibaiki. Scenario Type dihubungkan dengan SelectTrigger melalui Label/ID. | Unit SSR dan semakan browser label; tiada chaos sebenar dijalankan. |
| S08 | P2 | Dibaiki. Input bulan mengekalkan draf mentah; commit hanya nilai lengkap sah, atau normalisasi satu digit pada blur/Enter. | Unit dan Playwright menaip 01/09/10/11/12, paste, blur/Enter serta nilai tidak sah. |
| S09 | P2 | Dibaiki. Tiada padanan carian dibezakan daripada tiada nickname sebenar; tindakan kosongkan carian tersedia. | Unit empty/no-match dan browser clear-search. |
| S10 | P2 | Dibaiki. Amount/date/reference resit sedia ada mempunyai label visual kekal dan association ID yang sepadan. | SSR presentation/a11y, nilai/busy/removal asal dikekalkan. Tiada upload/scanner sebenar diuji. |
| S11 | P2 | Dibaiki. Loading, gagal mendapatkan columns dan empty sebenar dibezakan; Retry mengekalkan filter dan pilihan OR. | Unit dan Playwright 503 berulang sehingga Retry manual; 2 filter dan pilihan OR kekal. |
| S12 | P2 | **Ditangguhkan.** Checkbox Saved masih mengekalkan aliran inspect sedia ada. | Tiada perubahan tingkah laku; perlu kelulusan UX khusus. |
| S13 | P2 | Dibaiki. AI mengikuti mesej hanya ketika pembaca berhampiran bawah; scroll ke atas dikekalkan. “Ke mesej terkini” boleh dicapai keyboard tanpa mencuri fokus. | Unit helper dan Playwright kedua-dua permukaan, termasuk floating 375 px dan screenshot fokus. |
| S14 | P2 | Dibaiki. Reveal menggunakan elapsed-time chunk 40 ms dengan tempoh sasaran maksimum 2400 ms; reduced motion awal/perubahan langsung, cancel/session/timer ownership dikekalkan. | 42 ujian khusus/kontrak; 8 kes Playwright; 12 profil sebelum dan 12 selepas pada CPU 1×/4×/6×. Had 2400 ms bukan jaminan wall-clock pada CPU sibuk. |
| S15 | P1 | Dibaiki. Help Monitor ialah sibling disclosure, tiada nested button; klik bantuan tidak membuka/menutup panel induk. | SSR dan browser interaction, focus/aria-expanded. |
| S16 | P2 | Dibaiki. ID backup dipulihkan mengikut akaun dan sesi, wajib revalidate GET selepas remount; status gagal/unknown dan Retry jelas, respons POST lewat boleh dipulihkan; terminal notice tidak dimainkan berulang. | Unit scope/logout/late callback/storage; 2 kes Playwright meliputi remount/revalidation/503 Retry/late POST. Tiada backup sebenar dijalankan. |
| S17 | P2 | Dibaiki. Count/comparison Roles menggunakan effective draft yang sama seperti switch; label menjelaskan preview belum disimpan. | SSR grant/block/revert dan Playwright toggle/count/comparison tanpa PATCH permission. |
| S18 | P1 | Dibaiki. Foreground status Monitor menggunakan token semantik khusus yang cukup kontras dalam dua tema. | Unit matematik warna dan ukuran browser. Minimum status terpilih: 6.89:1 cerah / 7.82:1 gelap; amber 7.99–13.05:1. |
| S19 | P2 | Dibaiki. Forbidden embedded menggunakan container biasa; standalone mengekalkan main; tiada main#main-content pendua dalam protected shell. | SSR dan assertion browser tepat satu main/ID. |
| S20 | P1 | Dibaiki. Foreground/background CTA 403 cerah dan hover cukup kontras; warna gelap sedia ada dikekalkan. | Ukuran browser normal/hover: 5.36/6.15:1 cerah, 7.10/8.80:1 gelap. |
| S21 | P3 | **Ditangguhkan.** Single Active Tab mengekalkan pengecualian palet cerah yang disengajakan. | Tiada perubahan gate/tema; perlu kelulusan UX khusus. |
| S22 | P3 | Dibaiki. Hit area rail Landing menjadi 24 × 24 px tanpa menukar dash, anchor, navigasi atau animasi. | Source/detector dan ukuran bounding box serta keyboard browser. |
| S23 | P2 | Dibaiki. Ringkasan Maintenance berayat menggunakan satu lajur pada telefon dan typography/wrapping normal; dua lajur desktop dikekalkan. | 3 ujian SSR, Playwright dua tema pada lebar 320–1920 px dan CSS zoom 200%; screenshot 320/768/1366 dilihat. Metric wang/angka global tidak diubah. |

## Kaedah ujian dan batas

Semua runtime menggunakan sandbox WSL/bwrap SQR-Audit yang sedia ada: sumber/toolchain read-only, HTTP sintetik localhost, tiada rangkaian luar/production/DB, scratch terhad. Had kekal: CPU 100%, memori 768 MiB, swap 0, pids 128, tmpfs 256 MiB, fail 32 MiB, aggregate CPU 120 s / wall 180 s. Tiada dependency dimuat turun.

Loader TypeScript luar digunakan kerana binary esbuild Linux tidak tersedia. Oleh itu keputusan unit/shard di sini **bukan dakwaan bahawa arahan npm CI standard sudah lulus**. Build frontend Vite sebenar dalam sandbox lulus. Strict targeted TypeScript lulus, tetapi full client graph kehabisan heap 384 MB; ia bukan full typecheck pass. Had tidak dinaikkan untuk menjadikan hasil hijau.

Playwright menggunakan fixture dan respons rekaan. Tiada auth production dibypass, perubahan permission disimpan, backup/restore/import sebenar atau data pelanggan digunakan. Perubahan pemulihan job menguji state UI/ID yang sudah disediakan API, bukan penguatkuasaan backend.

## Bukti regresi terkini

- P1: 51 ujian unit/SSR unik; browser Daily/Import/Viewer/Search/Nicknames/Monitor/403/Audit dalam dua tema pada 320, 375, 768, 1024, 1366 dan 1920 px; screenshot/axe pada 375 dan 1366 px. Playwright Daily, Import dan Audit masing-masing 1 kes tindakan sebenar.
- P2: kumpulan 30 dan 24 ujian bertindih; fields/roles/month masing-masing 1 kes Playwright; Maintenance 2 kes dan Backup 2 kes. AI 42 ujian khusus/kontrak serta 8 kes Playwright. Jangan jumlahkan rerun sebagai ujian unik.
- Viewer AX terkini `3996a1d142da`; Settings Maintenance `d6966e3f54a0` (12 kes, 8 screenshot termasuk 320/768 px). Tiada overflow/pageerror/axe dalam kes ini.
- Build frontend terkini `f2c3fd4fe642` lulus selepas perubahan aplikasi terakhir. Strict targeted production types `edbb04b45e49` lulus; full graph `93ffe2d68e7c` dan graf UI lebih luas `5dcf334e3a34` mengalami heap OOM 384 MB. Tiada ralat TypeScript khusus dilaporkan sebelum OOM; keputusan ini tetap gagal, bukan typecheck pass.
- Regresi akhir menjalankan **523 fail client `.test.ts` / 2,586 ujian** dalam 12 shard: 2,583 lulus dan 3 kontrak lama gagal pada percubaan awal. JSDoc komponen baharu ditambah, penggunaan helper ARIA projek diselaraskan, dan kontrak tooltip dikemas kini untuk komponen InfoHint bersama. Rerun 21 kontrak berkaitan `216c6bc111ea` lulus semuanya. Lima ujian SSR tingkah laku Monitor/Search `3f484c667ddb` juga lulus. Ini bukan dakwaan rerun penuh 523 fail sekali lagi selepas pembetulan kecil.
- Lint semua fail client yang berubah/ditambah `e0230aa78b22` lulus. Empat kontrak JSON/storage/colors/spacing `e1b460fd45c3` lulus; tiada pengecualian atau threshold dilonggarkan.
- Kontrak cleanup timer lama gagal secara sah `40f61e0bdd8b`: ia menjangka assignment terus pada setInterval. Assertion kini turut menyemak local timer ID, assignment ref dan pembersihan timer miliknya. Ujian tingkah laku cancel/session/reduced-motion tetap dikekalkan.
- **Enam golden asal lulus:** Dashboard cerah `d1df4c7073fc`, gelap `50f34e455ae9`; borang Collection cerah `ef914b6054fe`, gelap `9cf3b22b41cf`; Settings cerah `bc854c7af1c5`, gelap `79b9cd099e1c`. Suite multi-route dibahagi kepada satu context bagi setiap route/tema untuk mengelakkan tekanan memori sandbox; assertion, baseline PNG dan threshold CI tidak dilonggarkan. Test Settings cerah lulus tetapi wrapper awal tersalah mewajibkan diff PNG yang tidak wujud selepas padanan berjaya; wrapper itu dibetulkan, bukan hasil visualnya.

## Paparan yang benar-benar dirender semasa pembaikan

Setiap baris matriks berikut mengandungi 12 kes: tema cerah dan gelap × lebar 320, 375, 768, 1024, 1366 dan 1920 px. Ini viewport Chromium sintetik dengan fontconfig Linux yang tersedia, bukan enam peranti fizikal. Screenshot/axe diambil pada 375 dan 1366 px; Settings turut pada 320 dan 768 px. Tiada overflow dokumen, pageerror atau pelanggaran axe yang disahkan dalam kes-kes tersebut. Beberapa rule axe masih `incomplete` (termasuk ARIA dan kontras tertentu); ia tidak dikira lulus secara automatik atau sebagai pensijilan WCAG.

| Paparan | Run ID terakhir yang relevan | Pengesahan tambahan |
|---|---|---|
| Collection Daily | `a94b29747d3f` | Draf, target dan background refresh; Playwright `ec941ca2c42a`. |
| Import | `081f31eea351` | Job dipulihkan dan Resume; Playwright `94fe09560050`. |
| Audit Logs | `ffb12bd3ed82` | Ralat/Retry/empty/reflow; Playwright `ca671106f879`. |
| Viewer | `3996a1d142da` | Struktur AX desktop dan virtualisasi. |
| General Search | `9bef0849fa64` | Tiga filter berlabel, AND/OR dan keyboard Space; columns failure/Retry melalui Playwright `bcf2971b172b`. |
| Manage Nickname | `dda734a2d459` | Kumpulan berisi, Enter/Space, no-match dan Clear. |
| System Monitor | `744c63f40ca6` | Help/disclosure, kontras, buka Chaos Lab/Scenario controls dan keyboard selector berlabel. **Tiada chaos dihantar.** |
| Forbidden 403 | `209845795068` | Satu main/ID, kontras CTA biasa dan hover. |
| Settings Maintenance | `d6966e3f54a0` | Teks berayat, screenshot tambahan; zoom melalui Playwright `194c19323ce3`. |
| Landing | `6bc414780d0f` | Lapan hit area 24 × 24 px tidak bertindih; Enter menuju hash dan fokus seksyen destinasi. |

Jumlah matriks ini ialah **120 pengukuran responsif, 44 screenshot dan 44 pemeriksaan axe**. Kes AI, Monthly Comparison, Roles dan Backup mempunyai ujian interaksi tersendiri; ia tidak digabungkan sebagai semua viewport dalam matriks ini. Metadata editor resit mempunyai regresi SSR khusus; jangan menganggapnya upload/scanner sebenar atau modal editor yang dirender dalam semua viewport.

Screenshot representatif yang diperiksa secara visual merangkumi Daily telefon/desktop, Nicknames 375 cerah/1366 gelap, Monitor 1366 cerah dengan selector dibuka, Maintenance 320 cerah/768 gelap/1366 cerah, AI full desktop/floating 375 gelap, dan Landing 1366 gelap. Semua 44 screenshot tersedia dalam artifak; tidak semua imej diperiksa secara manual. Bukti asal audit seluruh aplikasi kekal read-only; halaman yang tidak berubah tidak didakwa dirender semula dalam pusingan pembaikan ini.

Kegagalan harness yang dipisahkan daripada bug aplikasi: fixture GET retry yang terlalu awal berjaya, navigator offline dalam namespace terasing, locator launcher pada desktop, PNG attachment yang tidak disalin ke disk, keperluan diff PNG walaupun golden sepadan, dan assertion rail menjangka fokus anchor sedangkan navigasi asal memfokus destinasi. Percubaan gagal disimpan; hanya rerun yang sah digunakan sebagai bukti akhir. Tiada perubahan navigasi dibuat untuk memuaskan assertion yang salah.

## Prestasi sebelum dan selepas

Baseline beku `09253fb98bac`, selepas `15ac09c16e91`. Profil dua permukaan AI × 4000/20000 aksara × CPU 1×/4×/6×. Ini profiling Chromium sintetik, bukan FPS atau peranti fizikal. MutationObserver mengukur perubahan teks DOM, bukan React commits. Kes baseline yang tidak lengkap selepas 20 s ialah censored, bukan lulus completion dan bukan masa completion 20 s.

Full AI 4000 / CPU 1 selesai dalam 48,393 ms sebelum dan 3,107 ms selepas; perubahan teks 3,822 → 60, layout 3,824 → 62. Ini pengurangan sekitar 93.6% masa completion untuk pasangan itu. Sebelas baseline lain belum lengkap selepas 20 s; kesemua 12 profil selepas lengkap, teks tepat dan composer sedia. Animasi kekal berperingkat apabila reduced motion tidak diminta.

Long task masih wujud pada jawapan 20,000 aksara, khususnya floating pada CPU 4×; satu sampel mencapai 6,299 ms. Ini batas yang disahkan, bukan dakwaan semua frame mencapai 60 FPS atau semua low-spec bebas jank. Profil terhad tidak membuktikan semua kandungan Markdown/HTML sebenar mempunyai kos yang sama. Embedded AI tiada production callsite yang boleh diuji; ia tidak dimount secara palsu untuk menutup jurang coverage.

Jadual 12 pasangan lengkap, metrik asal, outcome censored dan ID bukti disertakan dalam `docs/ui-impeccable-verification.json`. Build profil `15ac09c16e91` mendahului penyelarasan helper ARIA dan komen JSDoc sahaja; algoritma AI yang diukur sama dengan build akhir `f2c3fd4fe642`.

## Audit akhir dan baki

| Bidang Impeccable | Asal | Baharu | Asas bukti dan sebab tidak diberi 4/4 |
|---|---:|---:|---|
| Aksesibiliti | 2/4 | 3/4 | Semantik Viewer, AND/OR, label, nested button, main dan kontras diperbaiki; ujian keyboard/AX/axe tersedia. Pembaca skrin sebenar dan semua rule axe incomplete belum diselesaikan. |
| Prestasi | 3/4 | 3/4 | Reveal AI jauh lebih singkat dan kemas kini DOM terhad, virtualisasi/lazy loading/animasi asal dikekalkan. Long task jawapan 20k masih disahkan; tiada bukti semua peranti fizikal bebas jank. |
| Tema | 3/4 | 3/4 | Kontras status Monitor dan 403 dibaiki dalam dua tema. Pengecualian tema S21 disengajakan dan belum diluluskan untuk diubah. |
| Responsif | 3/4 | 3/4 | Maintenance sempit dan rail diperbaiki, matriks 120 kes tanpa overflow serta zoom terpilih lulus. Semua sasaran sentuh dan gesture fizikal seluruh aplikasi belum disahkan. |
| Integriti implementasi | 2/4 | 3/4 | Draf, error/empty, job recovery dan preview kini konsisten; 21 pembaikan selamat mempunyai regresi. S12 masih keputusan UX, full typecheck/CI standard belum disahkan. |
| **Jumlah** | **13/20** | **15/20** | **Baik; peningkatan terbukti pada aksesibiliti dan ketepatan state.** |

Ini penilaian audit Impeccable berdasarkan skop dan bukti di atas, bukan skor Lighthouse, jaminan semua aliran bebas bug atau pensijilan WCAG. Tiada P0 atau P1 baharu disahkan dalam regresi pembaikan ini. Daripada 23 isu asal, baki sengaja ialah **S12 P2 dan S21 P3**. Risiko long task AI dicatat sebagai batas prestasi yang masih perlu diprofil pada kandungan/peranti sebenar, bukan disembunyikan oleh skor.

Detector akhir melaporkan 12 advisory reka bentuk yang sudah wujud (antaranya Inter, grid, border dan animasi landing), bukan 12 bug baharu. Arahan scope/identiti visual mengatasi cadangan generik. Tiada alasan menukar logo/palet/navigasi, memadam animasi berfungsi atau mengubah S21 berdasarkan detector semata-mata.

Baki yang disengajakan: keputusan UX S12/S21; full client typecheck dan pipeline npm standard dalam CI; browser fizikal/Firefox/Safari, pembaca skrin sebenar, sentuhan fizikal dan produksi tidak disahkan dalam kerja ini. Pelan release selamat: semak diff frontend, jalankan CI standard, semak dua tema dan aliran kritikal staging, kemudian deploy melalui arahan berasingan pengguna.

Halangan cakera telah dikendalikan tanpa memadam data aplikasi: pengguna memadam profil ujian lama secara manual; reclaim blok kosong WSL dan compact VHD audit digunakan. ENOSPC sempat menghalang salinan metadata; summary asal Linux dipulihkan dan keputusan OOM dilaporkan. Fail sumber perubahan tidak kosong dan tiada tracked application deletion. Tiada commit, push atau deploy dibuat dalam tugasan ini.

## Rujukan sumber tepat

| ID | Fail utama |
|---|---|
| S01 | [client/src/pages/collection/collection-daily-mutation-guard.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/collection/collection-daily-mutation-guard.ts:2) |
| S02 | [client/src/pages/collection-nicknames/GroupListPanel.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/collection-nicknames/GroupListPanel.tsx:98) |
| S03 | [client/src/pages/import/single-import-workflow.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/import/single-import-workflow.ts:1) |
| S04 | [client/src/pages/viewer/ViewerVirtualizedTable.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/viewer/ViewerVirtualizedTable.tsx:53) |
| S05 | [client/src/pages/general-search/GeneralSearchAdvancedControls.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/general-search/GeneralSearchAdvancedControls.tsx:61) |
| S06 | [client/src/pages/audit-logs/audit-logs-read-state.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/audit-logs/audit-logs-read-state.ts:5) |
| S07 | [client/src/components/monitor/MonitorChaosControls.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/monitor/MonitorChaosControls.tsx:43) |
| S08 | [client/src/pages/collection-summary/collection-month-field-utils.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/collection-summary/collection-month-field-utils.ts:3) |
| S09 | [client/src/pages/collection-nicknames/NicknameAssignmentTable.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/collection-nicknames/NicknameAssignmentTable.tsx:90) |
| S10 | [client/src/pages/collection/CollectionReceiptPanel.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/collection/CollectionReceiptPanel.tsx:219) |
| S11 | [client/src/pages/general-search/GeneralSearchAdvancedControls.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/general-search/GeneralSearchAdvancedControls.tsx:53) |
| S12 | [client/src/pages/saved/SavedImportCard.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/saved/SavedImportCard.tsx:36) |
| S13 | [client/src/hooks/useAIMessageFollow.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/hooks/useAIMessageFollow.ts:11) |
| S14 | [client/src/lib/ai-response-reveal.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/lib/ai-response-reveal.ts:1) |
| S15 | [client/src/components/monitor/MonitorMetricsSection.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/monitor/MonitorMetricsSection.tsx:21) |
| S16 | [client/src/pages/backup-restore/useBackupJobRecovery.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/backup-restore/useBackupJobRecovery.ts:22) |
| S17 | [client/src/pages/settings/SettingsRoleSections.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/settings/SettingsRoleSections.tsx:42) |
| S18 | [client/src/styles/tokens/colors/_semantic.css](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/styles/tokens/colors/_semantic.css:7) |
| S19 | [client/src/pages/Forbidden.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/Forbidden.tsx:5) |
| S20 | [client/src/styles/tokens/colors/_state-pages.css](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/styles/tokens/colors/_state-pages.css:118) |
| S21 | [client/src/components/auth/SingleActiveTabGate.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/auth/SingleActiveTabGate.tsx:121) |
| S22 | [client/src/pages/landing-next/landing-next.css](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/landing-next/landing-next.css:99) |
| S23 | [client/src/pages/settings/MaintenanceSettingsNotice.css](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/settings/MaintenanceSettingsNotice.css:1) |

Inventori semua fail yang berubah/ditambah: [ui-impeccable-changed-files.txt](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/docs/ui-impeccable-changed-files.txt). Bukti mesin, hash sumber dan 12 pasangan profil: [ui-impeccable-verification.json](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/docs/ui-impeccable-verification.json).
