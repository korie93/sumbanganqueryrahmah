# AI chat — ruang bacaan dan status ringkas

8 November 2026. **Siap di lokal**, berdasarkan commit d51edd99c764b78264967d8600f408d0394c1b35. Sebelum receipt-adaptive-build-911dcf1e43c8, selepas receipt-adaptive-build-2e514a2ae3d2. Tiada commit/push/deploy dibuat untuk kemasan ini.

## Hasil yang dirender

1. Anak panah kekal ikon sahaja dan kini terapung di luar log mesej; ia tidak mengambil baris input. Perlindungan fokus selepas Enter dikekalkan. Padding akhir 64px ketika butang dipasang memastikan baris terakhir tidak terlindung selepas aktivasi keyboard. Muka butang legap bertema menghalang teks sejarah kelihatan melalui ikon.
2. Satu kawasan status visual menggunakan keutamaan gate → retry → slow yang aktif → fasa. Status idle kosong. Pengumuman polite/atomic sedia ada dan skeleton tertunda dikekalkan; tiada pertukaran request/queue/retry/cancel logic.
3. Header floating desktop 56→48px, kawalan 32→40px. Penerangan disorok secara visual hanya apabila desktop aktif, sambil mengekalkan ID/aria-describedby. Mobile 56px/fullscreen 64px, penerangan dan kawasan klik 44px kekal.

Tangkapan dibuat pada viewport sama, cerah 1366×900 dan gelap 375×900, untuk halaman penuh dan panel floating, dalam keadaan kosong, beratur dan membaca. Ada 12 tangkapan sebelum dan 12 selepas, menggunakan data sintetik yang sama. Perbandingan ruang log ketika membaca:

| Paparan | Sebelum | Selepas | Ruang dipulihkan |
| --- | --- | --- | --- |
| full light 1366px | 521.40625px | 569.40625px | +48px |
| full dark 375px | 384px | 384px | +0px |
| floating light 1366px | 335px | 387px | +52px |
| floating dark 375px | 539px | 591px | +52px |

Kedudukan Y input sama pada floating dan halaman penuh desktop. Halaman penuh telefon mengekalkan had log 384px sambil mengurangkan tinggi dokumen 56px dengan membuang baris anak panah lama. Dalam binaan akhir, semua 16 ujian layout memeriksa input/log tidak bergerak apabila anak panah muncul, termasuk 320/375/768/1366px pada kedua-dua tema. Overlay boleh berada di atas sejarah ketika scroll; padding akhir dan ujian keyboard melindungi baris akhir, bukan dakwaan tiada sebarang pertindihan kandungan pada setiap posisi scroll.

## Pengesahan

- 80/80 unit/SSR/kontrak; lint dan TypeScript terfokus untuk 8 fail TS/TSX: lulus.
- Build frontend: lulus.
- 45/45 Playwright: 16 layout baharu, 4 set bukti visual dan 25 regresi sedia ada (reading/focus, skrin 450/600px, teks 2×, giliran dengan draf panjang, pengumuman fasa dan sekatan retry).
- 24 kes strict CSP: 0 ralat/violation; 12 paparan axe: 0 violation dalam skop automatik.
- Impeccable detector lima sumber UI: []/exit 0; git diff --check: lulus.

Ujian CPU 4×/6× mengekalkan aktivasi keyboard, fokus/input dan ruang baris akhir. Tiada animasi berfungsi, logo, tema, data, permission, backend, navigasi atau dependency diubah. Tiada library, timer atau animasi JS baharu.

## Fail dan batas

UI: AIChat.tsx, AIJumpToLatestButton.tsx, FloatingAIPanel.tsx, AIConversationCard.tsx dan ai.css. Ujian: ai-space-presentation.test.ts, ui/a11y-contract.test.ts, ai-space-polish.spec.ts dan ai-reading-polish.spec.ts. Kontrak sumber dikemas kini supaya import helper bersama dikenali; ujian draf panjang memeriksa satu status giliran mengikut keutamaan, dengan log >80px, draf dan pemulihan asal dikekalkan.

Semua target dijalankan bersiri dalam sandbox asal, tanpa rangkaian luar; had CPU 100%, memory 768MiB/high 704/swap 0, pids 128, CPU 120s/wall 180s tidak dilonggarkan. Binaan, semua sumber client dan spec akhir dipadankan melalui checksum. Ini QA Chromium lokal/data sintetik; tiada dakwaan full WCAG, FPS 60, hardware fizikal, Safari/Firefox, pertuturan pembaca skrin sebenar, native zoom atau CI keseluruhan. Laporan ini tidak mengaudit atau memberikan skor seluruh SQR.

Bukti: [manifest](./ui-ai-chat-space-polish-verification.json). Handoff: [status](./ui-ai-chat-space-polish-handoff.md).
