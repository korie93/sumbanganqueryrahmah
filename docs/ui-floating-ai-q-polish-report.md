# Floating AI — polish Q, hover dan notifikasi

7 November 2026. **Skop frontend selesai dan disahkan di lokal.** Binaan sebelum: receipt-adaptive-build-d299f82aac3b; selepas: receipt-adaptive-build-0688cdabf611. Asas Git: 3ead9194552b3b9f581e69f0ea69effe7def0b1a. Laporan ini menggantikan status visual awal dalam ui-floating-ai-q-report.md; bukti lama kekal sebagai sejarah binaan d299.

## Hasil

- Q asal dibesarkan32→36px pada telefon dan32→40px desktop, tanpa bulatan latar, border atau shadow. Aset asal tidak dilukis semula atau diwarnakan semula.
- Hover/fokus membesarkan artwork bersama count kepada1.1× melalui transform220ms. Kawasan klik48/56px kekal stabil, tidak menolak layout. Hover hanya pada pointer yang menyokongnya; keyboard tetap mempunyai fokus.
- Mengikut pilihan user yang disahkan, kiraan **sentiasa kelihatan semasa ada unread**. Kumpulan titik fade kepada badge biru di sudut asalnya melalui opacity/transform180ms; titik kembali setelah dibaca. Cap99+ dikekalkan. Counter terakhir disimpan hanya untuk fade keluar supaya tiada0 yang berkelip.
- Reduced motion menggunakan perubahan statik. Cabang low-spec masih mempunyai transform/opacity ringkas ini, tanpa timer animasi JS, library atau efek tambahan.
- Fallback/Suspense dan reduced-motion menggunakan body PNG asli ketika unread, kemudian full PNG apabila read. Jika body tidak tersedia, full PNG menjadi fallback keselamatan. Badge turut bebas daripada cabang loading. Count dibaca melalui description ID pada butang; tiada live-region berulang bagi setiap frame.

## Perbandingan render

Tangkapan baharu dibuat dalam run audit ini, pada375×900 dan1366×900, dua tema, serta tiga keadaan: idle, unread1 dan projection99+. Projection hanya menguji pembungkusan teks pada komponen sebenar; ia tidak mencipta100 permintaan atau rekod backend.

| Langkah | Sebelum | Selepas dan pengesahan |
| --- | --- | --- |
|1. Idle | Q32 agak kecil | Q36/40, telus dan proporsi asli. |
|2. Unread | Badge merah kelihatan terpisah di atas kanan | Count biru bertoken menggantikan titik; badan Q kekal jelas. |
|3. Count lebar |99+ jauh daripada mark |99+ kekal terbaca, tidak clipped atau menutup badan Q. |
|4. Hover/fokus dan read | Tiada pertukaran titik kepada count | Grow220ms dan crossfade180ms, state kembali kepada titik; target tidak berubah saiz. |

Before:46c2e12be512 (cerah),8141ad2aaf0f (gelap). After:receipt-adaptive-tests-b80fcf93cbad (cerah),1862d6d1a537 (gelap). Root dan reviewer bebas membandingkan1/99+ pada kedua-dua tema, termasuk crop telefon/desktop. Ada12 screenshot before dan12 after, dengan path/hash dalam manifest. Tiada P0/P1/P2 visual berbaki ditemui dalam skop kawalan yang diperiksa; ini bukan audit seluruh SQR.

## Ujian

| Semakan | Keputusan |
| --- | --- |
| Unit/SSR/kontrak |35/35 lulus |
| Lint dan TypeScript terfokus | Lulus untuk fail TS/TSX berubah dan spec akhir |
| Build frontend | receipt-adaptive-build-0688cdabf611, lulus |
| Playwright |21/21:4 composition,4 motion/geometry,2 fallback,7 launcher,1 cascade,3 sidebar roles |
| Strict CSP |12/12 kes,0 error/CSP violation |
| Axe automatik |6/6 paparan,0 violation dalam skop |
| Provenance |2013 checksum fail client sepadan binaan; setiap spec runtime akhir dipadankan dengan sumber semasa |
| Detector dan whitespace | Impeccable lima fail UI:[]/exit0; git diff --check lulus |

Browser mengesahkan latar rgba(0,0,0,0), border0px, shadow none, hover0.22s serta dot/badge0.18s dalam high/low-spec, dan0s dalam reduced motion. Gerakan/timeline dan hover enlargement diuji dengan CPU4×/6×. Teks count mempunyai contrast≥4.5:1. Ujian piksel menggunakan artwork alpha≥32 dan margin1.5px, bukan kotak PNG yang turut mengandungi ruang telus.

Ujian99+ mula-mula menemui27 sampel badan Q dalam margin. Kedudukan dinaikkan2px dan assertion0 overlap dikekalkan. Satu prasyarat fixture sidebar juga dibetulkan: browser loopback melaporkan navigator.onLine=false lalu guard client menolak fetch sesi Collection sebelum HTTP mock. Corak online-init yang sudah digunakan oleh sidebar-icon-motion.spec.ts diterapkan hanya pada test; fresh native probe=false, fixture=true dan ketiga-tiga role admin/user/superuser lulus dengan assertion asal. Auth, permission dan server tidak diubah.

## Fail dan batas

Perubahan UI: FloatingAITrigger.tsx, FloatingAI.module.css, SidebarAnimatedQ.tsx/.css, serta prop offset pada AIIconTooltip.tsx daripada kemasan awal. Sidebar menerima dotsHidden pilihan, defaultfalse; pilihan/permission/navigasi sidebar asal kekal. Ring thinking bulat yang sudah tidak digunakan dibersihkan.

Ujian: floating-ai-launcher.spec.ts, floating-ai-motion-cascade.spec.ts, sidebar-animated-q.spec.ts, navbar-a11y-contract.test.ts dan floating-ai-a11y-contract.test.ts. Butang/handler/API sesi, request dedup, Loader, minimize/Escape, unread reset, fail/retry chunk, favicon dan sidebar preferences diuji semula.

Semua target dijalankan bersiri dalam sandbox WSL bwrap asal: CPU100%, memory768MiB/high704MiB/swap0, pids128, CPU120s/wall180s. Tiada dependency dimuat turun atau threshold dilonggarkan. Tiada backend, database, permission, navigation structure, aset brand atau data production diubah. Rendering ialah Chromium lokal/data sintetik, bukan Browser Codex atau hardware fizikal; tiada dakwaan FPS60, Safari/Firefox, screen-reader speech sebenar, full WCAG atau CI penuh. Tiada commit/push/deploy untuk polish ini.

Manifest: [ui-floating-ai-q-polish-verification.json](./ui-floating-ai-q-polish-verification.json).
