# AI Chat SQR — keselesaan membaca dan kemasan

6 November 2026. Skop: halaman `/ai` dan panel AI terapung. Mod reka bentuk Operate/Read; Impeccable typeset/layout/adapt/polish, Product Design, Designly typography dan No AI Slop digunakan. Identiti rujukan ialah SQR sedia ada: logo Q, fon, biru korporat dan permukaan gelap neutral.

## Hasil yang disahkan

| Perkara | Sebelum | Selepas |
|---|---|---|
| Teks mesej | 14px / leading21px | 16px / leading25.6px |
| Composer desktop | 14px | 16px / leading24px |
| Panel terapung pada1366×900 | 380×452px | 440×532px |
| Panel pada1920×900 | 380×452px | 452×532px |
| Log halaman penuh desktop | 384px | 448px |
| Teks jawapan panjang | Fade pada log halaman penuh; rujukan panjang boleh melimpah di dalam bubble | Tiada fade; rujukan membalut, blok kod mengekalkan skrol sendiri |

Bubble halaman penuh dihadkan kepada65ch. Header dan tindakan dikelompokkan dengan lebih kemas, chrome bertindih dikurangkan dan light mobile header menggunakan permukaan neutral yang sama arah dengan desktop. Palet gelap SQR dikekalkan. Penerangan antaramuka diringkaskan kepada bantuan koleksi/rekod; kandungan jawapan AI tidak ditulis semula.

Punca saiz panel yang tidak mengikuti resolver juga dibetulkan: `FloatingPanelShell` dahulunya tidak menerima placement. Kini lima custom properties dipasang melalui React CSSOM seperti trigger sedia ada. Browser dengan CSP ketat, termasuk `style-src-attr 'none'`, mengesahkan nilai dan ukuran sebenar; polisi production tidak dilonggarkan.

Semakan tambahan menemui dan membetulkan dua masalah: fullscreen menggunakan floor480px pada landscape360px sehingga header terkeluar120px; key blok kod berubah setiap chunk sehingga fokus keyboard hilang. Kedua-duanya mempunyai bukti kegagalan sebelum pembetulan dan regresi selepas pembetulan. Gutter sheet juga disamakan dengan resolver supaya panel berpusat tepat.

## Fail dalam skop

| Fail | Tujuan |
|---|---|
| `client/src/components/FloatingAIShell.tsx:43`, `FloatingAIPanel.tsx:73` | Menyambungkan placement; susunan header dan tindakan |
| `client/src/components/floating-ai-layout.ts:70`, `FloatingAI.module.css:28` | Saiz desktop, had viewport dan gutter sheet |
| `client/src/styles/ai.css:124` | Tipografi, measure, composer, scrollbar, focus ring dan wrapping |
| `client/src/styles/tokens/colors/_ai.css:38` | Pasangan warna teks/tindakan serta header cerah/gelap |
| `client/src/pages/AI.tsx:65`, `pages/ai/AIConversationCard.tsx:81` | Permukaan neutral, header berkelompok dan log halaman penuh |
| `client/src/components/AIChat.tsx:107`, `AIMessage.tsx:36` | Log/kod boleh difokus; identiti blok kod stabil semasa reveal |
| `client/src/components/floating-ai-shell-placement.test.tsx` | Regresi pemetaan placement sebenar/fallback |
| `client/src/components/floating-ai-layout.test.ts` | Regresi landscape360px serta keyboard inset |
| `client/src/components/floating-ai-a11y-contract.test.ts` | Kontrak copy dan semantik kod yang dikemas kini |
| `tests/visual/impeccable-ai-feedback.spec.ts` | 9 regresi bacaan/responsif/fokus/reset; 8 ujian feedback asal dikekalkan |

Tepat10 fail aplikasi frontend dan4 fail ujian berbeza daripada snapshot BEFORE goal ini. Manifest akhir menyimpan hash setiap fail; dependency, server, shared API, auth, permission, navigation, request/reveal controller dan sanitizer tidak diubah oleh goal ini. Perubahan layout lain yang sudah ada dalam worktree dikekalkan.

