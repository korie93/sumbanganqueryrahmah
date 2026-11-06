# AI Chat — kawalan ringkas dan ruang mengikut kandungan

> Rekod sejarah. Arahan terkini6 November2026 membuang butang Copy/Salin. Status versi semasa berada dalam [ui-ai-chat-no-copy.md](ui-ai-chat-no-copy.md); bukti Copy dalam laporan ini hanya untuk build9f terdahulu.

**Status akhir: implementasi dan QA selesai.** Rujuk `docs/ui-ai-chat-compact-report.md` dan `docs/ui-ai-chat-compact-verification.json` untuk keputusan akhir build9f129b8119be:94 unit/skrip,29 browser,48 render +24 stress,32 screenshot,16 scan axe dan6 profil CPU. Semua catatan “sedang berjalan” di bawah ialah sejarah semasa pembangunan, bukan status semasa. Goal ditutup selepas semakan completion akhir. Tiada commit/push/deploy diminta.

6 November 2026. Sambungan kepada kemasan bacaan16px. Pengguna meluluskan kawalan mengikut keadaan, Salin Jawapan dan Ctrl/Cmd+Enter; meminta ikon Stop sahaja serta susunan/tinggi/jarak yang tidak membazir ruang.

## Skop dan arah

Kekalkan SQR, dua tema,16px/1.6, navigasi, auth, permission, backend, sanitizer dan lifecycle permintaan. Tinggi resolver menjadi cap dock/sheet; kosong dan jawapan pendek menggunakan tinggi semula jadi, panjang menatal di log. Fullscreen telefon kecil/keyboard kekal menggunakan ruang viewport sebenar. Tiada observer atau pengukuran JS setiap chunk baharu.

Hantar dan Stop menggunakan satu slot44px. Stop mempunyai ikon square sahaja, nama aksesibel dan tooltip. Hantar kosong/whitespace disabled pada kedua-dua permukaan; Reset/Sembang Baharu muncul apabila ada perbualan. Footer Stop berasingan dan tip berulang dibuang. Tindakan salin kecil hanya pada mesej pembantu yang sudah dimasukkan ke sejarah, bukan paparan streaming. Clipboard ditulis selepas klik sahaja; sifar awal dan newline dikekalkan, dengan feedback BM dan pemulihan manual jika ditolak. Keyboard shortcut hanya pada textarea, menghormati Enter biasa, IME dan repeat.

Steering tambahan pengguna: butang “Ke mesej terkini” hanya ikon anak panah bawah. Label aksesibel, tooltip, ariacontrols serta pengekalan fokus keyboard dikekalkan. Header fullpage status/reset diletakkan dalam satu baris; status boleh membalut di dalam ruangnya.

Steering berikutnya: Sembang Baharu juga ikon sahaja (SquarePen), termasuk reset panel. Nama aksesibel dan callback reset sedia ada dikekalkan. Reset dan minimize panel menggunakan saiz yang sepadan. Perubahan ikon ini memerlukan build/capture akhir baharu; keputusan buildd874/360 di bawah ialah sejarah sebelum steering ikon, bukan kelulusan akhir.

Steering terkini: tiada teks/bar “AI idle”; hanya status proses/masalah dipaparkan. Butang ikon setempat menggunakan saizsm dengan dimensi eksplisit supaya native tooltip tidak digugurkan oleh komponen Button global; Button global tidak diubah. Semakan regresi juga menguji title sebenar pada DOM.

## Sambungan paling terkini selepas semua steering ikon

Build `receipt-adaptive-build-9f129b8119be` lulus. Ini versi semasa: Stop, Hantar, Sembang Baharu/reset dan Jump hanya ikon; tiada AI idle. Pipeline `finish-ai-compact.cjs` sedang menjalankan checks → scripts → empty/populated matrices → compact12 (termasuk screenshotStop/Copy dan assertikon) → readability9 → feedback8 → CPU6. Hasil terakhir dan status setiap langkah disimpan dalam fail `ai-compact-finish-<timestamp>.json` di folder orchestrator. Jangan memulakan sandbox lain sewaktu ia aktif. Akses unit service sebenar/handle proses untuk menentukan sama ada masih berjalan; jangan restart hanya kerana polling senyap.

