# AI Chat SQR — kawalan ikon dan layout padat

> Rekod sejarah. Arahan terkini6 November2026 membuang butang Copy/Salin. Status versi semasa berada dalam [ui-ai-chat-no-copy.md](ui-ai-chat-no-copy.md); bukti Copy dalam laporan ini hanya untuk build9f terdahulu.

6 November 2026. Implementasi dan QA selesai di lokal. Build akhir: `receipt-adaptive-build-9f129b8119be`. Manifest bukti: `docs/ui-ai-chat-compact-verification.json`. Handoff/sejarah kerja: `docs/ui-ai-chat-compact-controls.md`.

## Hasil

- Hantar, Hentikan, Sembang Baharu/reset, Salin dan Ke Mesej Terkini menggunakan ikon. Nama aksesibel, tooltip dan callback sedia ada dikekalkan. Stop menggunakan satu slot44px bersama Hantar; tiada baris Stop tambahan.
- Teks dan bar AI idle dibuang. Status proses/masalah masih dipaparkan. Reset hanya muncul selepas ada perbualan; Send kosong/whitespace disabled.
- Halaman penuh serta dock/sheet menggunakan tinggi kandungan sehingga had viewport/resolver. Jawapan pendek tidak dipaksa memenuhi had; jawapan panjang menatal dalam log, dengan composer kekal kelihatan. Fullscreen telefon kecil dan keyboard mengekalkan tinggi ruang viewport sebenar.
- Header/status/reset tersusun satu baris; padding, jarak dan disabled Send diselaraskan. Mesej16px/1.6, measure65ch, fon, Q/SQR dan tema gelap neutral dikekalkan.
- Salin mengekalkan teks yang dipaparkan, newline dan sifar awal. Floating menyalin sumber mesej yang telah disanitasi; fullpage menyalin string React yang dipaparkan. Tiada salinan daripada DOM yang mengandungi label kawalan, tiada Copy pada paparan streaming dan tiada clipboard write sebelum klik. Kejayaan ditunjukkan oleh tanda semak dan status “Disalin” untuk screen reader; penolakan clipboard mempunyai arahan salin manual. Fokus kekal ketika pending, dengan guard terhadap klik berulang dan cleanup apabila unmount/reset.
- Ctrl/Cmd+Enter menggunakan handler Send asal. Enter biasa kekal newline; IME, legacy229 dan repeat tidak menghantar.

## Perbandingan pada viewport sepadan

| Keadaan | BEFORE | AFTER |
|---|---:|---:|
| Log kosong fullpage desktop1366 | 448px | 20px |
| Log kosong fullpage375 | 384px | 40px |
| Panel kosong desktop1366 | 532px | 265.8px |
| Sheet kosong375 | 686px | 235.8px |
| Panel dengan jawapan pendek desktop1366 | 532px tetap | 411.4px |
| Had bacaan jawapan panjang desktop | Full448px / floating532px | Full448px / floating532px |

BEFORE daripada build857 yang disahkan sama dengan sumber semasa sebelum edit. Selepas pemadatan, teks jawapan24 pasangan BEFORE/AFTER kekal tepat. Ruang kosong kanvas halaman dan fullscreen telefon kecil tidak dianggap kad chat dengan tinggi tetap.

## Fail berubah

9 fail UI: `client/src/components/AIChat.tsx`, `AIMessage.tsx`, `AIMessageCopyButton.tsx`, `AIJumpToLatestButton.tsx`, `FloatingAIPanel.tsx`, `FloatingAI.module.css`, `ai-query-keyboard.ts`; `client/src/pages/ai/AIConversationCard.tsx`; `client/src/styles/ai.css`.

5 fail ujian: `client/src/components/ai-query-keyboard.test.ts`, `floating-ai-a11y-contract.test.ts`; `client/src/pages/ai/ai-conversation-card-a11y-contract.test.ts`; `tests/visual/ai-compact-layout.spec.ts`; `scripts/tests/ai-css-accessibility.test.mjs`.

Tiada perubahan kepada backend, auth, permission, database, API, navigation, sanitizer, request/reveal controller, dependency atau aset branding. Semua perubahan lain yang sudah ada dalam worktree dikekalkan. Tiada commit, push atau deploy dilakukan.

## Keputusan QA

