# AI Chat — bold asas dan pemulihan kedudukan bacaan

9 November 2026. **Implementasi dan QA terpilih selesai. Typecheck seluruh projek masih perlu CI.** Asas Git f5a17b5253b140b45f4d54e4d67c07b82281daaa, branch codex/visual-layout-repair. Pengguna meminta commit dan push selepas QA ini; rujuk Git log dan remote untuk status penerbitan. Kod ini belum dideploy semasa laporan disediakan.

## Hasil

- Jawapan AI menyokong **teks tebal** daripada marker Markdown berpasangan pada satu baris. Teks pengguna dan kod kekal literal. Sanitizer asal masih digunakan sebelum elemen React strong dibina; tiada HTML mentah atau dependency Markdown baharu.
- Floating chat memulihkan tempat bacaan selepas minimize/reopen, termasuk apabila jawapan selesai semasa panel tersembunyi. Panel idle masih unmount. Satu bookmark kecil dalam memori menyimpan ID mesej dan offset, tanpa teks, DOM atau localStorage.
- Reset membatalkan bookmark lama melalui generation. Provider ditetapkan semula mengikut identiti akaun sedia ada supaya bookmark tidak merentas akaun.
- Empat pembaikan terdahulu dikekalkan: Stop menyimpan prefix yang sudah dipaparkan sekali sahaja; native selection menjeda follow; pengesahan reset hanya untuk draf/AI aktif; pengumuman had aksara pada band 200/50/0.

Tema, logo, navigasi, permission, backend, database, API, dependency, sanitizer dan CSS global tidak diubah. Animasi sedia ada dikekalkan. Simpanan draf merentas minimize dan label Dihentikan tidak ditambah.

## Punca dan perbandingan

| Perkara | Sebelum | Selepas yang disahkan |
| --- | --- | --- |
| Bold | Parser tidak membina strong; marker dipaparkan literal | Lima strong semantik dalam setiap lapan kombinasi full/floating, cerah/gelap, 375/1366px; weight 700 berbanding 400, warna diwarisi |
| Reopen idle | State scroll berada dalam hook yang dibuang ketika panel unmount; baseline menunjukkan lompatan 620px | Desktop CPU4×: RECORD-079 kekal offset 59.53125px; telefon gelap CPU6×: RECORD-076 kekal 38.78125px. Perbezaan 0px |
| Selesai ketika tersembunyi | Kedudukan bacaan perlu bertahan selepas active panel akhirnya idle/unmount | Offset 59.53125px kekal; dua permintaan dan dua jawapan tepat, tiada pendua |
| Reveal | Teks yang sedang bertambah memerlukan identiti nod stabil | Strong, span, perenggan dan native selection KUTIPAN kekal semasa respons masih busy dan bertambah lebih 200 aksara |

Baseline sah: bold fd83ccc3ae22, bookmark 5e9d6ee0aa48. Semua data ujian sintetik; ini bukan ukuran rekod production.

## Ujian akhir

Receipt berawalan receipt-adaptive-tests-, kecuali build yang berawalan receipt-adaptive-build-. Semua receipt akhir dalam jadual mempunyai exit 0, budgetFailure null dan tiada artifak wajib hilang.

| Semakan | Keputusan | Suffix receipt |
| --- | --- | --- |
| Unit/SSR/kontrak AI | 123/123 | 5b6d237e738a |
| Kontrak context + ulang sembilan bold | 11/11; jumlah unik bersama larian di atas 125 | a8f26715f2e1 |
| Lint akhir semua 34 fail berubah | Lulus | b602f6723acb |
| TypeScript semantik terfokus 33 fail | Lulus; AuthenticatedAppShell dikecualikan | 3e4cad3e0315 |
| Frontend Vite build | Lulus, 27.981s | 9a73086d2958 |
| CSP react-remove-scroll hashes | Lulus, had/CSP kekal | 2c55e49b22c8 |
| Kontrak visual | 10/10 | b9df29f6f787 |
| Bundle budgets pada build 9a | Lulus, threshold kekal | d2ccda537051 |

