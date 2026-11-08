# Kelancaran menaip AI — laporan pengesahan

8 November 2026. Pembetulan frontend lokal selesai untuk cadangan nombor 1. Rupa, animasi, aliran kerja, API dan sanitizer dikekalkan.

## Punca yang disahkan sebelum edit

Auto-grow textarea dikosongkan kepada height:0px dan dipulihkan pada setiap aksara walaupun input masih muat satu baris. Trace baseline v2 mengukur 133 layout, 99 bacaan scrollHeight, 33 pengosongan tinggi dan 66 mutasi style bagi 33 aksara melalui keyboard; corak sama pada chat kosong dan selepas jawapan 20,000 aksara. Kerja layout berulang ini turut berlaku tanpa sejarah panjang.

Ujian merah1f285590ddaf melengkapkan pemeriksaan behavior asas sebelum gagal tepat pada9collapse untuk9keys pendek. Diagnosis v1 tidak dapat memerhati setter height; angka writes0 v1 tidak digunakan. V2 menggunakan MutationObserver attributeOldValue dan perbandingan akhir menggunakan instrumentasi v2 yang sama.

## Pembetulan minimum

- [useAutoGrowTextarea.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/hooks/useAutoGrowTextarea.ts:16): satu cache ukuran lokal. Laluan ringkas hanya untuk tambahan teks ASCII yang masih muat, geometri sama dan tinggi sudah pada minimum. Kes ini tidak lagi mengosongkan tinggi atau menulis style.
- Wrap/growth, delete, replacement, nonASCII dan resize/font/viewport masih menggunakan ukuran penuh. Cache dibersihkan pada cleanup, elemen tiada atau width0. Bacaan akhir CSSOM menghormati box sebenar.
- Tiada debounce state/caret, timer baharu, CSS, dependency, backend, permission, navigasi atau logik AI diubah. Perbandingan checksum sebelum/selepas mengesahkan hook ini sahaja berubah sebagai kod aplikasi.
- [ai-reading-polish.spec.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/tests/visual/ai-reading-polish.spec.ts:419): empat regresi input baharu. Typecheck awal menemui pemboleh ubah root yang tidak digunakan dalam test; sudah dibuang, dan semua semakan akhir lulus.

## Perbandingan berpasangan

Sebelum receipt-adaptive-build-20ff4df5f6db; selepas receipt-adaptive-build-320a602dac40. Setiap run mempunyai probe kosong dan selepas jawapan20k,33nativekeys setiap probe. Floating6 menggunakan3pasangan dengan susunan ABBAAB; floating1/full4 satu pasangan. Jadual menggunakan median per-run termasuk median P95, bukan P95 semua sampel digabungkan.

| Permukaan / CPU / keadaan | Sampel setiap binaan | Collapse height0 | Bilangan layout | TaskDuration (ms) | Proxy key→post-frame P95 (ms) |
|---|---:|---:|---:|---:|---:|
| floating/6/empty-transcript | 3 | 33 → 0 | 133 → 67 | 6304.4 → 5486 | 870 → 1380 |
| floating/6/after-20k-answer | 3 | 33 → 0 | 133 → 67 | 5861.1 → 5535.1 | 1056 → 2530 |
| floating/1/empty-transcript | 1 | 33 → 0 | 133 → 67 | 727.7 → 818.4 | 51 → 48 |
| floating/1/after-20k-answer | 1 | 33 → 0 | 133 → 67 | 816.9 → 748.9 | 21 → 21 |
| full/4/empty-transcript | 1 | 33 → 0 | 133 → 67 | 4194.2 → 3829.3 | 647 → 319 |
| full/4/after-20k-answer | 1 | 33 → 0 | 133 → 67 | 4430.6 → 3977.9 | 347 → 231 |

### Pengesahan tanpa trace berat

Proxy dalam trace berubah-ubah, jadi6run tambahan (3sampel setiap binaan, ABBAAB) dijalankan tanpa Tracing, wrapper getter DOM atau pemerhati style. Timing observers/CDP metrics kekal. Ini set ukuran berasingan; jangan campur magnitudnya dengan jadual trace.

| Permukaan / CPU / keadaan | Layout sebelum → selepas | TaskDuration (ms) | Proxy key→post-frame P95 (ms) | EventTiming P95 entri ≥16ms (ms) |
|---|---:|---:|---:|---:|
| floating/6/empty-transcript | 133 → 67 | 4627.5 → 3836.7 | 554 → 555 | 152 → 136 |
| floating/6/after-20k-answer | 133 → 67 | 4163.3 → 3746.4 | 327 → 325 | 176 → 120 |

Semua10profil selesai dengan jawapan tepat, composer sedia, satu POST dan tiada error fixture. Setiap33keys selepas pembetulan mempunyai0collapse. Proxy key-to-post-frame merangkumi33samples setiap run dan tidak dilabel INP. EventTiming P95 dalam manifest ialah entri bersyarat ambang16ms sahaja. Capture jawapan/top-level metric menggunakan CPU1 untuk warmup dan tidak digunakan sebagai prestasi input.

