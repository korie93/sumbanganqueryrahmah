# AI Chat readability — handoff

Implementasi dan QA siap, 6 November 2026: AI Chat terapung serta halaman penuh dibesarkan dan dipolish untuk tema cerah/gelap. Permintaan pengguna membenarkan perubahan frontend sebenar dan QA sintetik setempat. Tiada commit/push/deploy diminta.

## Arahan sambungan

Kekalkan semua perubahan kerja lain yang sudah ada. Branch `codex/visual-layout-repair`, HEAD asas `25d86794765be568444aac76836a64601a4e7fab`; banyak fail masih belum dikomit daripada kerja layout terdahulu. Jangan reset/stash/padam atau mengubah .env.

Gunakan Impeccable lokal v4.8 (`.agents/skills/impeccable`), Product Design, Designly typography dan No AI Slop. Konteks Impeccable sudah dijalankan sekali dalam sesi ini; jangan ulang. Pemeriksaan reka bentuk automatik aktif. Baca craft-floor sebelum edit UI. Kekalkan Q/SQR, fon dan neutral dark palette asal; tiada navigasi, auth, permission, backend, parser/sanitizer atau request/reveal behavior diubah.

Semua build, target tests dan Chromium mesti dalam sandbox WSL SQR-Audit sedia ada. Orchestrator dipercayai: `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105`. Satu sandbox pada satu masa; tiada had sumber dilonggarkan, tiada pemasangan/download diperlukan. Browser setempat dengan data sintetik telah dibenarkan oleh pengguna. Tiada production digunakan.

## Status terkini (6 November 2026)

Kod frontend dan pengesahan akhir selesai. Build terbaru `receipt-adaptive-build-857c654dea2f` lulus. Laporan utama: `docs/ui-ai-chat-readability-report.md`; manifest berhash: `docs/ui-ai-chat-readability-verification.json`. Jangan gunakan bahagian sejarah di bawah sebagai status semasa.

- Akhir:82 unit lulus (`cb6dd9735839`), lint (`c2ab5606d2a2`), focused TypeScript9 fail (`535016811bea`).
- Readability9/9 termasuk code-focus semasa streaming (`cf5e8a57550e`, `715a9f287b4b`); feedback asal8/8 (`ece85209e245`, `6995abf4c682`).
- Populated akhir24 kes `bee6f65c6b90`, empty24 +16 stress `e07247cba648`; screenshot16 disemak bebas.16 scan axe:0 violation.0 CSP/runtime error. Kontras minimum5.748:1 merangkumi sampel teks aktif/placeholder kedua-dua matrix.
- CPU1/4/6×, full/floating4k:6 akhir +6 BEFORE lengkap; progressive reveal sebenar dan composer sedia. Long task masih wujud (floating akhir maksimum642ms); lihat jadual dan had di laporan, jangan dakwa semua peranti licin atau statistik non-regression daripada satu sampel.
- Impeccable source detector akhir10 fail exit0 `[]`. Native tool digunakan untuk membaca sumber sahaja; target code kekal dalam sandbox.
- Verifier dipercayai `verify-ai-readability.cjs` exit0: hash seluruh snapshot sumber semasa sama dengan build akhir,14 fail goal berubah (10 UI +4 tests), kandungan jawapan24 padanan kekal tepat. Baseline override false semula. Tiada dependency/backend/permission/auth/navigation diubah dalam goal ini.
- Tiada kerja implementasi/QA wajib berbaki dalam skop. Jika diminta commit/push kemudian, semak inventori semua perubahan terdahulu yang turut belum dikomit sebelum memilih fail.

- BEFORE populated yang sah: `receipt-adaptive-tests-4d410fbbd761`, build `b5cd5ab8d5cb`.
- AFTER batch 3: `receipt-adaptive-tests-2ca38646ad33` pada build `b991d16e84c8`: 24 kes, 8 screenshot, tiada ralat browser, overflow dokumen, pelanggaran CSP atau pelanggaran axe dalam scan 375/1366. Pemeriksaan `.Count` pada senarai PowerShell yang mengandungi null boleh mengelirukan; kira hanya violation sebenar.
- Saiz sebenar: mesej/composer 16px, leading mesej25.6px. Floating desktop1366:440×532 (BEFORE380×452);1920:452×532. Fullpage desktoplog448 (BEFORE384). Tema gelap neutral, light mobile header kini neutral, tiada fade menutup mesej. Wire placement melalui CSSOM dibuktikan di bawah CSP ketat termasuk `style-src-attr 'none'`; tiada CSP production diubah.
- Unit batch1 `66639eb3bc3b`:38/38. Readability full batch2 `dac60ee54cff`:4/4; floating batch2 `53b6048bd6c9`:4/4. Bukti tersebut sejarah, bukan kelulusan terakhir selepas semua edit.
- Probe landscape `32e30305fdc7` membuktikan fullscreen740×360 mempunyai header y−120 kerana resolver menggunakan floor480. Pembetulan sekarang menggunakan tinggi input sebenar untuk panel fullscreen; scoring trigger dikekalkan. Empat ujian geometry360px dengan inset0/120 ditambah.
- Ujian streaming code `ad29d8d2b5b9`:1 gagal fokus,4 readability lulus. Key blok kod dahulunya mengandungi seluruh kandungan lalu DOM diganti pada setiap chunk. Key kini berdasarkan language+occurrence melalui factory sedia ada; sanitizer/parser tidak berubah. Ujian browser mengesahkan fokus dan horizontal scroll ketika kandungan berkembang, lalu cancel. Wajib jalankan semula dan simpan hasil hijau.
- Sheet CSS diberi gutter6px yang sama seperti resolver supaya tidak diclamp sebelah dan tersasar2px.
- Satu cubaan E2E `0c82ab021ee0` terhenti ketika WSL kehilangan sesi, artefak kosong dan unit systemd inactive; tiada keputusan dikira. Cubaan seterusnya hanya dimulakan selepas status terminal disahkan.

