# Floating AI — logo Q transparen

Tarikh: 7 November 2026. Status: **implementasi dan QA skop selesai di lokal**. Asas Git: 3ead9194552b3b9f581e69f0ea69effe7def0b1a; binaan akhir: receipt-adaptive-build-d299f82aac3b.

Butang floating AI kini menggunakan Q asal bersama titik, tanpa bulatan, latar, border atau shadow. Kawasan klik kekal48px pada telefon dan56px desktop; artwork32px. Loader semasa muat runtime, label ARIA, tooltip, ref, keyboard, status minimized, retry runtime dan badge unread dikekalkan. Ring bulatan semasa thinking tidak lagi dipasang mengikut arahan tanpa circle.

Komponen SidebarAnimatedQ sedia ada dimuat secara lazy dan berkongsi chunk/aset sidebar. Fallback menggunakan /brand/sidebar-q-static.png yang telus, termasuk jika chunk atau lapisan gagal. Aset boxed sqr-q-mark-dark.png tidak digunakan. Animasi titik/kilauan asal menggunakan transform/opacity, berhenti apabila tersembunyi, dan bertukar kepada Q statik untuk prefers-reduced-motion. Tiada redraw, recoloring, library, dependency atau timer animasi baharu.

Badge unread dikecilkan secara menegak kepada16px dan diletakkan di atas artwork supaya titik Q tidak tertutup. Tooltip launcher menggunakan offset16px untuk mengelakkan pertindihan badge ketika fokus; offset tooltip lain kekal4px. Ujian memastikan jarak sekurang-kurangnya2px antara badge dengan artwork, serta tiada overlap tooltip/badge. Fungsi kiraan termasuk cap99+ tidak diubah; runtime render baru meliputi unread1.

## Fail berubah

- client/src/components/FloatingAITrigger.tsx — Q lazy/fallback, butang telus, badge dan offset tooltip.
- client/src/components/FloatingAI.module.css — override token hanya untuk launcher: transparent, foreground tema, tiada shadow.
- client/src/components/AIIconTooltip.tsx — prop sideOffset pilihan; default4px asal dikekalkan.
- tests/visual/floating-ai-launcher.spec.ts — empat kes cerah/gelap pada375/1366px, fallback chunk/layer, animasi sebenar, low-spec, reduced motion, no-circle, unread dan tooltip clearance.

## Bukti pengesahan

| Semakan | Keputusan |
| --- | --- |
| Unit/SSR/kontrak berkaitan | 35/35 lulus,0 gagal |
| Lint dan TypeScript terfokus | Lulus pada tiga fail TS/TSX berubah |
| Build frontend | receipt-adaptive-build-d299f82aac3b, lulus |
| Playwright | 13/13 lulus: empat varian Q, dua fallback, tujuh regresi launcher sedia ada |
| Strict CSP | 12/12 kes,0 error/CSP violation |
| Axe automatik | 6/6 paparan,0 violation dalam skop ujian |
| Detector Impeccable | Tiga fail UI:[]/exit0; bukan pengganti pemeriksaan render |
| Provenance | 2013 checksum fail client sepadan binaan akhir; spec dan setiap run runtime sepadan |

Browser mengukur background rgba(0,0,0,0), border0px dan shadow none dalam kedua-dua tema. Gerakan CSS disahkan melalui kemajuan animation time pada CPU4× desktop dan6× telefon dengan low-spec; reduced-motion menghasilkan artwork statik dan0 animation. Tiada permintaan AI atau muat panel runtime disebabkan animasi sahaja. Regresi keyboard Enter/Space/Escape, sentuhan pertama, dedup loading, kegagalan/retry chunk, navigasi semasa load dan jawapan semasa minimized masih lulus.

Percubaan awal fixture tersilap menetapkan no-preference sebelum helper yang memaksa reduce; urutannya dibetulkan selepas punca disahkan, tanpa mengubah animasi aplikasi. Batch percubaan itu mencapai had CPU asal; QA akhir dipecahkan kepada empat kumpulan kecil dengan had per-job yang sama. Collector awal juga meminta gambar tema yang tidak berada dalam kumpulan; allowlist kini khusus kumpulan. Tiada threshold, cap atau assertion penerimaan dilonggarkan. Resit percubaan ini tidak dihitung sebagai keputusan akhir.

Screenshot akhir lapan fail (normal/unread ×cerah/gelap ×375/1366) disimpan bersama hash dalam [manifest](./ui-floating-ai-q-verification.json). Semakan visual membandingkan Q asal dengan hasil yang dirender; tiada bulatan/box kekal, herotan atau pertindihan badge yang dilihat dalam keadaan diuji. Aset brand dan semua backend, API, data, permission, navigasi serta dependencies tidak diubah.

Semua target/compiler/Chromium berjalan bersiri dalam sandbox WSL bwrap sedia ada: CPU100%, memory768MiB/high704MiB/swap0, pids128, CPU120s/wall180s, tanpa network luar atau data production. Browser Codex tidak disambungkan ke runtime berasingan ini; MagicPath mengembalikan Unknown tool. Bukti render ialah Chromium lokal yang diluluskan, bukan preview MagicPath. Tiada dakwaan FPS/hardware fizikal, semua browser, actual screen-reader speech atau keseluruhan CI. Tiada commit/push/deploy untuk perubahan ini.
