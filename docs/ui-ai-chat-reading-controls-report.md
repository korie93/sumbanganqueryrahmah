# AI chat — kawalan bacaan dan perlindungan draf

9 November 2026. **Siap dan disahkan secara lokal.** Asas Git `f5a17b5253b140b45f4d54e4d67c07b82281daaa`, branch `codex/visual-layout-repair`. Laporan ini merekodkan QA sebelum commit; pengguna kemudian meminta commit dan push bersama pembaikan bold/bookmark. Keputusan regresi build terbaru dan batas typecheck ada dalam docs/ui-ai-chat-reading-basics-report.md. Belum dideploy semasa laporan disediakan.

## Perubahan yang diluluskan

| Ciri | Hasil |
|---|---|
| Stop | Mengekalkan prefix jawapan yang sudah dipaparkan, sekali sahaja; respons lama tidak boleh menyambung menulis |
| Memilih teks | Selection native dalam log menjeda auto-follow; anak panah sedia ada menyambungkannya |
| Sembang Baharu | Pengesahan hanya untuk draf bukan kosong atau AI aktif; sejarah siap tanpa draf masih boleh dikosongkan terus |
| Had aksara | Pengumuman pembaca skrin pada band baki 200 / 50 / 0; counter visual kekal tepat dan description input statik |

Butang ikon, tema, logo dan animasi sedia ada dikekalkan. Tiada perubahan backend, database, permission, navigasi, dependency atau CSS global. Tiada storan chat kekal, polling atau timer tambahan.

## Punca yang disahkan

**Stop:** sebelum ini berkongsi lifecycle cancel yang mengosongkan `streamingText`. Baseline `a6816f10c29d` menangkap prefix pada klik sebenar tetapi mendapati sifar mesej pembantu selepas Stop (jangkaan satu). Kini tindakan Stop diasingkan: pemilikan respons dikonsumsi dahulu, sesi lama dibatalkan, kemudian prefix committed bukan kosong dimasukkan melalui helper sejarah sedia ada. Generic cancel untuk reset/disable/unmount masih membuang respons. Had floating 30 / halaman AI 50 mesej dikekalkan.

Selepas pembaikan: `adc5953626b6` mengekalkan 3,349 aksara dan `407be9f6c2e8` mengekalkan 1,815 aksara daripada jawapan 15,400 aksara. Setiap kes menghasilkan satu mesej pembantu/satu permintaan. Ujian membandingkan teks tepat ketika klik dan menunggu 2,700 ms untuk mengesan penulisan lewat; panjang prefix bergantung pada masa klik.

**Selection:** hook follow sebelum ini tiada semakan pemilihan teks. Baseline `d28a8921d5b8` memilih `RECORD` dengan mouse sebenar tetapi scroll bergerak 973px ketika reveal. Selepas pembaikan, full kekal pada scrollTop 1,031 (`c782e694af53`) dan floating pada 1,141 (`ec701856aac3`). Guard hanya membaca julat/endpoint native, tidak mengubah selection/clipboard atau mengimbas keseluruhan teks. Listener pasif dibuang semasa cleanup. Selection yang dibersihkan tidak menyebabkan lompatan sendiri; anak panah menyambung follow termasuk melalui keyboard.

**Reset:** menggunakan AlertDialog SQR sedia ada. Batal mengekalkan draf/permintaan, Tab dan Escape dimiliki dialog dalaman, fokus kembali ke trigger atau textarea. Peralihan viewport native 1366×900 → 375×480 ketika AI aktif turut lulus: dialog boleh dicapai, Escape menutup dialog dalaman sahaja, minimize/reopen mengekalkan satu permintaan/satu completion. Tiada pembetulan resize spekulatif ditambah.

**Aksara:** teks live region kekal sama dalam setiap band walaupun counter visual berubah. Pengesahan ini menggunakan DOM/mutation, bukan output suara NVDA/VoiceOver.

## Ujian dan bukti

Semua receipt dalam jadual berakhir dengan exit 0, tiada budget failure dan tiada artifak wajib hilang.

