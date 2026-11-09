# Handoff — pembetulan CI CSP jawapan AI

Dikemas kini 9 November 2026. Branch `codex/visual-layout-repair`, asas pembetulan `2f3fffb24a4afc1cdca3b65ef7ea0896d547fa54`.

Pembetulan dua kegagalan CI telah siap dan pengesahan terfokus lulus. Pengguna telah meminta commit dan push. Pengesahan workflow penuh pada commit pembetulan perlu disemak melalui GitHub Actions; deployment belum diminta untuk pembetulan ini.

## Perubahan dan punca

Baca `docs/ci-ai-csp-report.md` untuk laporan lengkap. Hanya sumber ujian `tests/visual/ai-reading-polish.spec.ts` berubah. Dua dokumen CI ini juga baharu. Kod aplikasi, CSP, sanitizer, dependencies, backend dan data tidak berubah.

Ujian kestabilan lama sengaja memasukkan HTML dengan handler berbahaya sambil mewajibkan sifar diagnostik CSP. Chrome 156 melaporkan penghalangan handler ketika DOMPurify memprosesnya. Kini ujian kestabilan menggunakan input biasa (sifar diagnostik tetap wajib); dua ujian serangan berasingan mengesahkan output tepat, sifar unsafe DOM/execution/dialog dan diagnostik penghalangan yang terhad kepada sanitizer sebenar. Pengendali laporan CSP fixture mengesahkan POST legacy/Reporting API khusus semasa serangan; laporan lain tetap gagal.

Jangan longgarkan CSP atau menggantikan sanitizer dengan regex. Eksperimen membenarkan BODY dalaman telah ditolak: clone berkurang tetapi diagnostik tidak hilang. Perubahan aplikasi itu telah diundur sepenuhnya.

## CI dan perkara yang masih belum dibuktikan

- Run `42531355557`, job `128887614918`: 1,017 lulus, dua gagal pada assertion sifar CSP dalam ujian kestabilan penuh/terapung.
- Run terkini `42534856877`, job `128898073903`, pada asas `2f3fffb2`: selesai 9 November 08:11 MYT, 1,022 lulus, dua kegagalan sama dan satu flaky. Build/test dan coverage lulus. Pembetulan working tree belum dalam run ini.
- Flaky ialah touch rotation pada `ai-keyboard-viewport.spec.ts:202`: gap bawah 126 px pada cubaan pertama, retry lulus 4.4 saat; fokus/draf kekal. Reflow scroll mungkin mematikan auto-follow, tetapi ini hipotesis tanpa reproduksi. Tiada perubahan scroll, timeout atau threshold dibuat secara spekulatif.
- Workflow penuh selepas pembetulan memerlukan commit baharu dan GitHub Actions. Jangan dakwa keseluruhan CI sudah hijau.

## Bukti akhir

Harness `<h>` = `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105`.

Semua pelaksanaan sasaran hanya dalam WSL SQR-Audit bwrap, satu job bersiri: CPU 100%, RAM 768 MiB/high 704 MiB/swap 0, pids 128, CPU 120 saat/wall 180 saat. Tiada install/download/kenaikan had. Jangan baca .env atau data production. Host hanya operasi fs/Git/hash/report/transport GitHub dipercayai.

SHA-256 fail ujian akhir: `afbaca5caa756c0997e3031026791735136e85d83f8d6d0eb506f705d2639f59`.

- Lint `2e5ecbfab6d5`: lulus.
- TypeScript terfokus `ca19b23652ca`: lulus; bukan seluruh graf projek.
- Unit `cb61bb98c306`: 11/11 sanitizer dan pemformatan lulus; kod aplikasi tidak berubah.
- Kestabilan penuh `fab1b681e9a9` dan terapung `a15476feb228`: lulus pada SHA akhir.
- Keselamatan penuh `1708dca9b76c` dan terapung `3ad69b93b102`: lulus pada SHA akhir. Chromium 148, CSP/native TT, sifar unsafe nodes/execution/dialog dan satu permintaan AI. Browser ini menghasilkan sifar diagnostik/laporan; jangan anggap Chrome 156 juga sifar.
- Microprobe akhir `1c313ccb2d7a`, versi `ai-csp-probe-v3-reporting`, Chrome 156.0.8078.80: 52 kes/dua konteks, 40 event dan diagnostik CSP, dua POST laporan HTTP automatik yang sah, sifar laporan benign/execution/unsafe DOM/external request/page error; browser ditutup bersih. Report-uri sahaja; bukan report-to batching atau seluruh aplikasi.
- Red probe `0546bc0d314d`, eksperimen BODY ditolak `01f77c52eb00`, defense probe `67feeb37600e` dikekalkan. Katalog sumber awal `639385b01190` kosong akibat ENOSPC; jangan gunakan katalog itu sebagai bukti lengkap.
- Percubaan Chrome 156 seluruh aplikasi mencapai had pids/RAM. Jangan ulang tanpa sebab atau menaikkan had. QA aplikasi Chromium 148 dan microprobe 156 mempunyai skop berbeza.
- Hash 2,055 fail aplikasi sepadan build `0ba7d87532bf`; tiada aplikasi berubah untuk dibina semula.

Perintah sasaran (bersiri sahaja):
`node <h>/sandbox.cjs lint tests/visual/ai-reading-polish.spec.ts`
`node <h>/sandbox.cjs types-focused tests/visual/ai-reading-polish.spec.ts`
`node <h>/sandbox.cjs tests client/src/components/ai-message-sanitizer.test.ts client/src/components/ai-message-formatting.test.ts`
`node <h>/sandbox.cjs e2e ai-polish stability full` (atau floating)
`node <h>/sandbox.cjs e2e ai-polish security full` (atau floating)
`node <h>/sandbox.cjs e2e ai-csp probe`
`node <h>/collect.cjs receipt-adaptive-tests-<id>`

Connector GitHub menyediakan fetch_workflow_run_jobs dan fetch_workflow_job_logs. Log berada dalam structuredContent.content; pilih baris berkaitan sahaja, jangan print keseluruhannya.

## Ruang cakera dan Git

C: sekitar 390 MB selepas pemulihan VHD ujian. Tiada kod/data SQR dipadam. Archived journal distro SQR-Audit dibersihkan dan VHD ujian dikompak selepas semua WSL dihentikan. Jangan buat broad cleanup atau memintas penolakan pemadaman terdahulu.

Folder tooling `.agents/`, `.codex/`, `.github/agents/`, `.github/hooks/`, `.github/skills/` dan `.impeccable/` sudah wujud sebagai untracked sebelum tugasan ini; jangan stage secara automatik. Jika pengguna meminta commit/push, pilih hanya fail ujian dan dua dokumen CI yang disenaraikan di atas, kemudian sahkan Git diff dan remote.
