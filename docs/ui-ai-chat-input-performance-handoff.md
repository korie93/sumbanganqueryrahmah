# Handoff — kelancaran menaip composer AI

8 November 2026. **Kerja frontend lokal selesai dan disahkan.** User meluluskan cadangan nombor1 selepas laporan response-performance: ukur dan baiki kelewatan menaip panel terapung. Bukan carian perbualan, keyboard-telefon baharu atau endurance task nombor2/3. Jangan commit/push/deploy tanpa arahan. Semua kerja space-polish dan stable message keys terdahulu mesti dikekalkan. Git HEAD d51edd99, branch codex/visual-layout-repair.

## Punca sebelum edit

Sebelum aplikasi diedit, profil trace baseline build **receipt-adaptive-build-20ff4df5f6db** mengesahkan133 layout bagi33nativekeys,99bacaan scrollHeight dan33collapse height0, pada chat kosong dan selepas jawapan20k. Profil diagnosis v1 `76147532cbe0`: getter/trace sah tetapi setter height prototype tidak dapat memerhati assignment, jadi kiraan writes0 **tidak boleh digunakan**. V2 `70f96b5e137c` menggunakan MutationObserver attributeOldValue dan mengesahkan33collapse/66stylemutations setiap fasa. Stack forced layout menunjuk pengukuran composer dalam shared chunk.

Ujian browser merah **1f285590ddaf** menguji semua behavior asas sebelum gagal tepat pada9collapse untuk9keys pendek; bukan timeout. Snapshot red mungkin sebelum penambahan kes font/cap/Unicode oleh subagent; green akhir wajib menggunakan spec semasa.

## Pembetulan aplikasi semasa

Hanya `client/src/hooks/useAutoGrowTextarea.ts` diubah dalam skop baharu. `resize(true)` pada perubahan value boleh mengekalkan kotak yang sudah pada tinggi minimum jika teks ASCII hanya ditambah, geometry/font key sama dan scrollHeight masih muat clientHeight. Tiada height0 atau penulisan style bagi kes tersebut. Input membesar/wrap, delete, penggantian, nonASCII serta callback width/font/viewport tetap menjalankan ukuran penuh asal. Cache lokal satu measurement, dihapus ketika cleanup/tiada elemen/width0. Batch baca metrik sebelum tulis. Tiada state debounce, timer baharu, CSS, API, sanitizer atau feature berubah.

`tests/visual/ai-reading-polish.spec.ts`:4ujian baharu `AI reading polish input full/floating light/dark` ditambah. Meliputi native single-rowkeys, wrap, shrink/delete, multiline insertion,5rowcap+scroll/caret, same-lengthreplace, width, font24/36, synthetic fonts.loadingdone, CSSmax72 dan pulihcap, emoji/ZWJ/whole-surrogate replace/delete, clear/send/reset serta tiadaerror/CSP. Mutation collapse assertion terakhir supaya red turut memeriksa behavior lain dahulu.

## Ujian dan proses aktif

Harness `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105` (`<h>`).

