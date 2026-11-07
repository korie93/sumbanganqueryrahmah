# AI chat SQR — composer rujukan dan polish bacaan

Tarikh: 7 November 2026. **Pelaksanaan dan QA frontend bagi skop ini selesai.** Terdapat isyarat long-task dalam profil CPU 6× yang belum dibuktikan puncanya; butiran dan batasnya dilaporkan di bawah. Tiada dakwaan kelancaran sempurna atau peningkatan prestasi statistik dibuat.

Asas Git: a1d577a26ec09e42a9eadd665880e1c13c32568d, branch codex/visual-layout-repair. Binaan sebelum polish: receipt-adaptive-build-1620df963bb5. Binaan akhir: **receipt-adaptive-build-20722597505e**. Tiada commit, push atau deploy dalam task ini. Perubahan composer/retry daripada goal terdahulu dikekalkan dalam working tree.

## Hasil implementasi

| Keperluan | Perubahan dan lokasi |
| --- | --- |
| Composer mengikut gambar user | Input bermula satu baris dan membesar hingga lima; radius24px, padding10×16px, font16px, placeholder “Taip mesej...”. Tinggi46→142→46px. AIChat.tsx:78 dan AIConversationCard.tsx:80 menggunakan helper auto-grow sedia ada. |
| Simbol hantar di luar kotak | Ikon berisi26px, butang lutsinar dan sejajar bawah dengan gap8px; sasaran tindakan44px desktop/48px mobile. Stop masih ikon petak. AIChat.tsx:181, AIConversationCard.tsx:224, ai.css:463. |
| Jarak blok jawapan | Senarai→senarai dan kod→kod mendapat jarak0.75rem, konsisten dengan pasangan lain; ai.css:155. Font, semantik dan sanitizer dikekalkan. |
| Ruang bacaan desktop | Flex menggunakan baki tinggi shell pada lebar≥1024px/tinggi≥600px; log boleh mengecil, jawapan kosong/ringkas kekal intrinsik; ai.css:302. Pada notis queued/slow, document boleh memanjang supaya log tidak runtuh; AI.tsx:68 dan ai.css:344. |
| Tooltip ikon | Hover dan fokus keyboard pada Send/Stop, Retry, Sembang Baharu, Mesej Terkini, Minimize dan launcher. AIIconTooltip.tsx:23 menggunakan primitive Radix sedia ada. Adapter pada baris15 menggabungkan description status launcher dan tooltip pada satu native button. |
| Makluman aksesibiliti | Satu status polite/atomic bernama “Status AI SQR”; helper tidak menerima streamingText dan IDLE kekal senyap. AIChatStatusAnnouncement.tsx:12/25; kedua-dua log menggunakan aria-busy sewaktu pemprosesan/reveal. |

Palet cerah/gelap SQR, lebar bacaan65ch, body16px/line-height1.6, navigasi, shortcut, auto-follow, manual retry, draf, Stop dan sanitization dikekalkan. Tiada height animation, timer, dependency atau aset/logo baharu ditambah. Tiada Copy, teks “AI idle” atau label kekal pada butang ikon ditambah semula. Tiada backend, API, database, permission atau rekod production diubah.

## Bukti visual dan ukuran sebelum/selepas

Sumber visual ialah C:/Users/Administrator/Downloads/1000331072.jpg (kosong) dan 1000331073.jpg (multiline). Gambar tidak menyatakan DPR/viewport CSS; perbandingan menilai bentuk, jajaran dan hubungan ruang, bukan padanan piksel1:1. Implementasi mengekalkan font SQR16px dan token tema.

Lapan varian composer penuh/floating ×cerah/gelap ×375/1366px lulus. Root melihat rujukan bersama crop akhir full/light1366 dan floating/dark375; tambahan full/light375, full/dark1366 dan floating/light375 turut diperiksa. Crop multiline akhir menggunakan tepat lima baris pendek. Teks melebihi lima baris diuji berasingan untuk wrap, caret dan native scrolling; tiada scroll hack digunakan bagi mencantikkan screenshot.

| Viewport, kedua-dua tema | Sebelum: log panjang | Selepas: log panjang | Selepas: log dengan draf5baris |
| --- | ---: | ---: | ---: |
| 1366×900 | 448px | 569px | 425px |
| 1920×1080 | 448px | 749px | 605px |