19 fail aplikasi yang berubah dibandingkan melalui SHA-256 dengan manifest input build 9a dan larian unit 123: semuanya sepadan. Perubahan selepas build hanya pada fixture ujian dan dokumentasi.

### 12 kes browser baharu

| Kes | Suffix receipt |
| --- | --- |
| Bold full/light/1366 | 93717932f375 |
| Bold full/light/375 | f582ae429ccb |
| Bold full/dark/1366 | b2861c72e815 |
| Bold full/dark/375 | 0c330a4eeb4d |
| Bold floating/light/1366 | fdc00457ea3c |
| Bold floating/light/375 | e59a8fe27e1d |
| Bold floating/dark/1366 | 5a2e036590ca |
| Bold floating/dark/375 | d593538b6935 |
| Bookmark light/1366/CPU4× | e5552157d7ea |
| Bookmark dark/375/CPU6× | 3f9eab247ee3 |
| Reveal full/light/1366 | 568fb69770aa |
| Respons selesai semasa tersembunyi, CPU4× | df66b8e2597f |

### 24 kes regresi pada build yang sama

| Kumpulan | Kes lulus | Suffix receipt |
| --- | ---: | --- |
| Stop full | 1 | 7a01cd6b18d9 |
| Native selection floating, fixture akhir | 1 | b187708d9bf9 |
| Reset floating, dua tema + viewport transition | 3 | cb31006b6a73 |
| Pengumuman had aksara full | 1 | c76d21dc49cc |
| Keyboard, scroll, rotation, safe inset, composer, desktop | 8 | fb315a0a8b72 |
| Unread cap/reset respons lewat | 2 | 35238ec669f0 |
| Feedback full | 4 | 13f5fe71510c |
| Feedback floating | 4 | 222f827f7d23 |

Jumlah **36 kes browser unik**. Pengulangan selection 1b107311e7e2 tidak dikira semula. Pengesahan akhir b187708d9bf9 menguji guard Event yang telah ditaip dengan betul.

## Paparan yang benar-benar diperiksa

Halaman /ai dan floating AI pada /viewer dirender dengan API sintetik. Lapan screenshot bold, meliputi kedua-dua surface, kedua-dua tema dan 375/1366px, telah dilihat. Empat screenshot bookmark sebelum/selepas pada viewport matching turut dilihat: jumlah 12 screenshot selepas pembaikan. Baseline full/light/1366 juga dilihat.

Tiada limpahan baharu ditemui pada gambar yang diperiksa. Senarai, kod, nombor akaun/rujukan dan hierarki warna kekal. Focus ring dan tooltip yang kelihatan ialah keadaan interaksi. Ujian keyboard tambahan meliputi viewport 320×640, 375×844, 844×390 dan desktop, termasuk band visual viewport sintetik yang lebih pendek; ini bukan ujian papan kekunci telefon fizikal.

## Pembetulan fixture, dibezakan daripada aplikasi

- 1bfdc212751e gagal kerana koordinat RECORD diukur ketika live-follow masih bergerak; double-click sebenar memilih perkataan lain. Fixture kini membaca perkataan tepat di bawah native mousedown kedua, membuktikan follow masih aktif, kemudian membandingkan selection dengan perkataan event-time itu. Tiada selection/state/scroll disuntik. Pertambahan teks, status busy, selection kekal dan had gerakan 2px dikekalkan. Larian akhir memilih jawapan; scrollTop 3470 kekal 3470.
- ef59faed383a gagal pada Escape selepas hanya menunggu dialog visible. Source Radix memasang autofocus/layer dalam passive effects; visible sahaja belum membuktikan pemilikan keyboard. Fixture akhir menunggu Batal mendapat fokus secara semula jadi, tanpa sleep atau paksa focus. Diagnostik capture/bubble pada cb31006b6a73 mengesahkan Escape dimiliki dialog dalaman, dialog ditutup, panel kekal visible, draf dan fokus trigger dipulihkan. Ini tidak membuktikan punca tunggal kegagalan lama; tiada kecacatan aplikasi baharu disahkan daripada larian itu.
- 0ba0044e3ddd menemui jenis listener MouseEvent yang tidak serasi dengan EventListener pada union Element fixture. Parameter ditukar kepada Event dengan guard instanceof MouseEvent. Lint, semantik 33 fail dan runtime selection akhir lulus.
- Dua percubaan reveal awal gagal pada persediaan koordinat sebelum selection. Fixture akhir menjajarkan teks dengan native wheel dan mengambil snapshot busy/growth/identity/selection secara atomik. Assertion dan threshold tidak dibuang.
- Receipt ee66e9183f77 kosong akibat ENOSPC dan tidak dikira. Percubaan penuh 34 fail a404cec4fa25 kehabisan heap 384MB dan tidak dikira lulus.