| Semakan | Keputusan | Suffix receipt |
|---|---|---|
| Unit/SSR/kontrak AI terpilih | 91/91 | `41c9fe79c064` |
| Lint akhir | 24 fail lulus | `74337f49628d` |
| TypeScript semantik terfokus | 24 fail lulus | `437ad8a86531` |
| Vite frontend build | Lulus, 82.424 saat | `6cbcd6a0d7a2` |
| CSP react-remove-scroll hashes | Lulus | `817fa36be10b` |
| Kontrak pendaftaran visual | 10/10 | `a3366c959c88` |
| Client bundle budget script | Lulus, had tidak dilonggarkan | `e811a3289a28` |
| Stop, full/floating | 2/2 | `adc5953626b6`, `407be9f6c2e8` |
| Selection, full/floating | 2/2 | `c782e694af53`, `ec701856aac3` |
| Reset full | 2/2 | `a51e9328728c` |
| Reset floating, termasuk viewport transition | 3/3 | `92a5eb44c4bd` |
| Had aksara, full/floating | 2/2 | `1bc93a7862a6`, `d9cb8cd9f554` |
| Feedback sedia ada, full/floating | 8/8 | `b33d05098c33`, `630900a2e93f` |
| Reading input, full/floating dan dua tema | 4/4 | `d4c7bc6fbc1e`, `8703dc185ac7` |
| Reading behavior 320/768px, CPU 6×/4× | 2/2 | `9591c19bd26f` |
| Unread cap dan reset respons lewat | 2/2 | `a688023976a0` |
| Header light/dark 375/1366px | 4/4 | `a4adb8a87b36` |
| Keyboard, rotation, safe inset, desktop | 8/8 | `d0fbbf502827` |
| Composer, full light 320/floating dark 375px | 2/2 | `00025c1de874`, `71744a6fd58e` |
| Space, full light 1366/floating dark 375px | 2/2 | `f0a02d487b48`, `c20bb8c10ea8` |

**43 kes browser unik lulus:** 11 baharu dan 32 regresi. Dua kes floating reset turut lulus lebih awal pada `4ac2b28e2f30`; pengulangan tidak dikira dua kali. Semua 2,023 hash fail client masih sepadan dengan input build selepas ujian akhir.

Ujian baharu mengekalkan CSP asal dan menambah penguatkuasaan Trusted Types dalam fixture. Tiada pelonggaran sanitizer/CSP atau pengabaian amaran baharu. Fixture errors, unexpected requests dan diagnostik CSP/Trusted Types kosong bagi kes baharu.

## Paparan yang benar-benar diperiksa

Chromium menggunakan build frontend sebenar dengan API fixture sintetik pada `/ai` dan floating AI di `/viewer`. Viewport termasuk lebar 320, 375, 768, 1366 dan landscape 844, serta ketinggian pendek/simulasi keyboard dalam suite sedia ada. Tiada rekod production digunakan.

Empat screenshot dialog diperiksa secara visual: full light 1366/dark 320px dan floating dark 375/light 320px. Dialog muat dalam viewport, tulisan tidak terpotong dan tindakan 44px. Ini pengesahan UI AI yang disentuh, bukan audit visual semula seluruh SQR.

Screenshot di bawah folder evidence:

- `receipt-adaptive-tests-a51e9328728c/ai-reading-controls-reset-full-light-1366.jpg`
- `receipt-adaptive-tests-a51e9328728c/ai-reading-controls-reset-full-dark-320.jpg`
- `receipt-adaptive-tests-4ac2b28e2f30/ai-reading-controls-reset-floating-dark-375.jpg`
- `receipt-adaptive-tests-4ac2b28e2f30/ai-reading-controls-reset-floating-light-320.jpg`

## Ketelusan dan batas

