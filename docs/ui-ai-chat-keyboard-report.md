# AI chat — papan kekunci dan ruang bacaan telefon

8 November 2026. Pembetulan frontend lokal selesai. Skop: ruang input mesej dan Hantar kekal kelihatan, skrol stabil serta paparan landskap. Kerja sesi panjang/memori belum diluluskan.

## Punca dan bukti sebelum edit

Binaan asas receipt-adaptive-build-320a602dac40 diuji sebelum perubahan. Simulasi neutral untuk 4 senario dan ujian merah panned mengesahkan header terpotong, draf/Hantar berada di luar jalur kelihatan, dan hujung jawapan tidak diikuti selepas perubahan tinggi.

Visual viewport boleh mengecil apabila keyboard terbuka walaupun layout viewport tidak berubah ([Chrome](https://developer.chrome.com/blog/viewport-resize-behavior/)). offsetTop ialah ofset berbanding layout viewport ([CSSOM View](https://drafts.csswg.org/cssom-view/)). Pengiraan lama menggabungkan innerHeight dengan inset tanpa mengalihkan bahagian atas panel. Paparan landskap pada 844 px pula berada di luar breakpoint mobile global.

Regresi tambahan mendapati textarea diukur sebelum parent mengemas kini had tinggi CSS. Guard overflow sementara hanya menyelesaikan pengecilan. Ujian had tinggi 220 → 300 mengesahkan kotak input tidak mengembang semula; pembetulan akhir mencetuskan pengukuran selepas React menerapkan perubahan parent pada DOM. Probe navigasi keyboard diubah kepada Home → End kerana Ctrl+End pada caret yang sudah di hujung tidak menggerakkan caret dalam probe asal. Cubaan gagal yang menerangkan pembetulan ini dikekalkan dalam manifest.

Iterasi TypeScript terfokus 1a037384c206 turut gagal pada jenis Locator dalam ujian bagi selectionStart/selectionEnd. Cast HTMLTextAreaElement yang eksplisit membetulkan jenis ujian tersebut; tiada perubahan aplikasi diperlukan untuk kegagalan itu.

## Perubahan

- [FloatingAI.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/FloatingAI.tsx:31): Satu snapshot media query khusus chat meliputi peranti sentuh dalam landskap sempit; navigasi dan breakpoint global dikekalkan.
- [useFloatingAILayoutState.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/useFloatingAILayoutState.ts:50): Jejak visual viewport ketika panel mobile dibuka; tinggi dan inset digunakan sekali supaya ofset atas tepat.
- [FloatingAIPanel.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/FloatingAIPanel.tsx:107): Dedahkan keadaan keyboard dan ruang pendek kepada CSS, serta bekalkan tinggi panel kepada ruang input mesej.
- [FloatingAI.module.css](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/FloatingAI.module.css:49): Paparan skrin penuh mengatasi had desktop, dan safe area diambil kira sekali ketika keyboard terbuka. Panel dengan tinggi sehingga 320 px menggunakan padding, header dan had tinggi draf yang lebih padat. Warna dan animasi dikekalkan.
- [useAIMessageFollow.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/hooks/useAIMessageFollow.ts:44): Ikuti hujung perbualan apabila saiz log berubah, hanya jika pengguna masih mengikuti jawapan. Bacaan terdahulu tidak dipaksa ke bawah. Observer dibersihkan.
- [AIChat.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/AIChat.tsx:80): Perubahan tinggi panel mencetuskan pengukuran semula textarea selepas React menerapkan perubahan parent pada DOM.
- [useAutoGrowTextarea.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/hooks/useAutoGrowTextarea.ts:110): Ukur semula selepas had tinggi CSS berubah, termasuk apabila mengecil atau membesar. Laluan pantas semasa menaip, observer lebar sahaja, CSP dan cleanup dikekalkan. Tiada timer atau polling baharu.

Tiada perubahan pada backend, data, API, auth, permission, sanitizer, aliran permintaan AI, logo atau navigasi. Tiada dependency baharu.

## Sebelum → selepas pada geometri yang sama

Koordinat dinyatakan dalam CSS px. Gap ialah jarak hujung log daripada jawapan terakhir; ia sepatutnya 0 ketika mengikuti jawapan.

| Senario | Layout / jalur kelihatan selepas keyboard | Atas header | Bawah Hantar | Jarak hujung log |
|---|---|---:|---:|---:|
| portrait | 375 × 844 / 0–464 | 19 → 19 | 442 → 442 | 191 → 0 |
| panned | 375 × 844 / 160–520 | 19 → 179 | 498 → 498 | 135 → 0 |
| short | 320 × 640 / 0–220 | 19 → 11 | 248 → 204 | 348 → 0 |
| landscape | 844 × 390 / 0–190 | 73 → 11 | 341 → 174 | 0 → 0 |

Semua header, textarea dan Hantar kini berada dalam jalur kelihatan bagi 4 senario. Pada jalur kelihatan 220 px, ruang log bertambah daripada 22 px kepada 65 px. Paparan landskap dengan jalur kelihatan 190 px masih mempunyai ruang log 44 px. Kandungan draf dikekalkan tepat.

## Ujian akhir

- Binaan frontend produksi lulus: receipt-adaptive-build-9ce944157f66.
- 68/68 ujian unit/SSR/kontrak lulus; lint dan TypeScript terfokus untuk 7 fail lulus.
- 22/22 Playwright lulus: 8 kes tingkah laku keyboard, 4 kes bukti geometri keyboard dan 10 regresi bacaan/input/ruang.
- Fokus dan draf kekal ketika putaran dua hala. Kedudukan terkini terus diikuti; bacaan awal dan anchor Baris 35 pada lebar sama tidak ditarik ke bawah.
- Had tinggi draf 300 → 220 → 300 menguji overflow hidden → auto → hidden, navigasi caret Home/End, serta scrollTop positif ketika ruang sempit dan 0 selepas ruang mencukupi. Tiada POST tambahan.
- Safe inset bawah 34 px dan sisi 44 px melindungi kawalan. Desktop fine-pointer kekal dock dengan geometri sepadan sebelum/selepas event viewport.
- Regresi input chat penuh/panel terapung mengekalkan penaipan mesej pendek tanpa pengecilan sementara atau mutasi style. Pembalutan teks, pemadaman, Unicode, font, perubahan saiz/had tinggi, hantar dan reset diuji semula.
- 6/6 JPEG biasa empty/queue/reading bagi chat penuh cerah 1366 px dan panel terapung gelap 375 px mempunyai SHA256 tepat sama dengan sebelum tugas ini.
- 2014 checksum client sepadan dengan binaan akhir; hash semua artifak ujian yang dikumpul disahkan. Semakan sumber/metodologi secara baca sahaja tidak menemui blocker selepas hasil runtime akhir.

## Semakan akhir Impeccable / Product Design / Designly

Skop semakan ialah chat ketika keyboard terbuka, bukannya audit seluruh SQR. Rupa cerah/gelap, jajaran ruang input mesej, butang simbol dan kawalan diperiksa daripada tangkapan skrin sebenar. Pembetulan menangani kecacatan responsif setempat; tiada reka bentuk semula atau animasi hiasan ditambah. Tiada isu P0/P1 yang masih dapat direproduksi dalam kes yang diuji. Skor seluruh aplikasi tidak diberikan kerana semua modul tidak diaudit semula.

## Batas pengesahan

- Chromium headless setempat dengan data sintetik; height/offsetTop VisualViewport disimulasikan. Ini tidak menguji papan kekunci OS, anjakan viewport asli browser atau telefon fizikal.
- Viewport yang diuji: 320 × 640, 375 × 844, 844 × 390 dan desktop fine-pointer 1366 × 900. Regresi biasa turut meliputi lebar 320/375 px dalam tema gelap dan chat penuh 1366 px dalam tema cerah.
- Safe inset bawah 34 px dan kiri/kanan 44 px disuntik sebagai token dalam jalur viewport kelihatan; ini bukan bukti tingkah laku asli Safari/Android.
- Bacaan di tengah sejarah disahkan pada lebar sama dengan anchor Baris 35. Putaran lebar mengesahkan awal sejarah/scrollTop 0; semua anchor selepas teks berbalut semula tidak dijamin.
- Fixture keyboard menggunakan perf_mode low/reduced-motion. Tiada profil FPS, ujian perkakasan spesifikasi rendah/sederhana/tinggi yang baharu, zoom/pinch atau pembaca skrin sebenar dijalankan.
- Tiada akses produksi, data sebenar, AI sebenar atau backend diuji. Semakan TypeScript seluruh projek dan keseluruhan CI tidak dijalankan; skop semakan ialah binaan frontend, lint dan TypeScript terfokus.
- Browser Codex tidak boleh mencapai loopback sandbox; paparan diperiksa melalui tangkapan skrin Chromium setempat yang telah diluluskan.
- Semua target dijalankan secara bersiri dalam SQR-Audit WSL bwrap: CPU 100%, memori 768 MiB, swap 0, pids 128, CPU 120 s/wall 180 s. Had tidak dilonggarkan dan tiada dependency dimuat turun.
- Perubahan masih lokal; belum commit, push atau deploy.

[Manifest](ui-ai-chat-keyboard-verification.json) · [Handoff](ui-ai-chat-keyboard-handoff.md)

## Tangkapan skrin selepas pembetulan

![ai-keyboard-landscape-open.jpg](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-79f0a691d996/ai-keyboard-landscape-open.jpg)

![ai-keyboard-panned-open.jpg](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-79f0a691d996/ai-keyboard-panned-open.jpg)

![ai-keyboard-short-open.jpg](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-79f0a691d996/ai-keyboard-short-open.jpg)
