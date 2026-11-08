# Handoff — kelancaran jawapan AI panjang

8 November 2026. **Kerja frontend lokal selesai dan disahkan.** User meluluskan cadangan nombor 1: ukur dan baiki respons jawapan panjang, menaip dan scroll, kemudian meminta goal serta handoff untuk akaun lain. Tiada carian perbualan, resize panel, commit, push atau deployment diminta. Kerja space-polish terdahulu sudah siap dan mesti dikekalkan. Asas Git d51edd99 pada branch codex/visual-layout-repair.

## Punca dan pembetulan semasa

- `AIMessage.tsx`: key perenggan/senarai bergantung pada hash seluruh teks; setiap prefix baharu menggantikan DOM blok termasuk baris/item lama. Ujian merah runtime `receipt-adaptive-tests-0cd68adf8d0d` mengesahkan perenggan15/15 dan senarai13/13 penggantian; code13 kemas kini tanpa penggantian.
- Pembetulan minimum: key slot struktur berturutan mengikut skop induk/jenis, dicipta semula per render. Kandungan berulang kekal unik; tiada cache kekal. Hash/seed kandungan dibuang. Sanitizer, parser, scheduler40ms/2400ms, CSS, tema, animasi, API dan lifecycle tidak berubah.
- Source contract `floating-ai-a11y-contract.test.ts` diselaraskan dengan tandatangan factory baharu. Dua ujian browser `AI reading polish stability full/floating` ditambah dalam `tests/visual/ai-reading-polish.spec.ts`.

## Pengesahan yang sudah selesai

- 35/35 unit/kontrak: `661424e018ff`; lint3: `138d2c91e2a4`; focused TypeScript3: `b5ccec181246`; semua lulus.
- Binaan sebelum: **receipt-adaptive-build-2e514a2ae3d2** (space-polish siap). Binaan selepas: **receipt-adaptive-build-20ff4df5f6db**, lulus.
- Browser stability full/light1366: `ac6709f30289`, lulus, perenggan15/senarai13/code13 growth, **semua penggantian0**.
- Browser stability floating/dark375: `4469d1505307`, lulus. Setiap ujian mengekalkan format tepat, kandungan berulang, Unicode, sanitizer, draf dan scroll; satu request sintetik.
- Reviewer bebas membaca pembetulan serta metodologi: tiada blocker.

## Bukti akhir dan sambungan

Harness luaran: `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105`.

`ai-response-run.cjs profile` selesai10 profil bersiri (2 pasangan full6, full4, floating1/prosa, floating6/multiline); semua jawapan tepat, composer sedia, satu request, tiada error fixture dan scroll dikekalkan. Data dalam `ai-response-profile.json`, evidence setiap run di `evidence/<runId>`. Sebelum di `ai-response-before-build.json`; baselineconfig sudah inactive. Sesi22396 dan63213 sudah terminal; tiada job target berjalan.

Regresi `ai-response-regressions.json`: reading full `3f67f0cec165`, floating `5fac5fc2f183`, retry full `92730dbf77f3`, floating `8c7f7192b9a6`, evidence full/light1366 `161cbf436124` dan floating/dark375 `fb2c5445db5d`. Semua18 Playwright regresi lulus; bersama2 stability baharu menjadikan20/20. Stop/retry/session, scroll, fokus code, loading/queue dan draf dikekalkan.

`verify-ai-response.cjs` lulus: 35 unit,20 Playwright,10 profil,2014 checksum client, semua hash artifact. Perbandingan binaan mengesahkan AIMessage.tsx sahaja berubah sebagai kod aplikasi baharu. Enam JPEG empty/queue/reading selepas **byte-identical** dengan pasangan daripada binaan sebelum (full/light old545d993d34ac; floating/dark old1b054f50d132). Root memeriksa reading sebelum/selepas dan queue selepas; tiada regresi visual dalam captures tersebut. Reviewer bebas melengkapkan review sumber/metodologi tanpa blocker; review visual bebas tidak selesai kerana had usage, maka tiada dakwaan signoff visual bebas.

Laporan akhir: [ui-ai-chat-response-performance-report.md](ui-ai-chat-response-performance-report.md). Manifest: [ui-ai-chat-response-performance-verification.json](ui-ai-chat-response-performance-verification.json). Long task median full6 turun19.1%, kerja main thread9.1%, masa siap6.1%. Kes bercampur **mesti dikekalkan**: full4 masa siap4083→4266ms (+183ms), input108→114; floating6 input336→393ms. Jangan dakwa semua interaksi/hardware lebih pantas. Tiada had ujian dilonggarkan.

Tiada implementasi atau ujian skop yang perlu diulang. Jika akaun lain menyambung, semak manifest/sumber dahulu dan tunggu arahan kerja seterusnya. Jangan rerun context Impeccable atau matriks lama hanya kerana akaun bertukar. Jika user meminta commit/push, semak semua kerja space-polish + tiga fail kod/ujian dalam skop performance dan enam dokumen gabungan; jangan stage tooling .agents/.codex/.github/.impeccable. Deployment memerlukan arahan berasingan. Goal ini ditutup selepas laporan/handoff dan semakan diff akhir siap.

Semua target Node/tests/build/Chromium **hanya melalui SQR-Audit WSL bwrap**, bersiri, had asal CPU100%, memory768MiB/high704/swap0, pids128, CPU120s/wall180s. Tiada pemasangan atau pelebaran had. Trusted host fs/Git/JSON/report orchestration sahaja. C: sekitar300MB; jangan padam data/cache atau cuba memintas penolakan pemadaman terdahulu.

## Had metodologi

Nota sambungan8 November: optimasi composer input selepas task ini juga sudah selesai, dengan binaan semasa320a602dac40. Rujuk [handoff input-performance](ui-ai-chat-input-performance-handoff.md) untuk bukti terkini; checksum20ff di atas kekal bukti sejarah task response-performance.

Profil v3 sintetik headless/light1366x900, GPU disabled, perf_mode high dan CPU1/4/6 simulasi. Observer/profiler ada overhead dalam kedua-dua binaan. Ujian DOM menggunakan fixture low-mode dan animasi diaktifkan secara eksplisit. Kiraan penggantian ialah pemerhatian DOM, bukan React commits. Input timing selepas completion ialah event timestamp→task selepas rAF, **bukan INP dan bukan typing semasa reveal**. Full-page composer memang disabled ketika request/reveal mengikut fungsi asal. Jawapan multiline mengekalkan LF secara visual melalui br, jadi perbandingan textContent menormalkan LF. Tiada peranti fizikal/production/AI sebenar diuji; bilangan pasangan kecil. Laporkan kes yang tidak meningkat.

Profil diagnosis awal v1/v2 `9c85e0d6e5f1` dan `f0f7502b09da` bukan pasangan v3 akhir: digunakan untuk cari punca sahaja. V1 long-task tidak merangkumi task akhir; v3 menunggu100ms untuk observer selepas completion. Jangan gabungkan angka v1/v2 dengan pasangan v3.
