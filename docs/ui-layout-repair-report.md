# Pembaikan visual layout SQR — laporan pengesahan

6 November 2026 pada 5:59 PG MYT · Branch `codex/visual-layout-repair` · Asas `25d86794765be568444aac76836a64601a4e7fab`

13 pembaikan layout dilaksanakan dan disemak melalui rendering sebenar, termasuk saiz tulisan, susunan metrik, popup kalendar, sticky toolbar dan kandungan yang terlindung oleh launcher AI. Navigasi, Q asal, palet neutral, lebar khusus tugas, backend, formula Collection, database dan permission dikekalkan. Tiada dependency baharu. Tiada commit, push atau deploy dibuat.

Spesifikasi: [SQR Visual Layout Repair](C:/Users/Administrator/Downloads/SQR_Visual_Layout_Repair_Impeccable_Codex.md). Pelaksanaan menggunakan Impeccable `layout → adapt → polish → audit`, dengan konteks incumbent dan semakan reka bentuk automatik. Hasil detector digunakan bersama pemeriksaan gambar serta interaksi sebenar.

## Pembaikan dan bukti

ID Lxx ialah tracker kerja layout ini; keutamaan S01–S23 audit terdahulu dikekalkan.

| ID | Paparan / keadaan | Punca dan hasil yang disahkan |
|---|---|---|
| L01 | Shared OperationalSectionCard; Save, Daily, Settings, Nickname, Analysis, Activity | Margin 6px bertindih dengan gap 16px; wrapper badge kosong meninggalkan 22px. Header kini menggunakan satu aturan jarak dan wrapper kosong tersembunyi. Consumer biasa dan snapshot sedia ada diperiksa. |
| L02 | Role & Permission selepas scroll; 320/375/768/1366, dua tema | Toolbar sticky berada di belakang topbar. Offset berdasarkan token tinggi topbar: y12/overlap45px → y68/overlap0. Carian dan keyboard kekal berfungsi. |
| L03 | Create Billing OSP Target; 320px, dua tema | Tajuk menyentuh Close. Padding kanan header setempat dan jajaran kiri memberikan ruang kepada tajuk penuh. Dialog/scroll/footer diperiksa pada telefon dan desktop. |
| L04 | Shell halaman pendek dalam tema gelap | Override min-height menambah tinggi topbar dua kali. Main Nickname Summary kini 844px pada viewport900px dalam kedua-dua tema; tambahan scroll56px dibuang. Warna tema dikekalkan. |
| L06 | Nickname Summary mobile; 320/375 | Heading berulang dibuang, Filter/Reset membalut tanpa memotong label dan mempunyai min-height44px. Semua tindakan dan kandungan dipelihara. |
| L07 | DatePickerField dan Calendar | Popup336px melebihi viewport320; pusat weekday/tarikh menyimpang4–52px. Grid tujuh lajur kini sepadan; popup304px pada x8–312 dan drift0. Pemilihan tarikh serta consumer yang diketahui diuji. |
| L08 | AI Chat | Tajuk30px/gutter24px mobile berbeza daripada skala operasi. Kini tajuk24px mobile/28px desktop, gutter16px/24px menggunakan token sedia ada. |
| L09 | Nickname Summary populated; nickname60aksara, RM48,750.00 | Badge inline-flex tidak membalut perkataan panjang. `overflow-wrap:anywhere` setempat memelihara nama penuh. Metrik satu lajur mobile memberikan ruang kepada jumlah tanpa pecahan digit. Enam kes320/375/1366 dua tema lulus. |
| L10 | Nickname Summary Sheet; keyboard | Fokus tidak kembali selepas Escape kerana pencetus bukan SheetTrigger. Primitive asal kini mengurus hubungan trigger dan Sheet. Empat regresi fokus lulus. |
| L11 | Backup desktop toolbar | Export/Refresh w-full memaksa tiga baris. `sm:w-auto` setempat menyusun tiga butang sebaris di desktop; grid dua butang + Create penuh dikekalkan pada telefon. |
| L12 | Backup tarikh/status | Nilai berbentuk ayat menggunakan saiz metrik angka20px. Tarikh/status sahaja kini16px dan line-height normal; saiz angka lain kekal. Sebelum/selepas diperiksa pada375/1366 kedua tema. |
| L13 | Launcher AI; lapan keluarga route, termasuk Nickname Summary | Idle dan selepas minimize boleh menutup wang, kiraan atau tindakan. Guard terhad pada route yang terbukti bermasalah; marker nilai/label, callback kesiapan, observer sedia ada dan passive captured scroll mengemas kini kedudukan. Calon koordinat mendatar dibatasi12. Label bulan Summary dilindungi tanpa menganggap ruang kosong seluruh lajur sebagai teks; klik label membuka dialog dan Escape diuji. Wang, bilangan rekod dan nama kini jelas dalam keadaan ujian. |
| L16 | Grand Total Amount Summary; RM11,917,851.84 | Dua metrik berkongsi ruang terlalu sempit sehingga nombor terbelah pada320/375. CSS setempat menetapkan satu lajur di bawah640px, dua lajur mulai640px. Nilai dan saiz tulisan asal kekal; jumlah besar kini satu baris pada320/375/768/1366 kedua tema. |

