# Handoff — kawalan bacaan AI chat

Status 9 November 2026: implementasi dan pengesahan lokal selesai. Rujuk [laporan akhir](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/docs/ui-ai-chat-reading-controls-report.md).

Asas Git `f5a17b5253b140b45f4d54e4d67c07b82281daaa`, branch `codex/visual-layout-repair`. Laporan ini merekodkan QA sebelum commit; pengguna kemudian meminta commit dan push bersama pembaikan bold/bookmark. Rujuk docs/ui-ai-chat-reading-basics-handoff.md dan Git untuk status terkini. Deployment f5a17b52 sebelumnya sudah selesai sebelum tugas ini; jangan anggap kod lokal baharu sudah di production.

## Skop siap

1. Stop mengekalkan prefix committed yang sudah dipaparkan, sekali sahaja.
2. Selection native log menjeda follow; anak panah menyambung bacaan.
3. Pengesahan Sembang Baharu hanya untuk draf bukan kosong atau AI aktif.
4. Pengumuman baki aksara pada band 200/50/0; counter visual tepat.

Tiada backend, permission, navigation, branding, dependency atau CSS global diubah. Jangan masukkan cadangan lama yang belum diluluskan.

## Bukti

- Unit/SSR/kontrak AI 91/91: `41c9fe79c064`.
- Browser 43 kes unik lulus, termasuk 11 baharu. Senarai receipt ada dalam laporan.
- Lint 24 fail: `74337f49628d`; focused TypeScript 24 fail: `437ad8a86531`.
- Frontend build `6cbcd6a0d7a2`, semua 2,023 hash client masih sepadan selepas QA.
- CSP `817fa36be10b`; kontrak visual 10/10 `a3366c959c88`; bundle budget `e811a3289a28`.
- Empat screenshot dialog 320/375/1366px, kedua-dua tema diperiksa. Keyboard 8 kes, CPU 4×/6× lulus.
- Semua target tamat. Tiada proses ujian perlu disambung/dihentikan.

Jika pengguna meminta commit/push, semak diff/status dahulu. Skop: 24 fail TS/ujian dan dua dokumen ini. Jangan stage tooling untracked `.agents`, `.codex`, `.github/agents`, `.github/hooks`, `.github/skills`, `.impeccable` secara automatik. Jangan sertakan `.env` atau data sebenar.

Harness terasing: `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105`. Target hanya melalui `sandbox.cjs`, bersiri: CPU 100%, RAM 768 MiB/high 704 MiB, swap 0, PID 128, CPU 120s/wall 180s; tiada install/download/naikcap, hanya loopback/data sintetik. `collect.cjs` mengambil artifak receipt selesai.

Ruang C: masih kecil. Maintenance jurnal/VHD ujian sudah selesai tanpa memadam data SQR. Jangan cleanup luas. `pause-new-targets.completed-20261109` ialah penanda maintenance selesai, bukan sekatan aktif.

Batas: bukan full-project typecheck/full CI/server build, bukan physical-device benchmark, Safari/Firefox/NVDA/VoiceOver atau ujian production/account switch sebenar. Jangan nyatakan sebaliknya. Tiada goal tool baharu diminta pada giliran ini.