Log kosong20px dan jawapan ringkas115px kekal dalam kedua-dua binaan. Input kosong66px sebelum steering menjadi46px seperti rujukan. Ukuran panjang di atas ialah keadaan auto-follow di hujung tanpa draf; screenshot panjang kemudian berada di atas dengan butang Latest kelihatan, maka jangan samakan dua keadaan itu. Card bawah877/1057px dan input bawah860/1040px kekal dalam viewport900/1080px.

Pasangan screenshot full-view yang diperiksa secara visual pada viewport/tema/kandungan/scroll padanan:

- Cerah1366: receipt-adaptive-tests-6a1506e9215d → receipt-adaptive-tests-030acb2886d3.
- Gelap1920: receipt-adaptive-tests-005e32ad5ccd → receipt-adaptive-tests-bf872d4d4ff3.
- Composer cerah/full1366: receipt-adaptive-tests-cf6e2f7ae60b/ai-reference-full-light-1366-empty.jpg dan -multiline.jpg.
- Composer gelap/floating375: receipt-adaptive-tests-53f7e65f0354/ai-reference-floating-dark-375-empty.jpg dan -multiline.jpg.

Artefak semua resit berada di **C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/**. Bukti QA visual terperinci berada dalam design-qa.md. Tiada P0/P1/P2 visual berbaki ditemui dalam skop composer yang dirender; ini bukan audit seluruh SQR.

## Kecacatan yang disahkan dan dibetulkan

Pada1024×600, notis queued+slow, Latest dan draf retry lima baris serentak menyebabkan flex percubaan awal mengecilkan log kepada5px (RED36c1c7ef8af4). Fallback document-scroll apabila notis hadir memulihkan224px pada checkpoint (GREEN1529fbc93e7f). Ujian crowded diulang pada binaan akhir2072, resit6e312d964b90, lulus dengan draf dan kawalan kekal; assertion minimum bacaan tidak dilonggarkan.

Satu kegagalan fixture tinggi450px disebabkan scroll caret native meninggalkan beza0.09375px; test kini memfokus dan scrollIntoView ke tengah secara eksplisit, tanpa menaikkan toleransi. Array.at dalam spec diganti akses indeks biasa supaya sesuai dengan library TS projek, tanpa ubah tsconfig.

## Keputusan ujian

| Semakan | Bukti akhir |
| --- | --- |
| Unit/SSR/kontrak AI +CSS | **170/170 lulus,0 gagal**, receipt-adaptive-tests-bb5319d17903. |
| Lint27 fail TS/TSX berubah | Lulus, c5ab101af6c4; spec akhir e1cd2452a124. |
| TypeScript semantik terfokus27 fail | Lulus,39cdc763bdd7; spec akhir91ddf022bdae. Bukan typecheck penuh projek. |
| Build frontend | Lulus, receipt-adaptive-build-20722597505e. |
| Regresi Playwright | **54/54 lulus**: reference8, behavior12, status2, extremes6, crowded1, evidence4, compact2, motion/reading4, composer/retry8, launcher7. |
| Strict CSP dan wrap | **24/24 kes**,0 ralat/CSP violation; teks720aksara tanpa ruang membalut dalam kotak dan boleh scroll menegak. Full bc863789b82b, floating19b4203b4310. |
| Axe automatik | **12/12 paparan**,0 violation dalam skop yang diuji. |
| Source/provenance | 2013 checksum fail client sepadan build akhir; katalog setiap run dipadankan dengan sumber runtime dan spec akhir. Manifest JSON disertakan. |
| Git/layout detector | git diff --check lulus; detector AIChat/AIConversationCard/ai.css mengembalikan[]/exit0. Detector tidak menggantikan screenshot. |

Lebar yang diuji:320,375,768,1024,1366,1920px. Kedua-dua tema, halaman AI penuh dan panel floating, keyboard/fokus/hover, Send/Stop/retry, pemeliharaan draf, error/queued/slow, empty/short/long, reduced-motion, CPU4×/6×, tinggi450/600px dan text-scale200% diliputi oleh ujian terfokus. Composer embedded berkongsi komponen sumber tetapi **tiada callsite production semasa untuk dirender**; jangan dakwa pengesahan embedded runtime.

Semua target projek, compiler, ujian dan Chromium berjalan bersiri dalam bwrap WSL SQR-Audit. Had asal CPU100%, memory768MiB/high704MiB/swap0, pids128, CPU120s/wall180s dikekalkan. Tiada download/install atau threshold dilonggarkan. Metadata rosak daripada environment restart terdahulu tidak digunakan sebagai bukti; matriks akhir lengkap dan disahkan secara berasingan.

## Profil CPU6×: hasil dan batas

Full1366×900, jawapan sintetik4,000aksara, animasi normal; setiap run mesti memaparkan teks tepat, composer kembali sedia dan hanya satu POST. **Semua8 run berjaya tanpa ralat.** Pasangan pertama3410→3776ms lebih lambat selepas perubahan; ia dikekalkan dalam manifest, bukan dibuang. Tiga pasangan ulangan kemudian3494→3387ms,3323→3280ms dan3492→3393ms.

| Median tiga ulangan | Sebelum | Selepas |
| --- | ---: | ---: |
| Teks pertama | 821ms | 794ms |
| Jawapan lengkap +composer sedia | 3492ms | 3387ms |
| CDP TaskDuration | 3.263s | 3.095s |
| Jumlah masa long-task | 1286ms | 1584ms |

Masa siap dan TaskDuration tidak menunjukkan kemerosotan konsisten; julat masa siap3323–3494ms vs3280–3393ms bertindih. **Namun jumlah masa long-task meningkat dalam keempat-empat pasangan**, median ulangan+23.2%. Ini isyarat blocking yang perlu dipantau, bukan bukti bahawa semua interaksi lebih smooth. LayoutDuration median turun1.094→0.986s dan tiada punca kausal khusus diasingkan. Oleh itu sumber yang telah lulus QA dikekalkan; tiada optimasi spekulatif atau perubahan animasi dibuat semata-mata untuk skor.

Jika prestasi hardware sebenar masih mengganggu, langkah seterusnya ialah trace browser yang mengaitkan input latency/long-task kepada callback tertentu, kemudian pembetulan terfokus dan perbandingan semula. CPU throttling dalam satu sandbox juga dipengaruhi penjadualan; ia bukan jaminan prestasi semua low-spec, medium-spec atau high-spec. Skop permintaan UI selesai dengan batas prestasi ini didedahkan, bukan dakwaan “tiada regresi langsung”.

## Fail dan batas skop

Sebelas fail client berubah berbanding binaan sebelum polish:

- client/src/components/AIChat.tsx
- client/src/components/AIChatStatusAnnouncement.tsx
- client/src/components/AIIconTooltip.tsx
- client/src/components/AIJumpToLatestButton.tsx
- client/src/components/FloatingAIPanel.tsx
- client/src/components/FloatingAITrigger.tsx
- client/src/components/ai-chat-presentation-a11y.test.ts
- client/src/components/floating-ai-a11y-contract.test.ts
- client/src/pages/AI.tsx
- client/src/pages/ai/AIConversationCard.tsx
- client/src/styles/ai.css

Ujian browser: tests/visual/ai-reading-polish.spec.ts baharu; ai-compact-layout.spec.ts dan ai-composer-polish.spec.ts mengikut tooltip serta minimum satu baris. AIMessage/executor/state/retry/auto-grow helper yang turut kelihatan dalam git diff berasal daripada goal terdahulu dan dikekalkan; perubahan ini tidak menggantikan logiknya.

Browser Codex tidak berjaya dimulakan sebelum ini; semua dakwaan render datang daripada Chromium lokal. Tiada target Figma atau canvas MagicPath aktif dipilih, maka tiada reka bentuk luar diubah. Safari/Firefox, zoom browser fizikal dan output suara pembaca skrin sebenar belum diuji. Ujian axe/DOM bukan pensijilan WCAG. Backend, sesi sebenar, servis AI sebenar dan production tidak diakses. Typecheck penuh serta keseluruhan pipeline CI masih perlu dijalankan dalam persekitaran CI biasa.

Manifest: [ui-ai-chat-reading-polish-verification.json](./ui-ai-chat-reading-polish-verification.json). Handoff: [ui-ai-chat-reading-polish-handoff.md](./ui-ai-chat-reading-polish-handoff.md).