L05 disiasat dan tidak menghasilkan defect rendered khusus yang mewajarkan penyeragaman lebar. L14/L15 ialah perlindungan regresi Save/Saved: sidebar terbuka/tertutup, scroll, fokus, popup tarikh dan selepas minimize. S12 Saved selection UX serta S21 tema Single Active Tab kekal ditangguhkan. S23 Maintenance sudah dibaiki pada commit asas; ia dipelihara dan dirender semula, bukan dikira sebagai pembaikan baharu.

### Pasangan gambar sepadan

- **L01 Shared card spacing**: [sebelum](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-feca8ba7e47f/collection-save-full-light-375.jpg) → [selepas](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-befa3362566c/collection-save-full-light-375.jpg); [sumber](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/layout/OperationalPage.tsx:138).
- **L02 Sticky Role toolbar**: [sebelum](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-06d24434589e/admin-roles-scrolled-light-375.jpg) → [selepas](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-15034e136362/admin-roles-scrolled-light-375.jpg); [sumber](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/settings/SettingsRoleSections.tsx:301).
- **L03 OSP dialog Close**: [sebelum](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-3be95c54d214/collection-billing-create-light-375.jpg) → [selepas](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-c48bca6ec27c/collection-billing-create-light-375.jpg); [sumber](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/collection/BillingPrincipalSavedTargetDialog.tsx:265).
- **L04 Dark shell height**: [sebelum](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-feca8ba7e47f/collection-nickname-summary-light-375.jpg) → [selepas](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-516c479dec77/collection-nickname-summary-light-375.jpg); [sumber](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/styles/theme/dark.base.css:33).
- **L06 Nickname mobile hierarchy**: [sebelum](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-feca8ba7e47f/collection-nickname-summary-light-375.jpg) → [selepas](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-516c479dec77/collection-nickname-summary-light-375.jpg); [sumber](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/collection/CollectionNicknameSummaryMobileFilters.tsx:45).
- **L07 Calendar width/alignment**: [sebelum](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-5137f6af6a1f/collection-calendar-light-375.jpg) → [selepas](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-516c479dec77/collection-calendar-light-375.jpg); [sumber](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/ui/calendar.css:2).
- **L08 AI typography/gutter**: [sebelum](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-6c93a2a49157/data-ai-light-375.jpg) → [selepas](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-5d10b33ab4f8/data-ai-light-375.jpg); [sumber](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/AI.tsx:65).
- **L09 Unbroken nickname**: [sebelum](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-765f8b4b9ba0/collection-nickname-unbroken-light-375.jpg) → [selepas](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-f3e6db07a8c0/collection-nickname-unbroken-light-375.jpg); [sumber](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/collection-nickname-summary/CollectionNicknameBatchSections.tsx:83).
- **L11 Backup toolbar**: [sebelum](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-2c009216e08c/admin-backup-light-375.jpg) → [selepas](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-1c92728cd3e8/admin-backup-light-375.jpg); [sumber](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/backup-restore/BackupRestoreHeader.tsx:68).
- **L12 Backup prose size**: [sebelum](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-2c009216e08c/admin-backup-light-375.jpg) → [selepas](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-1c92728cd3e8/admin-backup-light-375.jpg); [sumber](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/BackupRestore.tsx:113).
- **L16 Large Summary grand total**: [sebelum](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-f5f6d66a97f3/idle-summary-totals-light-375-cpu1-low.jpg) → [selepas](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-1d26b1ae80d9/idle-summary-totals-light-375-cpu1-low.jpg); [sumber](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/collection-summary/CollectionSummaryTotals.css:2).
- **L13-Summary Records beside AI**: [sebelum](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-eab9d9b597e5/idle-summary-light-375-cpu1-low.jpg) → [selepas](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-1d26b1ae80d9/idle-summary-light-375-cpu1-low.jpg); [sumber](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/collection-summary/CollectionSummaryTable.tsx:57).
- **L13-Nickname Nickname TOTAL beside AI**: [sebelum](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-8a54c26f0408/collection-nickname-unbroken-dark-1366.jpg) → [selepas](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-f3e6db07a8c0/collection-nickname-unbroken-dark-1366.jpg); [sumber](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/collection-nickname-summary/CollectionNicknameBatchSections.tsx:58).
- **L13-Home Home time beside AI**: [sebelum](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-db2c0c646d18/idle-home-light-375-cpu1-low.jpg) → [selepas](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-e99fc8b9db71/idle-home-light-375-cpu1-low.jpg); [sumber](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/HomeSections.tsx:1).
- **L13-OSP OSP financial values**: [sebelum](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-b4e7037258ff/idle-osp-client-light-375-cpu1-low.jpg) → [selepas](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-350e154184e8/idle-osp-client-light-375-cpu1-low.jpg); [sumber](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/collection/BillingPrincipalSavedTargetWorkspace.tsx:1).
- **L13-Activity Activity actions beside AI**: [sebelum](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-5a592680ca2e/idle-activity-light-375-cpu1-low.jpg) → [selepas](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-002ed9433c1e/idle-activity-light-375-cpu1-low.jpg); [sumber](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/activity/ActivityRowActions.tsx:1).
- **L13-403 403 primary actions**: [sebelum](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-c6a048735bb8/idle-forbidden-light-375-cpu1-low.jpg) → [selepas](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-075e0d78fac6/idle-forbidden-light-375-cpu1-low.jpg); [sumber](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/Forbidden.tsx:1).

