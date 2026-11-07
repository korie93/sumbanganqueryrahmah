# AI chat SQR: laporan pelaksanaan dan pengesahan

Tarikh: 7 November 2026. Asas: `a1d577a26ec09e42a9eadd665880e1c13c32568d`, branch `codex/visual-layout-repair`.

Tiga penambahbaikan yang diluluskan sudah siap untuk semakan kod. Tiada commit, push atau deploy dalam task ini.

## Hasil pelaksanaan

| Bahagian | Sebelum | Selepas |
| --- | --- | --- |
| Input soalan | Tinggi tetap/resize manual pada halaman penuh | Auto-grow 1/2 hingga 5 baris mengikut mod asal; teks lebih panjang boleh discroll; mengecil selepas clear, send dan reset |
| Format jawapan | Halaman penuh memaparkan teks biasa; floating mempunyai renderer sendiri | Kedua-duanya menggunakan renderer perenggan, senarai dan kod yang sama, termasuk semasa reveal jawapan |
| Pemulihan ralat | Tiada tindakan retry khusus | Ikon retry hanya bagi ralat sementara yang layak; satu query gagal digunakan sekali, tanpa mesej pengguna atau permintaan berganda |
| Draf baharu | Tiada aliran retry khusus | Retry tidak memadam soalan baharu yang belum dihantar |

Stop, Sembang Baharu dan Mesej Terkini kekal berikon. Copy dan AI idle tidak ditambah semula. Warna, navigasi dan animasi SQR dikekalkan; tiada library baharu, polling auto-grow atau backend baharu.

Auto-grow memerhati perubahan lebar, font dan viewport dengan satu rAF yang boleh dibatalkan, serta membersihkan observer/listener apabila unmount. Tinggi sebenar masih tertakluk kepada had CSS viewport.

Retry manual tidak diberikan untuk 401, 403, 429, respons gate atau `Retry-After`. Cancel, reset, disable dan unmount membatalkan recovery lama. Timeout kini selesai sebagai ralat yang boleh dipulihkan, bukannya meninggalkan status processing tersekat.

## Kecacatan yang ditemui dan dibetulkan

Parser asal mentafsir sebarang digit diikuti `. ` sebagai senarai. Ujian RED `receipt-adaptive-tests-2ca6a3add900` menunjukkan nombor rujukan berawalan sifar dan nombor akaun panjang hilang daripada markup. Pembetulan mengehadkan penanda senarai kepada ordinal biasa tanpa sifar awalan, serta mengekalkan nombor permulaan senarai seperti `7.`. Ujian GREEN meliputi fidelity, sanitizer, HTML berbahaya, code fence dan jawapan streaming.

Kegagalan awal browser ialah masalah fixture: konfigurasi tidak lengkap, navigasi melalui history yang tidak mewakili shell, dan anggapan bahawa AI kekal mounted apabila dimatikan. Fixture kini disahkan oleh schema sebenar; ujian menggunakan navigasi sebenar dan menunggu General Search selesai menggantikan AI sebelum enable semula. Kod navigasi dan permission tidak diubah.

## Keputusan ujian akhir

| Semakan | Keputusan / bukti |
| --- | --- |
| Ujian client AI, 29 fail | **163/163 lulus**, `receipt-adaptive-tests-ef14dba08d98` |
| Formatter + kontrak CSS | **10/10 lulus** termasuk 2 ujian CSS, `receipt-adaptive-tests-90cc5ba33e0e`; ujian formatter turut termasuk dalam 163 di atas |
| Lint 19 fail TS/TSX | Lulus, `receipt-adaptive-tests-2b336aedbd00` |
| TypeScript semantik terfokus 19 fail | Lulus, `receipt-adaptive-tests-adf58b06689a`; bukan typecheck seluruh projek |
| Binaan frontend akhir | Lulus, `receipt-adaptive-build-1620df963bb5` |
| Matriks composer | **16/16 lulus**: penuh/floating × cerah/gelap × 320/375/768/1366px; CPU 6×/1×/4×/1× masing-masing |
| Sempadan retry | **14/14 lulus**, penuh `receipt-adaptive-tests-51fc88477b32`, floating `receipt-adaptive-tests-8bd7f5343bdc` |
| Regresi compact, motion dan bacaan | **6/6 lulus**; screenshot padanan, keyboard/IME/repeat, stop, jawapan panjang, reduced motion dan fokus blok kod |
| Jumlah ujian browser akhir | **36/36 lulus**, tanpa retry ujian automatik dalam harness lokal |
| Pemeriksaan diff | `git diff --check` lulus |

Semua pelaksanaan target menggunakan sandbox bwrap WSL `SQR-Audit`, satu job pada satu masa, dengan had asal CPU100%, memory768MiB/swap0, pids128, CPU120s/wall180s. Tiada had atau threshold dilonggarkan dan tiada dependency dimuat turun.

Manifest akhir mengesahkan **1,425 fail aplikasi client sepadan dengan binaan** dan checksum 20 fail perubahan sepadan dengan sumber pada 21 resit pengesahan. Resit, args, hash fail dan profil direkodkan dalam [ui-ai-chat-composer-verification.json](./ui-ai-chat-composer-verification.json).

## Rendering dan screenshot