### Ukuran yang meningkat

- floating/6/empty-transcript / keyP95ProxyMs: 870 → 1380 (+58.6%).
- floating/6/after-20k-answer / keyP95ProxyMs: 1056 → 2530 (+139.6%).
- floating/1/empty-transcript / taskMs: 727.7 → 818.4 (+12.5%).
- Tanpa trace: floating/6/empty-transcript / keyP95ProxyMs: 554 → 555 (+0.2%).

Kenaikan P95 EventTiming bersyarat perlu dibaca bersama bilangan entri yang direkod dalam manifest; ia tidak dengan sendirinya membuktikan regresi P95 semua33keys. Semua hasil yang meningkat dikekalkan, bukan dibuang untuk menjadikan laporan kelihatan baik.

### Cubaan profil yang tidak lengkap

Set perbandingan akhir mempunyai17cubaan:16lengkap dan1timeout. Baseline quiet291191b7f34c tamat pada had subprocess165s sebelum JSONruntime dieksport. Punca muktamad tidak disahkan; cubaan ini tidak dianggap lulus atau bukti tiada bug. Artifak stdout/stderr dikekalkan. Ulangan baseline77b904af1f4a dengan had sama berjaya, diikuti pasangan selepas10c61542133c. Logging lifecycle ditambah di luar tetingkap ukuran untuk membantu diagnosis; had dan kod aplikasi tidak diubah.

## Ujian dan visual

- 42/42 ujian unit/SSR/kontrak, lint dua fail, TypeScript terfokus dua fail dan binaan production frontend lulus.
- 10/10 Playwright lulus: empat input baharu, dua reading/fokus, dua behavior mobile dan dua evidence.
- Input full/floating pada cerah1366 dan gelap375:0stylemutation dan0collapse semasa short typing, tinggi/fokus/caret sama.
- Wrap/delete/shrink, multiline insertion,5rowcap+scroll, same-lengthreplacement, width100px→asal, font24px/line36px, synthetic fonts.loadingdone, maxHeight72px→asal, emoji/ZWJ/surrogate replace/delete, clear/send/reset dan CSP/fixture disahkan.
- Enam JPEG empty/queue/reading full/cerah1366 dan floating/gelap375 tepat sama SHA256 dengan pasangan binaan sebelum. Semakan visual root mengekalkan rupa dan jajaran dalam captures tersebut.
- 2014checksum client sepadan binaan akhir; hash semua artifact disahkan. Sumber dan metodologi turut melalui review baca-sahaja tanpa blocker.

## Batas

- Chromium headless, GPU dimatikan, cerah1366x900, perf_mode high dengan simulasi CPU1/4/6; tiada hardware fizikal diuji.
- Respons20k disediakan padaCPU1 sebelum probe input; setiap probe33keys diuji pada CPU yang dipilih.
- Trace, getter wrappers dan observer mempunyai overhead sama dalam kedua-dua binaan; angka tidak dibandingkan terus dengan393ms laporan terdahulu.
- Keyboard EventTiming P95 ialah P95 bersyarat bagi entri yang direkod melepasi ambang16ms, bukan semua33keys; null bukan0ms. Ia bukan field INP.
- Key/input-to-post-frame ialah proxy, bukan INP. Jumlah nested trace event tidak digunakan sebagai jumlah CPU; TaskDuration CDP dilaporkan.
- Tiga pasangan floating6 dan satu pasangan floating1/full4: hasil deskriptif, bukan jaminan semua peranti atau browser.
- Probe kosong sentiasa dahulu; bandingkan sebelum/selepas dalam fasa sama, bukan kesan sejarah semata-mata. Kos instrumentasi serta warmup/JIT/GC terlibat.
- Observer sekunder menggunakan tail150ms sebelum disconnect tanpa takeRecords; hanya entri yang sempat dihantar direkod.
- Tiada production, data sebenar, AI service sebenar, full-project TypeScript atau keseluruhan CI diakses/dijalankan.
- Ujian behavior menggunakan fixture low-mode/reduced-motion; profil menggunakan high-mode dengan motion diaktifkan. Tiada animasi dibuang dan tiada tuntutan FPS fizikal dibuat.
- Shortcut sengaja terhad kepada input ringkas yang masih muat pada minimum. Input panjang berbalut dan Unicode mengekalkan laluan penuh; optimasi tidak didakwa untuk semua jenis input.
- Perubahan masih lokal; tiada commit, push atau deployment dalam task ini.

[Manifest pengesahan](ui-ai-chat-input-performance-verification.json) · [Handoff](ui-ai-chat-input-performance-handoff.md)

## Captures akhir

![Chat selepas pembetulan](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-c56befc792b2/ai-space-full-light-1366-reading.jpg)

![Chat selepas pembetulan](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-558bd60bf9c2/ai-space-floating-dark-375-reading.jpg)