L10 dibuktikan oleh log keyboard/fokus, bukan screenshot statik: kegagalan sebelum `3d02bcd93f1c` dan run mobile terkini dalam manifest. Pasangan Nickname TOTAL menggunakan frame standard1366px pada kedudukan awal yang sama. Capture band kewangan mobile ialah bukti selepas tambahan; interaksi serta koordinat disertakan pada bukti runtime.

## Liputan rendering dan interaksi

Lebar biasa: **320, 375, 768, 1024, 1366, 1920 CSS px**, tema cerah/gelap. Semakan piksel utama375/1366; tambahan320/768 pada dialog, kalendar dan Role toolbar. Manifest membezakan rendering, ukuran automatik, screenshot dan semakan piksel. Binaan perantaraan kekal dilabel dengan sumber serta ID masing-masing; hasilnya tidak dilabel semula sebagai run binaan akhir.

| Kumpulan | Paparan yang dirender dan diperiksa |
|---|---|
| Collection | Save, Records, Summary, Monthly Comparison, Daily, Manage Nickname, Nickname Summary idle/populated/nama panjang/chart, OSP kosong/populated/Create/System/Client. |
| Data | Home, General Search, Import idle/recovery, Saved/Configure Source, Viewer biasa dan padat43lajur/200rekod, AI Chat. |
| Insights | Dashboard Login, Activity/Retention, Monitor, Analysis Quality/Compare, Audit error→retry→empty. |
| Settings | General/Maintenance, Roles, Account Management dengan nama panjang, Backup sintetik, Account, Security. |
| Public / overlay | Landing, Login, Forgot, Reset, Activation,404, Banned, Maintenance,403, Change Password, Single Active Tab, Receipt Preview portrait dan Edit Collection/date popup. |

Interaksi termasuk sidebar expand/collapse, Escape/fokus Sheet, carian Role, Apply filter, pemilihan tarikh, popup bersarang dalam Edit, dialog butiran bulan, retry Audit, Export menu Backup tanpa memuat turun backup, dan launcher idle→aktif→minimize→navigasi SPA. Tiada upload/import/customer mutation/backup sebenar atau servis AI luaran.

Viewer desktop mengekalkan virtualisasi23baris yang dirender untuk dataset200rekod, skrol dalaman7908px dan scrollX dokumen0; mobile mengekalkan kad. Tepi jadual OSP System/Client diperiksa pada375/1366 kedua tema. Capture hujung skrol mendatar sengaja menunjukkan sebahagian lajur awal di luar scrollport; ini bukan clipping dokumen. Enam belas capture tepi OSP ialah bukti selepas sahaja kerana tiada pasangan sebelum sepadan.