Rendering sebenar dilakukan melalui Playwright/Chromium lokal dengan HTTP sintetik dan frontend yang telah dibina. Tiada rekod production atau servis AI sebenar digunakan. Matriks tersebut memeriksa had input, mengecil semula, resize lebar, overflow, touch target, keyboard retry, fokus Stop, draf kekal, duplicate guard, reset dan cancel.

Screenshot berikut telah dilihat secara manual pada viewport dan keadaan yang sama:

| Paparan | Sebelum | Selepas |
| --- | --- | --- |
| Penuh, cerah, 1366×900, jawapan ringkas | `4cf1720a252d/ai-compact-full-light-1366-reply.jpg` | `3cc0d0443840/ai-compact-full-light-1366-reply.jpg` |
| Floating, gelap, 375×900, jawapan ringkas | `8ed34dfa9a0b/ai-compact-floating-dark-375-reply.jpg` | `a95a99a3d8ee/ai-compact-floating-dark-375-reply.jpg` |

Fail berada di `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/evidence/receipt-adaptive-tests-<ID>/`. Tinggi layout ringkas padanan tidak berubah: log penuh 166.375px dan floating 211.96875px; floating kosong 235.78125px dan selepas jawapan 394.96875px.

Screenshot ciri baharu turut dilihat: full/light/1366 typed dan reply (`d53cf55282e7`), serta floating/dark/375 reply (`34a24592882b`). Teks, senarai dan kod jelas, tanpa pertindihan. Input penuh 66→138→66px; floating 46/70→142→70px, kemudian kembali minimum mod asal apabila reset.

Browser Codex gagal dimulakan oleh persekitaran; jangan anggap ia telah digunakan. Katalog sumber per-run screenshot baseline floating menjadi 0 bait ketika ENOSPC terdahulu. Ia tidak direka semula; provenance baseline menggunakan katalog binaan asal `receipt-adaptive-build-ba9692af20a2`.

## Profil prestasi sebelum/selepas

Satu pasangan pemerhatian sintetik, chat penuh, 1366×900, CPU diperlahankan 6×, jawapan 4,000 aksara dan animasi normal:

| Ukuran | Sebelum | Selepas |
| --- | ---: | ---: |
| Teks pertama | 768ms | 885ms |
| Seluruh jawapan + composer sedia | 3,302ms | 3,405ms |
| Long tasks | 14 | 16 |
| Long task maksimum | 199ms | 211ms |
| Jumlah long tasks | 1,308ms | 1,396ms |
| CDP TaskDuration | 3.021s | 3.228s |

Kedua-duanya menerima satu POST, memaparkan keseluruhan jawapan tepat dan kembali sedia. Masa siap selepas bertambah 103ms (~3.1%) dalam pasangan ini; **tiada dakwaan prestasi meningkat**. Satu pasangan tidak memisahkan variasi runtime daripada kos renderer dengan yakin dan bukan benchmark hardware fizikal. Resit: sebelum `receipt-adaptive-tests-e4f84d04e6d9`, selepas `receipt-adaptive-tests-9898fe1e72f5`.

## Fail yang berubah

- UI: `client/src/components/AIChat.tsx`, `client/src/pages/AI.tsx`, `client/src/pages/ai/AIConversationCard.tsx`.
- Pemformatan: `client/src/components/AIMessage.tsx`, `client/src/components/ai-message-formatting.test.ts`.
- Auto-grow: `client/src/hooks/useAutoGrowTextarea.ts`, `client/src/hooks/auto-grow-textarea.ts`, `client/src/hooks/auto-grow-textarea.test.ts`.
- Retry: `client/src/components/ai-chat-manual-retry.ts`, `.test.ts`, `useAIChatRequestExecutor.ts`, `useAIChatState.ts`; `client/src/pages/ai/useAIPageActions.ts`, `useAIPageController.ts`, `useAIPageState.ts`, `useAIPageState.reducer.test.ts`.
- CSS: `client/src/styles/ai.css`.
- Browser: `tests/visual/ai-composer-polish.spec.ts`, `ai-retry-boundaries.spec.ts`, `ai-compact-layout.spec.ts`.
- Dokumentasi: laporan ini, `docs/ui-ai-chat-composer-handoff.md` dan `docs/ui-ai-chat-composer-verification.json`.

## Ruang cakera dan batas pengesahan

Ruang C: dipulihkan melalui mampatan NTFS metadata ujian dan tiga dump WSL lama. Dump berjumlah 2,921,218,928 bait kini menggunakan 405,577,728 bait storan; kandungan logik tidak diubah atau dipadam. Selepas QA, C: masih sekitar 1.2GiB kosong. Kod, `.env`, resit/PDF/Excel dan data Collection tidak dipadam. Pemadaman automatik terdahulu ditolak; tiada cubaan memintas penolakan.

Ujian ini mengesahkan frontend sintetik dan skop fail berubah. Ia bukan keputusan GitHub CI penuh, typecheck seluruh projek, pengesahan backend/AI sebenar, audit WCAG menyeluruh atau jaminan semua peranti fizikal. Tiada backend, database, permission, dependency, API atau struktur navigasi diubah. Tiada reka bentuk luar Figma/MagicPath dicipta atau diubah.