Pipeline terdahulu `ai-compact-finish-1793967916468.json` berhenti pada source guard sebelum readable kerana steering UI baharu tiba semasa QA. Itu bukti semakan build menghalang penggunaan bundle lapuk, bukan kelulusan versi semasa. Capture dan screenshot sebelum steering kekal sejarah sahaja. Verifier akhir `verify-ai-compact.cjs <empty-run-id> <populated-run-id>` memerlukan build9f, semua kelompok lengkap,91+3 unit/script,29 browser,48+24 layout/stress,16 axe,6 CPU serta16 screenshotStop/Copy, dan hash sumber semasa. Jangan tanda goal selesai sebelum verifier dan semakan visual akhir lulus.

## Status semasa

Implementasi selesai; QA masih berjalan. Tiada commit/push/deploy diminta. Worktree juga mengandungi perubahan layout terdahulu; jangan reset/stash/padamnya.

Goal baharu telah dicipta atas permintaan pengguna pada6 November: siapkan keseluruhan skop kemasan ini, buktikan render/regresi serta simpan manifest/handoff untuk akaun lain. Status aktif sehingga pengesahan akhir lengkap.

Keputusan terkini: compactfull6/6 (`1f962859a38b`) danfloating6/6 (`4ae00d10d0b8`) lulus pada buildd874.91 unit lulus (`8033db03ef9b`), lint (`aae67363fe43`), focusedTypeScript13 fail (`0c480fee247a`). Native detector8 fail UI akhir exit0 `[]`. Ujian kontrak CSS pada run `15784e43ff67` mengunci formula fixed max-height lama; assertion dikemas kini kepada cap `min(resolverHeight, viewportBound)` sambil mengekalkan fallbackvh/svh/dvh dan fullscreen. Ujian browser sebenar membuktikan tinggi semula jadi dan bounded long-content; kontrak baharu lulus. Jangan anggap run terdahulu90/91 sebagai lulus.

- BEFORE sah: build `receipt-adaptive-build-857c654dea2f`; populated `bee6f65c6b90`, empty `e07247cba648`. Hash sumber ketika mula disahkan sama melalui verifier goal terdahulu.
- Build terbaru `receipt-adaptive-build-d8742551a53d` lulus.
- Empty capture pertama `52f8bddec988` pada build1df:24 render asas bersih dan8 screenshot dilihat (termasuk review bebas). Full log kosong20px desktop; floatingdesktop298px berbanding532px dahulu. Dua kegagalan ialah harness stress lama yang mencari teks Hantar selepas ia menjadi ikon; selector sudah dibetulkan kepada nama aksesibel. Jangan kira keseluruhan run itu sebagai lulus.
- E2E red `cb52886ee5d9`: native-disabled clipboard ketika pending menghilangkan fokus. Punca dibetulkan dengan aria-disabled+guard pending supaya tombol kekal focusable, tanpa panggilan clipboard berulang. Ujian diperkukuh menggunakan promise clipboard tertangguh, duplicate activation, kejayaan dan penolakan.
- E2E targeted `609b7f149a0a`, floatinglight375:1/1 lulus, termasuk kosong/short/long, iconStop,Ctrl/MetaEnter/IME, clipboard pending/retry/focus dan reset. Dua suite6+6 kini berjalan melalui `ai-compact-checks.cjs compact`; semak metadata/handle terkini sebelum memulakan sandbox lain.

## Pengesahan yang perlu lengkap

1. Semua12 regresi compact,91 unit/kontrak, lint dan focusedTypeScript.
2. Matriks akhir empty/populated pada320/375/768/1024/1366/1920 dalam dua tema; screenshot375/1366 diperiksa, axe/CSP/kontras/overflow disahkan. Tambah populated landscape740×360/320×360/1366×480/375×560; empty text scaling125% dan draf panjang.
3. Ujian follow/jump/reducedmotion/cancel/retry/reset asal dan9 readability; periksa keyboard code focus semasa streaming masih selamat.
4. Profil sintetikCPU yang dibatasi jika perlu; jangan mendakwa ujian perkakasan sebenar atau keseluruhanCI.
5. Simpan manifest akhir sumber/hash/runID dan kemas kini status dokumen ini dengan keputusan sebenar.

Semua app/build/tests/Chromium hanya dalam WSL SQR-Audit bwrap sedia ada; tiada pemasangan/download atau akses production. Orchestrator dipercayai: `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105`. Satu job sandbox pada satu masa, had sumber asal. Native Impeccable detector hanya membaca sumber. Browser sintetik setempat telah dibenarkan pengguna.
