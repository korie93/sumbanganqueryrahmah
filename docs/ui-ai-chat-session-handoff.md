# Handoff — sesi panjang, notifikasi Q dan header cerah

9 November 2026. **Selesai lokal** selepas commit induk 8c656153 pada codex/visual-layout-repair. Perubahan baharu belum di-commit, di-push atau di-deploy.

[Laporan](ui-ai-chat-session-report.md) · [Manifest](ui-ai-chat-session-verification.json)

Binaan akhir receipt-adaptive-build-0ba7d87532bf; 104 ujian unit, 18 ujian Playwright, lint dan TypeScript terfokus pada enam fail serta tiga profil akhir selesai. Verifier dipercayai `<h>/verify-ai-session.cjs` memadankan sumber dan artifak. <h> = C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105. Tiada pelaksanaan target yang masih perlu diulang untuk skop pengesahan ini.

Skop diluluskan: uji sesi panjang dan notifikasi Q serta baiki warna header tema cerah. Tiga fail aplikasi: _ai.css (dua token header cerah → ai-surface-bg), useFloatingAIBehaviorState (snapshot Set ID terhad) dan helper ai-chat-unread. Empat fail ujian: unit helper, kontrak hook, browser header dan browser unread. Pengekalan draf apabila panel dikecilkan tidak diubah. Backend, auth, pemilik, permission, navigasi, sanitizer dan animasi dikekalkan.

Semua keputusan, profil, ukuran mentah dan cubaan gagal disimpan. Bukti header neutral sebelum pembetulan: dcd938e1197a; regresi merah pada had sejarah: 6bedc47cb4ed; baseline sesi panjang selepas pembetulan harness: d49347bc3f69. Cubaan separa 7474119d162f gagal pada andaian butang Back; cubaan header 17515d4212f0 gagal pada tooltip fokus. Kedua-duanya ialah kesilapan harness yang telah direkodkan. Cubaan akhir d0623b77ce4f gagal bootstrap tanpa punca muktamad; ulangan pada had sama berjaya. CPU 6× gabungan e6325c7299e1 mencapai had CPU asal; profil akhir 1950c2513843 mengasingkan 40 pertukaran sahaja dan lulus. Kitaran buka semula/navigasi hanya dituntut bagi CPU 1×. Had tidak dinaikkan.

Jangan dakwa tiada kebocoran memori atau isu bacaan Chrome 159 MB sudah selesai: heap halaman selepas GC melalui CDP bukan RSS. Ujian tidak meliputi perkakasan fizikal, penggunaan berjam-jam, keseluruhan CI, TypeScript penuh, log masuk atau pertukaran pemilik sebenar, mahupun pelaksanaan StrictMode. Pemulaan snapshot pemilik hanya diuji secara unit; pemasangan semula dalam browser hanya melibatkan AIChat. Punca perubahan kecil pada heap dan kesan pemuatan modul navigasi belum dikenal pasti sepenuhnya.

Jika pengguna meminta commit, stage hanya tiga fail aplikasi, empat fail ujian dan tiga dokumen tugas ini. Tooling tidak dijejak dalam .agents/.codex/.github/.impeccable mendahului tugas ini dan mesti dikekalkan. Jangan ulang matriks lama hanya kerana akaun bertukar; semak hash dahulu. Deploy memerlukan arahan tersendiri.

Semua pelaksanaan target Node/npm/tests/build/Chromium mesti berjalan bersiri dalam SQR-Audit WSL bwrap, dengan CPU 100%, memori 768 MiB/high 704/swap 0, pids 128, masa CPU 120 s dan masa sebenar 180 s. Tiada pemasangan, muat turun atau kenaikan had; host dipercayai hanya mengendalikan fs/Git/hash/JSON/laporan. Tiada akses .env, production atau data sebenar. Ruang cakera C terhad; jangan padam fail atau memintas penolakan terdahulu.