## Fail

Root semua laluan ialah C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah.

| Kumpulan | Fail |
| --- | --- |
| Bold | client/src/components/AIMessage.tsx; client/src/components/ai-message-bold.test.ts |
| Bookmark | client/src/hooks/ai-reading-bookmark.ts dan .test.ts; client/src/hooks/useAIMessageFollow.ts |
| Integrasi | client/src/components/AIChat.tsx; FloatingAIPanel.tsx; useAIChatState.ts; useAIChatExternalEffects.ts; client/src/context/AIContext.tsx dan .contract.test.ts; client/src/app/AuthenticatedAppShell.tsx; client/src/pages/ai/AIConversationCard.tsx; client/src/pages/change-password-abort-controller.contract.test.ts |
| Empat kawalan terdahulu | AIQueryLimit.tsx; AIResetConfirmation.tsx; ai-chat-stop-response.ts dan .test.ts; ai-query-limit-announcement.test.ts; ai-message-selection-guard.ts dan .test.ts; floating-ai-accessibility.ts dan .test.ts; useFloatingAIFocusManagement.ts; pages/AI.tsx; pages/ai/useAIPageActions.ts; useAIPageController.ts |
| Browser/kontrak | tests/visual/ai-reading-basics.spec.ts; ai-reading-controls.spec.ts; ai-composer-polish.spec.ts; ai-reading-polish.spec.ts; ai-space-polish.spec.ts; ai-unread-cap.spec.ts; impeccable-ai-feedback.spec.ts |

Fail kumpulan komponen menggunakan prefix client/src/components kecuali laluan penuh lain dinyatakan; selection guard menggunakan client/src/hooks. Rujuk laporan reading-controls untuk sejarah fasa terdahulu.

## Ruang dan batas pengesahan

Pembersihan melalui LZX membebaskan 1,004,237,408 bait pada 524 fail cache/dependency, checksum kekal. Sifar fail dipadam. Bacaan terakhir selepas QA 926,121,984 bait kosong; ruang berubah mengikut aktiviti komputer. Butiran: [rekod ruang cakera](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/docs/disk-cleanup-20261109.md). Tiada production atau data Collection disentuh.

Semua target dijalankan bersiri dalam WSL/bwrap sedia ada, dengan CPU100%, RAM768MiB/high704, swap0, PID128, CPU120s/wall180s, tmp256MiB dan fail32MiB. Tiada had dinaikkan, pemasangan atau muat turun baharu.

**Masih perlu CI:** typecheck seluruh projek/semantik penuh AuthenticatedAppShell. Graph penuh kehabisan heap lokal; focused check hanya membuktikan 33 entry berubah, bukan semua badan fail transitif. Frontend build lulus tetapi tidak menggantikan typecheck itu. Seluruh pipeline CI/server build belum dijalankan.

Safari/Firefox, NVDA/VoiceOver, perkakasan low-spec fizikal, login dan pertukaran akaun sebenar belum diuji. CPU4×/6× ialah simulasi. Owner scope disemak melalui source/store contracts; jangan dakwa penguatkuasaan backend baharu atau skor audit seluruh SQR.

Evidence root: C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence. Metadata receipt dan manifest input berada satu aras di atas.