| Pemeriksaan | Bukti / keputusan |
|---|---|
| Build Vite | Lulus (`9f129b8119be`) |
| Unit/kontrak client | 91/91 (`a0c8ab3d2f24`) |
| Skrip AI rem/token + viewport + error boundary | 3/3 (`e2083dcf7258`) |
| Lint | Lulus (`c2cf9e1e5774`, `111ad08d40e6`) |
| TypeScript semantik fokus14 fail dan final visual spec | Lulus (`7ff6847c7626`, `044c59796d85`); compiler options CI asal |
| Compact controls | 12/12 (`a2c3bfd3e3ac`, `4c3270f46fa3`) |
| Readability, wrapping dan keyboard code focus | 9/9 (`e494304eff7e`, `dec9cbf25a48`) |
| Follow/jump/focus, reduced-motion awal/bertukar, cancel/fresh/history dan queue/retry/reset asal | 8/8 (`45e73176538d`, `335e84a4da27`) |
| Empty/populated render | 48 kes pada320/375/768/1024/1366/1920, dua tema dan dua permukaan (`5b8f6b6a4659`, `574edc8c8118`) |
| Stress | 24 keadaan: empty dan populated pada740×360/320×360/1366×480/375×560; text scaling125% + draf620 aksara pada375/1366 |
| Aksesibiliti / keselamatan browser | 16 scan axe WCAG A/AA:0 violation; CSP ketat termasuk `style-src-attr 'none'`:0 violation;0 ralat JS/overflow dokumen; kontras teks aktif minimum5.748:1 |
| Impeccable detector | 9 fail UI, exit0 `[]`; disokong semakan render, bukan pengganti semakan visual |
| Semakan visual | 16 screenshot matrix +16 crop Stop/Copy diperiksa, termasuk review bebas. Root mengesahkan NewChat kelihatan pada4 crop Copy fullpage. Tiada pertindihan yang menghalang ditemui |

Regresi compact meliputi ikon tanpa teks, title DOM sebenar, empty/short/long heights, disabled whitespace, Ctrl/Meta+Enter, IME/repeat, hanya satu request, pending clipboard yang ditangguh, duplicate activation, kejayaan/penolakan/retry, fokus dan reset. Kontrak CSS diperbaharui untuk menguji cap resolver + fallbackvh/svh/dvh; skrip font mengesahkan token rem setara12/14px pada saiz asas16px, bukan memaksa literal berulang. Tiada threshold prestasi atau assertion fungsi dilonggarkan.

## Prestasi dan had

Enam profil4,000 aksara, normal motion, selesai dengan teks tepat dan composer sedia:

| Surface | CPU1× | CPU4× | CPU6× |
|---|---:|---:|---:|
| Fullpage | 2619ms | 3271ms | 3611ms |
| Floating | 2734ms | 3453ms | 3887ms |

CDP throttling ialah simulasi, bukan perkakasan low/medium/high sebenar. Long task masih direkodkan, maksimum451ms dalam sampel CPU4×; tiada dakwaan kelancaran sempurna atau benchmark statistik. Tiada loop ukuran layout setiap chunk, library atau efek animasi baharu ditambah. Regresi browser menggunakan modlow, matriks statik menggunakan fixturehigh, dan profil CPU menggunakan high dengan normal motion. Pilihan reduced-motion dikekalkan.

Semua app/build/tests/Chromium dijalankan hanya dalam WSL SQR-Audit bwrap, data sintetik loopback, had asal768MiB/CPU100%/swap0/pids128/wall180s. Tiada production, rekod pelanggan, servis AI sebenar atau ujian penguatkuasaan role/auth production digunakan. Tiada pemasangan/download baharu. Native Impeccable hanya membaca sumber.

Typecheck penuh projek, screen reader manual, peranti fizikal, browser zoom200% dan keseluruhan CI tidak didakwa. Ujian Activity scroll-compat terdahulu mempunyai timeout yang didokumenkan dalam `docs/ui-analysis-scroll-hint.md`; ia di luar skop AI dan tidak dikira lulus di sini.

## Provenans dan sambungan

Manifest menyimpan14 hash fail berubah, ID/keputusan test, SHA-256 screenshot/result,6 profil CPU serta padanan sumber semasa dengan snapshot yang diuji. Artefak asal: `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/<run-id>/`. Pipeline akhir `ai-compact-finish-1793968371099.json` lengkap; verifier `verify-ai-compact.cjs receipt-adaptive-tests-5b8f6b6a4659 receipt-adaptive-tests-574edc8c8118` exit0.

Sejarah diagnostik dikekalkan: `cb52886ee5d9` membuktikan native-disabled semasa salin menyebabkan fokus hilang; `15784e43ff67` dan `95161924c084` mengenal pasti kontrak CSS/font yang tidak lagi mewakili token/cap; `52f8bddec988` mempunyai selector harness Hantar lama. Semuanya diperbetulkan dan disahkan semula. Pipeline sebelum steering akhir dihentikan source guard untuk mengelakkan bundle lapuk; bukti versi lama tidak digunakan sebagai kelulusan versi akhir.

Tiada kerja implementasi/QA wajib berbaki dalam skop. Jika akaun lain menyambung, baca laporan dan manifest ini dahulu, semak hash/source semasa dan status Git, serta kekalkan semua kerja terdahulu yang belum dikomit. Jika diminta mengulang target code, gunakan sandbox sedia ada dan satu job pada satu masa.