## Bukti browser

Semua target code, build dan Chromium dijalankan dalam sandbox OS SQR-Audit sedia ada: loopback, fixture sintetik, tiada production atau rekod pelanggan. Had sumber tidak dilonggarkan dan tiada dependency baharu dipasang.

| Bukti | ID |
|---|---|
| Build BEFORE | `receipt-adaptive-build-b5cd5ab8d5cb` |
| BEFORE populated24 kes | `receipt-adaptive-tests-4d410fbbd761` |
| Build akhir | `receipt-adaptive-build-857c654dea2f` |
| AFTER populated24 kes | `receipt-adaptive-tests-bee6f65c6b90` |
| AFTER empty24 kes +16 stress | `receipt-adaptive-tests-e07247cba648` |
| Bukti landscape gagal sebelum fix | `receipt-adaptive-tests-32e30305fdc7` |
| Bukti fokus kod gagal sebelum fix | `receipt-adaptive-tests-ad29d8d2b5b9` |

Matriks asas:320,375,768,1024,1366,1920px × tema light/dark × full/floating, dalam keadaan kosong dan populated. Sebanyak24 padanan populated BEFORE/AFTER mengekalkan teks jawapan sintetik tepat, termasuk rujukan panjang dan sifar awal nombor akaun.

Tambahan:740×360,320×360,1366×480,375×560 dalam kedua-dua tema; text scaling125% dan draf620 aksara pada375/1366 bagi kedua-dua permukaan. Panel, composer dan Send kekal boleh dicapai; tiada overflow dokumen. Text scaling ini bukan ujian browser zoom200%.

Screenshot375/1366 bagi kedua-dua tema, kedua-dua permukaan dan kedua-dua keadaan:16 imej akhir diperiksa secara visual, termasuk review bebas. Tiada pertindihan header/composer atau rujukan yang melimpah secara mendatar ditemui. Ellipsis subtitle mobile ialah had paparan sekunder; tindakan utama kekal kelihatan.

Pada build akhir:16 scan axe WCAG A/AA tiada pelanggaran yang dilaporkan; tiada ralat JavaScript, overflow dokumen atau pelanggaran CSP pada matriks ini. Kontras teks aktif, placeholder dan bubble diukur dengan background berlapis sebenar; minimum5.75:1 untuk populated. Warna Send yang disabled dalam screenshot tidak dianggap sebagai warna tindakan aktif. Ini bukan pensijilan WCAG atau ujian screen reader manual.

Artefak dan screenshot asal berada di `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/<ID>/`. `browser-results.json` mengandungi geometri, computed styles, kontras, axe, CSP dan interaksi. Manifest repo `docs/ui-ai-chat-readability-verification.json` menyimpan ID dan SHA-256 supaya bukti boleh dikesan.

## Regresi

| Pemeriksaan | Keputusan |
|---|---|
| Build Vite | Lulus |
| 82 unit/kontrak: geometry, placement, sanitizer, follow, reveal, session guard, lazy loader dan a11y | 82/82 lulus (`cb6dd9735839`) |
| Lint fail TypeScript yang berkaitan | Lulus (`c2ab5606d2a2`) |
| TypeScript semantik fokus9 fail dengan compiler options CI asal | Lulus (`535016811bea`) |
| Bacaan/fokus/wrapping/reset kedua-dua tema | 9/9 lulus (`cf5e8a57550e`, `715a9f287b4b`) |
| Follow/jump-to-latest, reduced-motion awal/bertukar, cancel/fresh/history, queue/retry/reset asal | 8/8 lulus (`ece85209e245`, `6995abf4c682`) |
| CPU1×/4×/6×, jawapan sintetik4,000 aksara dan normal motion | 6/6 akhir dan6/6 BEFORE lengkap; teks tepat, progressive reveal sebenar, composer sedia dan cleanup berjaya |
| Impeccable detector,10 fail UI akhir | Exit0, senarai dapatan kosong; disokong pemeriksaan render, bukan pengganti semakan visual |
| `git diff --check` | Lulus |