Role fixture utama ialah superuser; Receipt, Monthly dan ujian nickname menggunakan admin. Preview permission bukan ujian login setiap role atau penguatkuasaan permission backend. Tidak setiap modal, loading state, menu kecil dan kombinasi role/data diuji.

## Keputusan ujian

| Semakan | Bukti | Keputusan |
|---|---|---|
| Build Vite | receipt-adaptive-build-89757acd3c0c | PASS |
| ESLint changed TS/TSX + visual specs | receipt-adaptive-tests-5f5bdb2308ad | PASS |
| AI/layout/Nickname/Summary unit group (overlapping groups noted) | receipt-adaptive-tests-dd1166b85303 | PASS · 72 kes |
| Final Summary unit group | receipt-adaptive-tests-441c534585d5 | PASS · 7 kes |
| Focused TypeScript final Summary/Table/test | receipt-adaptive-tests-d86ab382ad93 | PASS |
| Focused TypeScript visibility/Nickname/visual spec | receipt-adaptive-tests-4bb018a746d3 | PASS |
| Focused TypeScript DOM helper/floating visual spec | receipt-adaptive-tests-4d538a787adf | PASS |
| Page layout regression group (includes Summary) | receipt-adaptive-tests-a2c407c01d99 | PASS · 44 kes |
| Base component/theme group (includes Nickname) | receipt-adaptive-tests-99d57bd39fd3 | PASS · 12 kes |
| Layout/OSP lifecycle/math group (contains older layout tests) | receipt-adaptive-tests-8f5d488c4915 | PASS · 35 kes |
| Role toolbar | receipt-adaptive-tests-fa59962328fe | PASS · 4 kes |
| Nickname mobile/focus | receipt-adaptive-tests-42cfe933faef | PASS · 4 kes |
| Calendar selection | receipt-adaptive-tests-dd695e0f626c | PASS · 4 kes |
| Backup actions/prose | receipt-adaptive-tests-8d64acb0ac4c | PASS · 4 kes |
| Nickname long/AI | receipt-adaptive-tests-f54b440a85d8 | PASS · 6 kes |
| Existing launcher regressions | receipt-adaptive-tests-6f0ce201eb8b | PASS · 7 kes |
| Home idle launcher geometry | receipt-adaptive-tests-e931560abf3c | PASS · 4 kes |
| Save launcher/sidebar controls | receipt-adaptive-tests-c281ec55bc27 | PASS · 4 kes |
| Saved filters/focus/date popup | receipt-adaptive-tests-584a22533d2c | PASS · 2 kes |
| Sidebar animation low-spec CPU4/6 | receipt-adaptive-tests-85805b96b735 | PASS · 2 kes |
| Final CI light golden snapshots | receipt-adaptive-tests-d42063dac04e | PASS · 3 kes |
| Final CI dark golden snapshots | receipt-adaptive-tests-8bf1eb1e6480 | PASS · 3 kes |
| Official bundle budgets | receipt-adaptive-tests-ca9041dbc65a | PASS |

Runtime lapan keluarga route dan profilCPU disimpan berasingan dalam manifest. Snapshot akhir light/dark masing-masing3kes.

Binaan akhir: `receipt-adaptive-build-89757acd3c0c`. Katalog sumber autoritatif: [receipt-adaptive-build-89757acd3c0c-source.json](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/receipt-adaptive-build-89757acd3c0c-source.json), SHA-256 `38e9fe7f9df44b7ffa13291cf9b51b323f02d2551dd9bd610ef391c1c1acc95d`. **1424 fail aplikasi/config sepadan dengan workspace semasa.** Metadata `sourceManifestSha256` lama dalam receipt pengawal diketepikan kerana merujuk manifest terdahulu; ia tidak digunakan sebagai bukti sumber akhir.

ESLint meliputi fail TS/TSX yang diubah serta spec layout. TypeScript fokus menggunakan pilihan compiler root dan deklarasi sebenar projek, tanpa stub; ia tidak memeriksa semua badan fail transitive atau keseluruhan projek. Suite unit berkaitan turut merangkumi kad/layout, tema neutral, halaman dan formula/lifecycle OSP. Kumpulan bertindih tidak dijumlahkan sebagai ujian unik.

