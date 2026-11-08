# Kelancaran jawapan AI panjang — laporan pengesahan

8 November 2026. Pembetulan frontend lokal selesai. Asas Git d51edd99, branch codex/visual-layout-repair. Skop ini ialah cadangan nombor1 yang diluluskan; kemasan ruang chat terdahulu dikekalkan.

## Punca yang disahkan

Key perenggan dan senarai berasal daripada hash seluruh kandungan. Apabila prefix jawapan bertambah, React menggantikan blok dan baris/item yang sudah kelihatan. Sebelum edit aplikasi, ujian browser merah0cd68adf8d0d mengukur15 penggantian perenggan dan13 senarai; kod sudah stabil. Profil diagnosis awal turut menunjukkan kerja layout berulang. Diagnosis ini dipisahkan daripada perbandingan prestasi v3 di bawah.

Pembetulan di AIMessage menggunakan slot struktur mengikut jenis dan skop induk. Perenggan/baris/item yang sedang muncul mengekalkan nod DOM; kandungan berulang mempunyai slot unik. Map bersifat lokal per render, tanpa cache persisten. Tiada perubahan pada sanitizer DOMPurify, parser Markdown, interval40ms, had reveal2400ms, CSS, animasi, tema, API, sesi, permission atau navigasi.

## Fail yang berubah dalam skop ini

- `client/src/components/AIMessage.tsx`: identiti struktur untuk blok/baris/item, membuang hash kandungan yang berubah setiap prefix.
- `client/src/components/floating-ai-a11y-contract.test.ts`: kontrak tandatangan factory diselaraskan; tuntutan sanitizer, region kod dan semantik dikekalkan.
- `tests/visual/ai-reading-polish.spec.ts`: dua regresi identiti DOM full/floating ditambah. Perubahan feedback queue daripada task space-polish terdahulu dikekalkan.
- Dokumen laporan, handoff dan manifest pengesahan `ui-ai-chat-response-performance-*`.

Perbandingan checksum binaan sebelum/selepas mengesahkan **AIMessage.tsx sahaja** berbeza sebagai kod aplikasi dalam skop baharu; fail ujian dilaporkan berasingan. Tiada fail backend, database, konfigurasi dependency atau aset diubah.

## Perbandingan prestasi sepadan

Binaan sebelum: receipt-adaptive-build-2e514a2ae3d2. Selepas: receipt-adaptive-build-20ff4df5f6db. Jawapan sintetik20000 aksara, viewport1366x900/cerah, fixture dan instrumentasi v3 sama. Full6 menggunakan dua pasangan dengan susunan ABBA; baris lain satu pasangan. Nombor full6 ialah median setiap binaan, termasuk median P95 setiap run.

| Permukaan / CPU simulasi | Masa siap sebelum → selepas (ms) | Jumlah long task sebelum → selepas (ms) | Kerja main thread sebelum → selepas (ms) | P95 input selepas completion sebelum → selepas (ms) |
|---|---:|---:|---:|---:|
| full/6/multiline-prose | 5008 → 4701.5 | 2297.5 → 1859 | 5013.8 → 4558.8 | 580.5 → 294.5 |
| full/4/multiline-prose | 4083 → 4266 | 1740 → 1368 | 4181 → 4026.3 | 108 → 114 |
| floating/1/spaced-prose | 3101 → 2746 | 63 → 0 | 1337.8 → 1066.8 | 19 → 17 |
| floating/6/multiline-prose | 5464 → 5183 | 2457 → 1801 | 5467.1 → 5358.4 | 336 → 393 |

Pada full CPU6, jumlah long task turun kira-kira19.1% dan kerja main thread9.1%. Semua lima profil selepas mempunyai sifar penggantian perenggan ketika reveal; kemas kini berpindah kepada characterData. Kedua-dua regresi struktur juga mengesahkan sifar penggantian perenggan, senarai, baris pertama, item pertama dan code ketika prefix bertambah.

