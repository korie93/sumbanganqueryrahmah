# Handoff — papan kekunci telefon dan AI chat

8 November 2026. **Selesai lokal** untuk skop yang diluluskan. HEAD d51edd99, branch codex/visual-layout-repair; kerja belum commit/push/deploy.

[Laporan penuh](ui-ai-chat-keyboard-report.md) · [Manifest](ui-ai-chat-keyboard-verification.json)

Binaan asas receipt-adaptive-build-320a602dac40; binaan akhir receipt-adaptive-build-9ce944157f66. Verifier dipercayai `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/verify-ai-keyboard.cjs` mengesahkan sumber dan artifak: 68 ujian unit, 22 Playwright, lint dan TypeScript terfokus untuk 7 fail. Semua 7 fail aplikasi disenaraikan dalam laporan. Sumber akhir telah dipadankan dengan setiap job akhir.

Punca: visual viewport berbeza daripada layout viewport, peranti sentuh dalam landskap berada di luar breakpoint global, override CSS desktop, ukuran textarea mendahului perubahan had tinggi CSS oleh parent, dan log tidak mengikuti hujung apabila tinggi berubah. Pembetulan: satu snapshot media query chat; viewportHeight/inset digunakan sekali; CSS fullscreen/compact/safe; ResizeObserver log yang menghormati bacaan terdahulu; serta panelHeight → layoutKey untuk mengukur selepas React menerapkan perubahan parent pada DOM. RO textarea asal yang memerhatikan lebar sahaja dikekalkan. Guard overflow percubaan sudah diganti dan tidak ditinggalkan dalam implementasi.

Ujian draf dua baris memerlukan Home dahulu sebelum End untuk benar-benar menggerakkan caret; Ctrl+End pada caret yang sudah di hujung boleh menjadi no-op. Ujian akhir turut mengesahkan kotak input membesar semula apabila had tinggi bertambah. Semua iterasi gagal disimpan; jangan labelkannya sebagai lulus.

Iterasi TypeScript terfokus 1a037384c206 ialah kegagalan jenis Locator pada ujian sahaja. Cast HTMLTextAreaElement yang eksplisit membetulkannya; keputusan akhir TypeScript menggunakan sumber ujian yang telah diperbetulkan.

Jangan ulang matriks lama hanya kerana akaun bertukar. Baca laporan dan semak hash sebelum menyambung. Tiga kerja space/response/input-performance terdahulu kekal selesai dan belum dikomit; laporan input-performance merujuk binaan lamanya sebagai rekod sejarah. Skop sesi panjang/memori belum diluluskan.

Jika diminta commit, semak diff gabungan dan stage hanya fail aplikasi/ujian/dokumen berkaitan. Jangan stage tooling `.agents/.codex/.github/.impeccable` yang sudah untracked sebelum tugas. Deploy perlu arahan berasingan.

Semua target Node/npm/tests/build/Chromium hanya dijalankan secara bersiri dalam SQR-Audit WSL bwrap; had CPU 100%, memori 768 MiB (high 704 MiB), swap 0, pids 128, CPU 120 s/wall 180 s. Tiada pemasangan, muat turun atau peningkatan had. Host dipercayai hanya digunakan untuk fs/Git/hash/JSON/laporan. Jangan baca .env/data produksi atau padam fail untuk cuba memintas penolakan terdahulu.

Had: semua keyboard, anjakan viewport dan safe area ialah simulasi Chromium dengan data sintetik, bukan papan kekunci OS atau peranti fizikal. Tiada jaminan bagi Safari/Firefox, pinch zoom, tablet besar, semua anchor selepas teks berbalut semula, FPS atau perkakasan sebenar. Tiada semakan TypeScript seluruh projek, keseluruhan CI atau akses produksi.