### Rekod pelan pengesahan (semua telah diselesaikan)

1. Empty+stress matrix build857 selesai; layout pendek dan draf620 aksara/text scaling125% lulus.
2. Populated matrix24 kes selesai; screenshot375/1366 kedua-dua tema dan kedua-dua surface diperiksa.
3. Semua17 E2E,82 unit, lint dan focused TypeScript lulus.
4. Semua12 profil CPU (6 sebelum/6 selepas) mencapai exact-full-text dan enabled composer, bukan censored.
5. Laporan/manifest selesai; status goal ditutup selepas pemeriksaan akhir. Tiada commit/push/deploy diminta.

## Sejarah pemeriksaan awal

- Goal dicipta melalui tool; status aktif.
- Audit sumber dan tiga assessment bebas selesai; batch edit frontend pertama sudah dibuat, belum disahkan melalui build/render AFTER.
- Build semasa sebelum pembaikan: `receipt-adaptive-build-b5cd5ab8d5cb`.
- BEFORE populated baharu: `receipt-adaptive-tests-4d410fbbd761`, 24 kes/dua tema, screenshot full/floating dilihat. BEFORE empty gagal ketika WSL terhenti; jangan dakwa ia sudah diperiksa. WSL probe `/usr/bin/true` kemudian exit0; build baharu sedang dimulakan.
- Rangka sebelum QA: mesej 14→16px/1.6, composer16px; floating desktop width +32px setiap tier dan target height +40px, sync CSS cap; mobile size policy/avoidance kekal. Fullpage kekal max-w-5xl tetapi log desktop diberi ruang tambahan. Nilai ini belum diluluskan melalui render.
- Punca: `client/src/styles/ai.css` mesej14px, compact helper12px; `AIConversationCard.tsx` settled/streaming14px serta log192–384px; `floating-ai-layout.ts` desktop360–420px dan height492–536px; `FloatingAI.module.css` cap420px/minheight452px.
- Punca tambahan disahkan BEFORE: `FloatingPanelShell` tidak pernah menerima ukuran resolver. Actual desktop380×452 dan mobile420h masih fallback. Batch edit menambah typed CSS custom properties melalui React style seperti TriggerShell; tiada CSP dilonggarkan. Perlu browser strict-CSP untuk mengesahkan wiring.
- Batch edit: mesej/composer16px; full log desktop hingga448px; halaman/card solid neutral; header status+controls berkelompok; wrapping identifier panjang; CSS/JS desktop cap452px; min-heightCSS200 supaya resolver boleh clamp viewport pendek. Mobile sizing policy, request/reveal/permission/auth/backend tidak berubah.
- Ujian SSR baharu `client/src/components/floating-ai-shell-placement.test.tsx` menguji dock/sheet/fullscreen/keyboard inset dan fallback. Satu assertion copy dalam a11y contract dikemas kini mengikut subtitle BM baharu; assertions lain dikekalkan.
- Semak viewport pendek: CSS minheight452 boleh mengatasi resolver. Jangan naikkan floor ini.
- Tema gelap AI sudah neutral; light masih bertindih gradient/blur. Gunakan token permukaan/teks/primary sedia ada, semak kontras Send (kini bergantung pada token public-auth).
- UI copy ialah draft sedia ada. Boleh ringkaskan penerangan AI kepada bantuan koleksi/rekod tanpa janji baharu. Jangan ubah stored/generated messages.

## QA yang perlu selesai

1. Capture dan lihat BEFORE. Edit kecil pada CSS/size presentation/components sahaja.
2. Build, lint, focused TypeScript dan unit geometry/AI message/follow/a11y yang relevan.
3. Capture AFTER pada viewport sepadan 320/375/768/1024/1366/1920 dan kedua-dua tema; nilai computed font, viewport panel, text/controls overflow dan contrast.
4. Uji header panjang, short desktop, sheet/fullscreen, composer, reset/minimize, fokus/Escape, streaming/cancel/retry dan jump-to-latest; hormati reduced-motion. Jalankan kumpulan `impeccable-ai-feedback.spec.ts` yang dibatasi satu surface setiap sandbox.
5. Simpan report/manifest bukti dan kemas kini handoff. Tanda goal complete hanya selepas hasil yang diluluskan siap dan disahkan.

Ujian panjang sedia ada `dashboard scaling and data tables preserve reachable content` sebelum goal ini masih gagal/timeout pada Activity dalam sandbox; rujuk `docs/ui-analysis-scroll-hint.md`. Activity dan Viewer berasingan sudah lulus. Jangan mendakwa keseluruhan CI hijau atau mengubah assertion/timeout untuk menutup isu tersebut.