- Percubaan awal `e3d3bb7342e6`/`daed4a154cef` gagal pada persediaan kerana payload sintetik melebihi had parser 20,000; bukan red aplikasi. Fixture dibetulkan kepada maksimum 16,000 bait sebelum baseline sah di atas.
- `337e54f30d15` gagal kerana locator accessible textbox latar digunakan semasa Radix menyembunyikan latar daripada accessibility tree. Locator semasa modal ditukar kepada DOM scope yang tepat; kedua-dua tema/full/floating kemudian lulus. Tiada assertion penting dibuang.
- Typecheck hanya meliputi fail berubah dengan pilihan compiler CI sebenar. Seluruh graf TypeScript, seluruh suite SQR, build server penuh dan keseluruhan GitHub Actions tidak dijalankan dalam tugas ini.
- CPU 4×/6× ialah simulasi, bukan perkakasan low-spec fizikal. Safari/Firefox, pembaca skrin sebenar, login/account switch sebenar dan production tidak diuji.
- C: hampir penuh semasa QA. Target baharu dijeda secara terkawal; setelah semua target tamat, jurnal lama distro ujian divacuum dan VHD ujian dipadatkan. Tiada kod, resit, PDF, Excel atau data Collection dipadam. Exit 73 untuk jeda maintenance bukan kegagalan aplikasi.
- Semakan sumber bebas tidak menemukan blocker. Tiada dakwaan bebas semua bug atau skor audit seluruh SQR dibuat.

Evidence root: `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence`. Metadata receipt/manifest berada satu aras di atas. Awalan receipt ialah `receipt-adaptive-tests-`, kecuali build menggunakan `receipt-adaptive-build-`.

## Fail kod dan ujian yang berubah

- [client/src/components/ai-chat-stop-response.test.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/ai-chat-stop-response.test.ts)
- [client/src/components/ai-chat-stop-response.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/ai-chat-stop-response.ts)
- [client/src/components/ai-query-limit-announcement.test.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/ai-query-limit-announcement.test.ts)
- [client/src/components/AIChat.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/AIChat.tsx)
- [client/src/components/AIQueryLimit.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/AIQueryLimit.tsx)
- [client/src/components/AIResetConfirmation.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/AIResetConfirmation.tsx)
- [client/src/components/floating-ai-accessibility.test.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/floating-ai-accessibility.test.ts)
- [client/src/components/floating-ai-accessibility.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/floating-ai-accessibility.ts)
- [client/src/components/FloatingAIPanel.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/FloatingAIPanel.tsx)
- [client/src/components/useAIChatState.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/useAIChatState.ts)
- [client/src/components/useFloatingAIFocusManagement.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/components/useFloatingAIFocusManagement.ts)
- [client/src/hooks/ai-message-selection-guard.test.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/hooks/ai-message-selection-guard.test.ts)
- [client/src/hooks/ai-message-selection-guard.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/hooks/ai-message-selection-guard.ts)
- [client/src/hooks/useAIMessageFollow.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/hooks/useAIMessageFollow.ts)
- [client/src/pages/AI.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/AI.tsx)
- [client/src/pages/ai/AIConversationCard.tsx](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/ai/AIConversationCard.tsx)
- [client/src/pages/ai/useAIPageActions.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/ai/useAIPageActions.ts)
- [client/src/pages/ai/useAIPageController.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/client/src/pages/ai/useAIPageController.ts)
- [tests/visual/ai-composer-polish.spec.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/tests/visual/ai-composer-polish.spec.ts)
- [tests/visual/ai-reading-controls.spec.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/tests/visual/ai-reading-controls.spec.ts)
- [tests/visual/ai-reading-polish.spec.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/tests/visual/ai-reading-polish.spec.ts)
- [tests/visual/ai-space-polish.spec.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/tests/visual/ai-space-polish.spec.ts)
- [tests/visual/ai-unread-cap.spec.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/tests/visual/ai-unread-cap.spec.ts)
- [tests/visual/impeccable-ai-feedback.spec.ts](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/tests/visual/impeccable-ai-feedback.spec.ts)

Primitive AlertDialog global tidak mempunyai perubahan kandungan. Dokumen laporan dan handoff turut ditambah/dikemas kini. Lima spec lama diselaraskan dengan kelakuan yang diluluskan.