**Hasil bercampur turut dikekalkan:** full CPU4 siap183ms lebih lambat (+4.5%) pada satu pasangan walaupun long task dan kerja CPU berkurang; P95 input108→114ms. Floating CPU6 mempunyai P95 input336→393ms (+17.0%) pada satu pasangan walaupun rendering jawapan lebih ringan. Data ini tidak membuktikan semua interaksi menjadi lebih pantas. Jangan menganggap variasi tersebut pasti noise; perlukan sampel/hardware tambahan sebelum membuat tuntutan menyeluruh. Tiada had kelulusan atau tempoh animasi dilonggarkan.

## Keputusan ujian

- 35/35 ujian unit/SSR/kontrak lulus: format, sanitizer, Unicode, lifecycle reveal, scroll follow, retry manual, JSDoc dan persembahan ruang.
- Lint3 fail dan TypeScript terfokus3 fail lulus; binaan production frontend lulus.
- 20/20 Playwright lulus: dua regresi struktur baharu, dua reading/fokus sedia ada,14 kes retry/stop/session, dua evidence/geometry.
- 10/10 profil runtime selesai dengan jawapan tepat, composer sedia, satu POST, tiada error fixture/request tak dijangka dan bacaan scroll atas dikekalkan.
- Enam screenshot akhir: empty/queue/reading pada full cerah1366 dan floating gelap375. Kesemua enam fail JPEG mempunyai hash SHA256 tepat sama dengan capture task space-polish daripada binaan sebelum; rupa dalam captures tersebut tidak berubah. Root turut memeriksa paparan reading sebelum/selepas dan queue selepas.
- 2014 checksum fail client sepadan binaan selepas; hash setiap artifact unit/browser/profile disahkan. Manifest terperinci menyimpan runID dan data mentah.

Ujian struktur menggunakan perf_mode low dengan prefers-reduced-motion no-preference selepas fixture; jadi animasi asal benar-benar berjalan. Kandungan akhir diuji secara tepat termasuk perenggan/item/kod berulang, leading zeroes, emoji, tag/atribut berbahaya yang ditapis, draf dan tindakan jump.

## Had yang perlu dikekalkan

- Profil menggunakan Chromium headless sintetik, GPU dimatikan, cerah1366x900 dan perf_mode high dengan simulasi CPU1/4/6.
- Ujian kestabilan DOM berasingan menggunakan perf_mode low, full cerah1366 dan floating gelap375, animasi diaktifkan.
- Overhead observer/profiler disertakan pada kedua-dua binaan; kiraan penggantian DOM bukan React commits.
- Pemasa siap merangkumi persediaan/click; ia tidak mengasingkan latency rangkaian atau server.
- Proxy keyboard dipercayai→selepas frame diukur selepas completion; ia bukan INP atau latency input semasa reveal.
- Sampel pasangan kecil dan bersifat deskriptif; tiada jaminan peranti fizikal, production, AI sebenar atau keseluruhan CI.
- Composer sememangnya disabled semasa pemprosesan/reveal mengikut fungsi asal. Fungsi itu dikekalkan; tiada tuntutan latency menaip semasa disabled.
- Fallback embedded tanpa callsite produksi, Safari/Firefox, pembaca skrin sebenar, full-project TypeScript dan keseluruhan CI tidak diuji dalam skop ini.
- Tiada commit/push/deploy dilakukan oleh task ini. Production masih berasingan daripada perubahan lokal.

Bukti: [manifest pengesahan](ui-ai-chat-response-performance-verification.json). [Handoff](ui-ai-chat-response-performance-handoff.md).

## Screenshot akhir

![Chat selepas pembetulan](C:\Users\Administrator\security-audit-skill\sumbanganqueryrahmah\ui-layout-20261105/evidence/receipt-adaptive-tests-161cbf436124/ai-space-full-light-1366-reading.jpg)

![Chat selepas pembetulan](C:\Users\Administrator\security-audit-skill\sumbanganqueryrahmah\ui-layout-20261105/evidence/receipt-adaptive-tests-fb2c5445db5d/ai-space-floating-dark-375-reading.jpg)
