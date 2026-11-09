# Handoff — bold dan kedudukan bacaan AI

Status 9 November 2026: implementasi dan QA terpilih selesai. Typecheck seluruh projek masih perlu CI. Tiada target aktif. Rujuk [laporan akhir](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/docs/ui-ai-chat-reading-basics-report.md).

Workspace C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah. Branch codex/visual-layout-repair; asas Git f5a17b5253b140b45f4d54e4d67c07b82281daaa. Pengguna meminta commit dan push selepas QA. Rujuk Git log dan remote untuk status penerbitan; deployment asas lama sudah selesai sebelum tugas ini.

## Skop yang dikekalkan

- Dua kelulusan terakhir: bold asas jawapan AI dan pulihkan tempat bacaan floating selepas minimize/reopen.
- Empat kawalan sebelumnya turut uncommitted: Stop menyimpan prefix committed sekali; native selection menjeda follow; pengesahan reset hanya untuk draf/AI aktif; pengumuman had aksara pada band 200/50/0.
- Jangan tambah draf persistence merentas minimize atau label Dihentikan. Jangan ubah backend, auth, permission, navigasi, dependency, sanitizer, branding atau CSS global.

## Implementasi

AIMessage membina React strong daripada pasangan marker satu baris selepas sanitizer asal; user/code/marker tidak lengkap kekal literal. Scanner linear, key slot stabil, finalized message ID untuk anchor.

Bookmark satu slot dalam memori provider: follow flag, scrollTop dan ID/offset; maksimum 30 artikel diimbas, ID maksimum 256 aksara. Tiada teks/DOM/storage. Generation menolak cleanup lama selepas reset. useAIMessageFollow memulihkan dalam layout effect, merekod scroll secara pasif dan tidak menimpa bookmark ketika tersembunyi. Panel idle masih unmount; respons aktif ketika tersembunyi kekal satu permintaan. isVisible disalurkan melalui panel/chat/state/effects. Provider key mengikut identiti akaun sedia ada.

## Bukti akhir

| Semakan | Receipt |
| --- | --- |
| 125 unit/SSR/kontrak unik | 5b6d237e738a (123) + a8f26715f2e1 (11, sembilan bertindih) |
| Lint 34 fail | b602f6723acb |
| TypeScript terfokus 33 fail, shell dikecualikan | 3e4cad3e0315 |
| Frontend build semasa | receipt-adaptive-build-9a73086d2958 |
| 12 kes browser baharu + 24 regresi | Semua receipt dalam laporan akhir; kesemua exit 0 |
| CSP hashes / 10 kontrak visual / had bundle | 2c55e49b22c8 / b9df29f6f787 / d2ccda537051 |

19 fail aplikasi berubah sepadan SHA256 dengan manifest unit123 dan build9a. Semua QA browser di atas menggunakan build9a. Jangan guna build6cb sebagai bukti dua ciri baharu.

Native selection akhir b187708d9bf9 membuktikan follow aktif sebelum klik native, pilihan mengikut perkataan pada masa klik, kemudian pilihan kekal dan scroll 3470→3470. Tiga kes reset akhir cb31006b6a73 menunggu fokus Batal secara semula jadi; Escape menutup modal dalaman sahaja. Sumber aplikasi tidak diubah untuk memperbaiki kegagalan fixture. Listener diagnostik dibersihkan dalam finally.

12 screenshot selepas edit benar-benar dilihat: lapan bold full/floating × light/dark × 375/1366px serta empat bookmark sebelum/selepas pada light 1366px CPU4× dan dark 375px CPU6×. Baseline bold full/light 1366px juga dilihat. Bookmark menunjukkan perbezaan 0px berbanding baseline 620px.

## Baki sebenar

Typecheck seluruh projek dan semantik AuthenticatedAppShell perlu CI: percubaan 34 fail a404cec4fa25 kehabisan heap 384MB; had tidak dinaikkan. Semakan terfokus 33 fail bukan jaminan seluruh graf transitif. Jangan dakwa seluruh CI/server build, perkakasan low-spec fizikal, Safari/Firefox, pembaca skrin atau login/pertukaran akaun sebenar telah diuji.

Pengguna telah meminta commit dan push set perubahan ini ke branch semasa. Semak scope dan laporan, jalankan semakan hooks sedia ada dalam persekitaran terasing dan sahkan remote selepas push. Semakan CI penuh masih tertangguh. Jangan stage tooling untracked .agents/.codex/.github/{agents,hooks,skills}/.impeccable, .env, data sebenar atau artifacts. Deployment perubahan baharu memerlukan arahan pengguna.

## Ruang dan sambungan

Halangan cakera dipulihkan melalui native LZX: 524 fail cache/dependency, penjimatan 1,004,237,408 bait, SHA kekal dan sifar pemadaman. Bacaan selepas QA ialah 926,121,984 bait kosong (berubah dengan aktiviti). Rujuk docs/disk-cleanup-20261109.md. Pemadaman cache/ZIP yang ditolak blocked by policy tidak boleh dicuba melalui laluan lain. Jangan padam kod, .env, resit/PDF/Excel/Collection, reka bentuk asal atau release/rollback.

Tooling dipercayai: C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105. Semua project execution melalui sandbox.cjs sedia ada dalam WSL SQR-Audit/bwrap, target bersiri. CPU100%, RAM768MiB/high704, swap0, PID128, file32MiB/tmp256MiB, CPU120s/wall180s, sumber/tools readonly, writes scratch sahaja, loopback sintetik. Tiada install/download/cap increase atau host execution kod projek. Host Git/hash/dokumentasi/OSmetadata dibenarkan.

Keputusan tidak sah untuk dikecualikan: ee66e9183f77 ialah JSON 0 bait akibat ENOSPC. Baseline RED fd83ccc3ae22 dan 5e9d6ee0aa48 sah sebelum pembaikan. Percubaan fixture selection 1bfdc212751e, reset ef59faed383a dan type 0ba0044e3ddd telah dibezakan daripada aplikasi dalam laporan; receipt akhir menggantikannya.

Tiada target atau maintenance aktif selepas pengesahan akhir. Jangan ulang semakan yang sudah lulus tanpa perubahan/kegagalan/keperluan baharu. Tiada goal tool baharu dicipta secara inferens.