Ujian feedback/bacaan browser menggunakan `perf_mode=low`; reveal dan kawalan masih berfungsi. Profil CPU ialah simulasi CDP, bukannya ujian perkakasan low/medium/high sebenar. Animasi sedia ada dan `prefers-reduced-motion` dikekalkan; tiada library atau efek animasi baharu ditambah.

| Surface / CPU | Jawapan lengkap BEFORE → AFTER | Long task maksimum BEFORE → AFTER |
|---|---|---|
| Full1× | 2701 →2612ms | 0 →63ms |
| Full4× | 3502 →3103ms | 222 →214ms |
| Full6× | 3588 →3203ms | 388 →257ms |
| Floating1× | 2893 →2765ms | 109 →196ms |
| Floating4× | 4186 →3789ms | 310 →642ms |
| Floating6× | 4027 →3676ms | 521 →567ms |

Fixture dan pelayan statik yang sama digunakan dengan build BEFORE sebenar; override baseline dibersihkan selepas ujian. Setiap keadaan ialah satu sampel, bukan benchmark statistik. Semua jawapan akhir siap lebih awal dalam sampel ini, tetapi long task floating masih wujud dan maksimum beberapa sampel meningkat. Bukti ini tidak membuktikan kelancaran sempurna atau tiada regresi pada semua perkakasan. Profiling berulang pada peranti sebenar diperlukan untuk mengesahkan punca long task; tiada perubahan spekulatif kepada animasi/reveal dibuat untuk menyembunyikan bacaan tersebut.

## Audit akhir dalam skop AI

Penilaian heuristik Impeccable bagi dua permukaan AI:16/20. Aksesibiliti3/4 (axe/keyboard/kontras lulus, tiada screen reader manual); prestasi3/4 (ringan tanpa dependency baharu, had long task di atas); tema3/4 (dua tema disahkan, beberapa token warna legasi masih khusus AI); responsif3/4 (enam lebar dan landscape/text scaling lulus, tiada peranti sentuh fizikal/zoom200%); integriti implementasi4/4 (perubahan terhad, kandungan terpelihara, review visual bebas). Skor ini tidak menilai semula keseluruhan SQR.

Tiada isu visual P1/P2 yang menghalang ditemui dalam16 screenshot akhir. Ellipsis subtitle mobile ialah polish pilihan P3. Long task CPU ialah pemerhatian prestasi yang memerlukan profil berulang untuk menentukan sebab, bukan regresi berpunca daripada patch yang telah dibuktikan.

## Had dan sambungan

Typecheck keseluruhan projek dan keseluruhan CI tidak dijalankan sebagai sebahagian QA fokus ini. Ujian Activity `scroll-compat` terdahulu masih mempunyai timeout yang didokumenkan dalam `docs/ui-analysis-scroll-hint.md`; ia tidak dikira sebagai lulus di sini. Tiada penilaian backend/servis AI sebenar, pengesahan role production atau ujian peranti fizikal didakwa.

Satu cubaan browser `0c82ab021ee0` kehilangan WSL sebelum menghasilkan artifak; ia tidak dikira sebagai keputusan ujian. Ulangan dibuat hanya selepas unit service disahkan inactive. BEFORE empty juga tidak mempunyai capture yang sah; perbandingan sebelum/selepas terhad kepada populated, sementara empty akhir disahkan sendiri.

Handoff: `docs/ui-ai-chat-readability-handoff.md`. Manifest akhir telah mengesahkan semua fail sumber semasa sama dengan build yang diuji,48 layout +16 stress,24 padanan teks sebelum/selepas,16 scan axe,17 browser regressions,82 unit dan12 profil CPU. Tiada commit, push atau deployment dilakukan untuk permintaan ini.