Snapshot, budget dan ambang axe tidak dilonggarkan; golden tidak diubah. Assert SSR yang memeriksa string kelas dua kolum Summary digantikan dengan semakan browser bahawa jumlah besar benar-benar muat. Kontrak nilai/label/format mata wang dikekalkan dalam ujian unit.

Animasi hover sidebar berjalan pada mod low-spec dengan CPU4×/6× dan `no-preference`, tanpa loop semasa idle; native action/keyboard diuji. Home/OSP lulus CPU4×/6× low dan CPU1 high dalam kedua tema. Pada12sampel senyap600ms: rAF/timeout penempatan, perubahan kedudukan dan LayoutCount semuanya0. Selepas navigasi sebenar, observer/RAF/interval/captured-scroll/ready-listener khusus guard kembali0; listener generik runtime sedia ada kekal. Ini bukti fungsi/kerja berulang, bukan ukuran FPS atau jaminan RAM Chrome.

## Polish, audit dan batas

Jajaran, urutan baca, ruang header/kandungan, skala tajuk, pembalutan nama/wang, label/dialog dan keseragaman dua tema diperiksa melalui gambar. Identiti SQR, lebar khusus form/report/content dan skrol dalaman jadual dikekalkan. Tiada background biru gelap/glass atau animasi dekoratif baharu diperkenalkan.

Skor audit sejarah **13/20 tidak diganti**. Lima dimensi penuh audit terdahulu belum diuji semula dengan skop yang setara. Bukti pembaikan yang dilaporkan ialah ukuran layout serta interaksi di atas; tiada kenaikan skor direka.

- Axe tidak menemui violation automatik dalam batch lulus yang disenaraikan. Hasil `incomplete`, termasuk pemeriksaan contrast tertentu, bukan sijil WCAG seluruh sistem.
- Browser zoom sebenar200%, Safari/Firefox, peranti fizikal dan screen reader manual belum disahkan. CSS zoom200% pada Home sahaja diuji.
- Semua rendering menggunakan Chromium terasing dengan data sintetik; tiada dakwaan pengesahan production atau semua permission/data sebenar.
- Typecheck keseluruhan graf dan pipeline CI penuh belum dijalankan untuk worktree ini kerana had memori lokal. Semakan fokus dan enam snapshot baseline sebenar disertakan; CI penuh diperlukan selepas commit/push yang dibenarkan.
- Dialog ConfigureTargets legacy tiada consumer aktif yang ditemui dan tidak dipaksa mount. Monitor1366 cerah pada batch terdahulu berada pada Active Alerts; ia tidak digunakan sebagai pasangan header sebelum/selepas.

Baki kecil yang dilihat, mengikut keutamaan:

1. **P3** Backup375: launcher boleh menyentuh chevron Search & Filters; label/tindakan keseluruhan masih tersedia. [Bukti](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-1c92728cd3e8/admin-backup-dark-375.jpg).
2. **P3** OSP375 pada sesetengah kedudukan skrol: sebahagian ayat panduan kalendar berada di belakang launcher; nilai jadual, header dan input jelas. [Bukti OSP](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-c48bca6ec27c/collection-billing-table-b-end-dark-375.jpg).
3. **P3** Home375: launcher boleh menyentuh ikon pulse dekoratif; nama/tarikh/angka telah dilindungi. Analysis Compare mempunyai placeholder “Not available” yang membalut perkataan dalam lajur sempit; minimum lebar lajur boleh dipertimbangkan dalam polish seterusnya. [Home](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-48ce5cbcc0be/idle-home-light-375-cpu4-low.jpg), [Analysis](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-1c92728cd3e8/admin-analysis-compare-dark-1366.jpg).

Shield dekoratif Banned yang menyentuh tepi atas ialah suspek visual yang belum disahkan memberi kesan kepada pengguna. Ia tidak dilabel sebagai pembaikan selesai atau defect P1/P2.

## Fail berubah dan sambungan

34 fail aplikasi dan 9 fail ujian. Tiada perubahan server/shared/package/lockfile/workflow/snapshot.

Aplikasi:

- [client/src/components/FloatingAI.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/FloatingAI.tsx)
- [client/src/components/FloatingAIIdleLauncher.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/FloatingAIIdleLauncher.tsx)
- [client/src/components/floating-ai-dom-utils.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/floating-ai-dom-utils.ts)
- [client/src/components/floating-ai-layout.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/floating-ai-layout.ts)
- [client/src/components/floating-ai-visibility.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/floating-ai-visibility.ts)
- [client/src/components/layout/OperationalPage.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/layout/OperationalPage.tsx)
- [client/src/components/ui/calendar.css](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/ui/calendar.css)
- [client/src/components/ui/calendar.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/ui/calendar.tsx)
- [client/src/components/ui/date-picker-field.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/ui/date-picker-field.tsx)
- [client/src/components/useFloatingAILayoutState.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/useFloatingAILayoutState.ts)
- [client/src/pages/AI.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/AI.tsx)
- [client/src/pages/BackupRestore.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/BackupRestore.tsx)
- [client/src/pages/Forbidden.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/Forbidden.tsx)
- [client/src/pages/HomeSections.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/HomeSections.tsx)
- [client/src/pages/activity/ActivityLogsTable.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/activity/ActivityLogsTable.tsx)
- [client/src/pages/activity/ActivityMobileLogsList.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/activity/ActivityMobileLogsList.tsx)
- [client/src/pages/activity/ActivityRowActions.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/activity/ActivityRowActions.tsx)
- [client/src/pages/backup-restore/BackupRestoreHeader.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/backup-restore/BackupRestoreHeader.tsx)
- [client/src/pages/collection-nickname-summary/CollectionNicknameBatchSections.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/collection-nickname-summary/CollectionNicknameBatchSections.tsx)
- [client/src/pages/collection-summary/CollectionSummaryTable.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/collection-summary/CollectionSummaryTable.tsx)
- [client/src/pages/collection-summary/CollectionSummaryTotals.css](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/collection-summary/CollectionSummaryTotals.css)
- [client/src/pages/collection-summary/CollectionSummaryTotals.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/collection-summary/CollectionSummaryTotals.tsx)
- [client/src/pages/collection/BillingPrincipalSavedTargetDialog.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/collection/BillingPrincipalSavedTargetDialog.tsx)
- [client/src/pages/collection/BillingPrincipalSavedTargetWorkspace.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/collection/BillingPrincipalSavedTargetWorkspace.tsx)
- [client/src/pages/collection/CollectionNicknameSummaryMobileFilters.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/collection/CollectionNicknameSummaryMobileFilters.tsx)
- [client/src/pages/collection/CollectionNicknameSummaryPage.css](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/collection/CollectionNicknameSummaryPage.css)
- [client/src/pages/collection/CollectionNicknameSummaryPage.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/collection/CollectionNicknameSummaryPage.tsx)
- [client/src/pages/collection/CollectionSummaryPage.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/collection/CollectionSummaryPage.tsx)
- [client/src/pages/dashboard/DashboardDeferredSections.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/dashboard/DashboardDeferredSections.tsx)
- [client/src/pages/dashboard/DashboardLoginReviewSidebar.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/dashboard/DashboardLoginReviewSidebar.tsx)
- [client/src/pages/dashboard/DashboardSummaryCards.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/dashboard/DashboardSummaryCards.tsx)
- [client/src/pages/import/SingleImportPanel.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/import/SingleImportPanel.tsx)
- [client/src/pages/settings/SettingsRoleSections.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/settings/SettingsRoleSections.tsx)
- [client/src/styles/theme/dark.base.css](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/styles/theme/dark.base.css)

Ujian:

- [client/src/components/floating-ai-dom-utils.test.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/floating-ai-dom-utils.test.ts)
- [client/src/components/floating-ai-idle-launcher.contract.test.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/floating-ai-idle-launcher.contract.test.ts)
- [client/src/components/floating-ai-layout.test.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/floating-ai-layout.test.ts)
- [client/src/components/floating-ai-visibility.test.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/floating-ai-visibility.test.ts)
- [client/src/components/useFloatingAILayoutState.contract.test.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/useFloatingAILayoutState.contract.test.ts)
- [client/src/pages/collection-summary/CollectionSummaryPresentation.test.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/collection-summary/CollectionSummaryPresentation.test.tsx)
- [tests/visual/floating-ai-launcher.spec.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/tests/visual/floating-ai-launcher.spec.ts)
- [tests/visual/layout-repair.spec.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/tests/visual/layout-repair.spec.ts)
- [tests/visual/sidebar-icon-motion.spec.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/tests/visual/sidebar-icon-motion.spec.ts)

[Bukti mesin dan fingerprint](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/docs/ui-layout-repair-verification.json) · [Tracker](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/docs/ui-layout-repair-issues.md) · [Handoff](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/docs/ui-layout-repair-handoff.md).