- Final42unit lulus `35764d033f46`; lint2 `d774d7f9cb96`; focusedTS2 `1561d7920dbb`; semua sepadan kod semasa. Iterasi lama0754/fcaa/3e7f ditutup; unusedroot pada test typecheck sudah dibetulkan.
- Binaan akhir **receipt-adaptive-build-320a602dac40** lulus. Empat behavior input lulus: full `adc7c527b5c1`, floating `ba2928ae2c88`; semua0stylemutation/0collapse shortkeys, termasuk kes font/cap/Unicode akhir.
- `ai-input-run.cjs profile` sudah selesai10jobs bersiri:3pasanganfloating6,1pasanganfloating1,1pasanganfull4; setiapjob33keys kosong+33keys selepas20k. Trace mengesahkan133→67layout dan33→0collapse dalam semua probes. Proxy selepasrAF masih berubah-ubah/ada yang meningkat; jangan sembunyikannya.
- Baseline beku: `ai-input-before-build.json`20ff4. Profil v2 di `ai-perf.mjs`, arg `e2e ai-perf floating input 6`; trace/scopedgetters, MutationObserver dan EventTiming keyboard. Sama instrumentasi kedua-dua binaan. Profile driver memulihkan `ai-baseline-config.json` inactive dalam finally.
- Regresi sudah lulus6Playwright: reading/fokus full09661fe75b85, floating5d33bb5363d7, floatingdark320/3750f1a1e990cd3, evidence fullc56befc792b2 dan floating558bd60bf9c2. Bersama4baharu menjadikan10/10. Root sudah melihat dua reading capture akhir dan rupa sepadan sebelum; verifier akan membandingkan6hashJPEG. Reviewer baca-sahaja melengkapkan review sumber/metodologi tanpa blocker.
- Quiet selesai6jobs ABBAAB/floatingCPU6 tanpa Tracing/getterwrappers/styleobserver, dalam `ai-input-quiet.json`, instrumentation ai-input-quiet-v1. styleMechanismMeasured=false: writes0 tidak diukur, jangan dakwa0collapse dari set ini. Baseline config sudah inactive. Sesi8981 berakhir gagal pada cubaan5;16318 menamatkan ulangan+pasangan dengan lulus. Tiada job target berjalan.
- Cubaan baseline quiet **291191b7f34c** timeout165s sebelum JSONruntime dieksport. Tiada punca muktamad disahkan. Artifak stdout/stderr dan `ai-input-quiet-first.json` dikekalkan. Ulangan **77b904af1f4a** dengan had sama serta pasangan selepas **10c61542133c** lulus; logging lifecycle ditambah di luar tetingkap ukuran. Jumlah perbandingan17cubaan,16lengkap,1tidaklengkap—jangan dakwa semua17lulus.
- **Verifier akhir `verify-ai-input.cjs` lulus**:42unit,10Playwright,16profil lengkap/32probes,2014checksum client, semua hashartifact dan6JPEG byte-identical dengan binaan sebelum. Aplikasi yang berubah berbanding20ff ialah hook ini sahaja. Root melihat dua reading capture akhir; tiada regresi rupa dalam captures itu. Report dan manifest lengkap: [laporan](ui-ai-chat-input-performance-report.md), [verification](ui-ai-chat-input-performance-verification.json).
- Traced:133→67layout,33→0collapse dan99→33scrollHeightreads setiap33keys. Quiet CPU6 median mainthread kosong4627→3837ms (-17.1%), selepas20k4163→3746ms (-10.0%). Proxy key→post-frame hampir sama554→555ms/kosong dan327→325ms/selepas20k. EventTiming P95 entri yang direkod152→136ms dan176→120ms. Traced proxy serta satu CPU1TaskDuration meningkat; semua nilai dikekalkan dalam report. Jangan dakwa semua ukuran latency/hardware lebih baik.

## Sambungan selepas selesai

Tiada implementasi atau ujian skop yang perlu diulang. Jika akaun lain menyambung, baca report/manifest dan periksa source hash dahulu. Jangan rerun context Impeccable atau matriks lama hanya kerana akaun bertukar. Semua perubahan masih unstaged/lokal. Jika user meminta commit/push, semak gabungan7failaplikasi,5failujian dan9dokumen UI daripada3task; jangan stage tooling `.agents/.codex/.github/.impeccable` yang sudah untracked sebelum task. Deployment perlu arahan berasingan. Jangan tambah carian/keyboard-phone/endurance tanpa arahan baharu.

Semua target Node/tests/build/Chromium **hanya SQR-Audit WSL bwrap, satu targetjob pada satu masa**, CPU100%, memory768MiB/high704/swap0, pids128, CPU120s/wall180s. Tiada download/dependency/pelebaran had. Trusted host hanya fs/Git/hash/JSON/report orchestration. C: sekitar239MB; jangan padam data atau cuba memintas penolakan pemadaman terdahulu.

## Had ukuran

Chromium headless/GPUdisabled/cerah1366x900, perf_mode high, CPU1/4/6 simulasi. Response/top-levelcapture disediakan padaCPU1 untuk mengasingkan input; gunakan inputProfiles.cdpDelta pada CPUyangdipilih sahaja. KeyboardeventP95 ialah P95 **entri yang direkod ≥16ms**, bukan semestinya semua33keys; null bukan0ms, bukan field INP. Key/input→post-frame ialah proxy, bukan INP. Tracedv2 dan quietv1 ialah dataset berasingan; jangan campurkan magnitudnya atau banding terus dengan393ms laporan terdahulu. Observersekunder tiadatakeRecords sebelumdisconnect selepas150mstail, jadi gunakan entri yang sempat dihantar sahaja. Jangan jumlahkan nestedtrace FunctionCall/EventDispatch sebagaiCPU: gunakan CDPTaskDuration. Probe kosong sentiasa dahulu; banding sebelum/selepas dalam fasa sama, bukan kesan sejarah semata-mata. Semua data sintetik; tiada production/AIservice sebenar. Jangan dakwa semua hardware lebih laju atau buang hasil bercampur.

## Kerja susulan yang diluluskan selepas laporan ini

Pembaikan keyboard telefon sudah selesai lokal pada 8 November 2026. Lihat [laporan keyboard](ui-ai-chat-keyboard-report.md), [manifest](ui-ai-chat-keyboard-verification.json) dan [handoff terkini](ui-ai-chat-keyboard-handoff.md). Laporan input-performance di atas ialah rekod binaan sejarah; hook kemudian mendapat invalidation layoutKey untuk pembetulan keyboard. Jangan gunakan verifier binaan lama sebagai pengesahan sumber akhir semasa. Skop sesi panjang/memori masih belum diluluskan.
