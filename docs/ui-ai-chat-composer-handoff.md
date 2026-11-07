# Handoff AI chat: composer, format dan retry

Status: **pelaksanaan dan QA lokal selesai**. Tiada commit, push atau deploy dilakukan untuk perubahan ini.

Asas: `a1d577a26ec09e42a9eadd665880e1c13c32568d`, branch `codex/visual-layout-repair`. User meluluskan tiga cadangan dan polish lanjut pada 7 November 2026.

## Hasil dan bukti

1. Composer auto-grow dengan had 5 baris/CSS viewport, shrink selepas clear/send/reset, tanpa polling atau dependency tambahan.
2. Renderer perenggan/senarai/kod yang sama untuk chat penuh dan floating, final serta streaming. Sanitizer dikekalkan. Regression sifar awalan dan nombor permulaan senarai diperbetulkan melalui RED→GREEN.
3. Retry manual berikon bagi ralat transient yang layak, ref satu kali dan guard sesi/mounted/processing. Draf baharu kekal, tiada user message/POST berganda. Auth, permission, 429, gate dan Retry-After tidak menerima retry manual. Timeout, reset, cancel, disable dan unmount diuji.

Stop/New/Latest kekal berikon. Copy atau AI idle tidak ditambah semula. Tiada backend, dependency, API, database, permission, struktur navigasi atau data production diubah.

Laporan penuh: [ui-ai-chat-composer-polish-report.md](./ui-ai-chat-composer-polish-report.md). Hash sumber, args dan resit akhir: [ui-ai-chat-composer-verification.json](./ui-ai-chat-composer-verification.json).

- **163/163** ujian client AI, 29 fail; 2 kontrak CSS turut lulus.
- Lint dan TypeScript semantik terfokus **19 fail** lulus; bukan typecheck seluruh projek.
- Build akhir: `receipt-adaptive-build-1620df963bb5`. Sebanyak 1,425 fail client sepadan dengan binaan, dan 20 fail perubahan sepadan dengan sumber pada 21 resit akhir.
- **36/36** ujian browser lulus: 16 composer (2 surface × 2 tema × 320/375/768/1366px), 14 sempadan retry, serta 6 compact/motion/reading. CPU matriks masing-masing 6×/1×/4×/1×. Screenshot akhir dan pasangan sebelum/selepas pada viewport sama telah dilihat.
- Profil chat penuh 4,000 aksara CPU 6×: sebelum 3,302ms, selepas 3,405ms sehingga seluruh jawapan dan composer sedia. Satu pasangan sahaja; jangan dakwa peningkatan prestasi atau jaminan hardware fizikal.
- `git diff --check` lulus.

## Cara semakan dilaksanakan

Semua pelaksanaan target melalui bwrap WSL `SQR-Audit`, satu job pada satu masa, dengan had asal CPU100%, memory768MiB/swap0, pids128, CPU120s/wall180s. Tiada dependency baharu dimuat turun atau had dilonggarkan. Jangan jalankan projek/ujian/compiler/browser di host Windows untuk menyambung kerja ini.

Harness luaran: `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/`.

- `composer-final-matrix.json`: keputusan unit/lint/types dan 30 kes browser pada sumber akhir.
- `composer-final-qa.json`: compact, motion, reading dan semakan spec tambahan.
- `composer-profile.json`: profil sebelum/selepas.
- `verify-composer-proof.cjs`: audit checksum dan eksport bukti; telah lulus.
- `evidence/receipt-adaptive-tests-<ID>/`: stdout, stderr dan screenshot terpilih yang telah disahkan collector.

Jangan guna matriks lama `composer-matrix.json` sebagai bukti renderer akhir. Driver melangkau args yang sudah lulus; jika kod berubah, bandingkan hash atau buat state baharu. Jangan gandakan job target yang masih hidup.

Browser Codex gagal dimulakan; QA visual menggunakan Playwright lokal/data sintetik yang sudah diluluskan user. Jangan dakwa Browser Codex berjaya digunakan. MagicPath tiada projek aktif; tiada fail/frame Figma diberi atau diubah.

## Pelajaran fixture dan provenance

Kegagalan awal suite sempadan bukan alasan mengubah navigasi SQR. Shell menggantikan AI dengan General Search apabila AI disabled; halaman lazy boleh menyembunyikan subtree AI melalui Suspense sebelum unmount sebenar. Ujian akhir menunggu penggantian selesai dan menggunakan navigation control sebenar. Floating dibuka semula selepas enable.

Baseline sebelum perubahan ialah build `receipt-adaptive-build-ba9692af20a2`. Screenshot full/light/1366 `4cf1720a252d` dan floating/dark/375 `8ed34dfa9a0b`. Katalog sumber per-run floating menjadi 0 bait ketika ENOSPC; ia tidak direka semula. Katalog binaan baseline kekal sebagai provenance. Laporan mencatat batas ini.

Agent `script_ci_review` dan `deployment_review` membantu hook/retry; root mengintegrasi UI, formatter dan browser QA. Review baca sahaja akhir oleh `composer_final_review` tidak menemui kecacatan tambahan. Percubaan agent lebih awal pernah mencapai usage limit; root telah menyelesaikan baki kerja.

## Ruang cakera dan keselamatan fail

User meminta fail sementara/cache dikurangkan tanpa pengesahan berulang. Pemadaman release/cache ditolak semakan automatik (`blocked by policy`); jangan cuba memintasnya. Mampatan NTFS metadata ujian dan tiga dump WSL lama berjaya tanpa memadam atau menukar kandungan logik fail. Dump 2,921,218,928 bait kini menggunakan 405,577,728 bait storan. Selepas QA, C: sekitar 1.2GiB kosong. Tiada kod, `.env`, resit/PDF/Excel atau data Collection dipadam.

Tooling untracked `.agents/`, `.codex/`, `.github/{agents,hooks,skills}/`, `.impeccable/` sudah wujud sebelum task; jangan stage/delete secara pukal. Jangan buka atau commit `.env`.

## Langkah selepas ini

Tiada pembaikan wajib berbaki dalam skop ini. Jika user meminta commit/push, stage hanya 20 fail kod/ujian dalam verification JSON dan tiga dokumen task ini; jangan sertakan tooling atau secrets. Jika kod berubah, jalankan regresi yang berkaitan pada sumber baharu. CI penuh dan production belum dijalankan untuk perubahan ini; tiada kelulusan deploy baharu diberikan.
