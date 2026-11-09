# CI — WebSocket dalam fixture kesinambungan tema

10 November 2026. Pembaikan dan pengesahan lokal disediakan berdasarkan commit d90a996793d162ccb3a64bb45e389ec2fd26f0ff pada branch codex/visual-layout-repair. Laporan ini merekodkan QA sebelum commit; rujuk Git dan remote untuk status penerbitan.

## Kegagalan yang disahkan

[CI 42644924297](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/42644924297) meluluskan build-and-test dan coverage-gate. Dalam smoke-ui, langkah Run Playwright visual regression snapshots meluluskan 1,049 kes dan menggagalkan satu kes: Shared theme light follows landing, login and workspace while the existing workspace toggle still wins.

Assertion sebenar ialah fixture.unexpected mesti kosong. Nilai yang diterima ialah WebSocket before authentication. Tiada kegagalan perbandingan piksel dilaporkan untuk kes ini.

## Punca dan reproduksi

Fixture menutup setiap WebSocket yang diroute, termasuk sambungan dalam fasa authenticated. Penutupan buatan itu mencetuskan reconnect aplikasi. Ketika POST /api/activity/logout diproses, fixture menandakan sesi tidak authenticated sebelum respons logout diterima dan sebelum protected tree klien dibersihkan. Reconnect yang tercetus oleh fixture boleh tiba dalam sela masa tersebut lalu dicatat sebagai sambungan sebelum authentication.

Reproduksi lokal receipt-adaptive-tests-40a781a6ad7e menangguhkan respons logout sintetik selama 1,500ms. Ia merekodkan satu sambungan /ws ketika authenticated, kemudian satu lagi ketika logout-pending, dengan dashboard masih dipaparkan sewaktu respons tertangguh. Assertion gagal dengan mesej yang sama seperti CI. Ini mengesahkan race yang dicipta fixture; percubaan sambungan sahaja bukan bukti bypass autentikasi backend.

## Pembaikan

Fail tests/visual/public-theme-continuity.spec.ts kini:

- Mengekalkan sambungan WebSocket mock yang sihat terbuka tanpa connectToServer. Tiada server WebSocket sebenar dihubungi.
- Tetap menolak sambungan sebelum login. Selepas login, hanya endpoint same-origin /ws tanpa query dibenarkan. Maksimum 16 percubaan direkodkan.
- Mengira penutupan oleh klien bagi setiap sambungan dan menunggu cleanup selepas logout. Counter idempotent mengendalikan echo penutupan Playwright tanpa menyembunyikan sambungan baharu.
- Menunggu sambungan authenticated benar-benar tersedia dalam aliran tema asal sebelum logout.
- Menyemak unexpected requests dan ralat selepas polling cleanup dan pending requests selesai.
- Menambah regresi logout perlahan dan ujian negatif yang membuktikan guard sebelum login masih menolak sambungan.

Satu percubaan awal selepas pembaikan, f486645f1f7f, mendedahkan pengiraan dua notifikasi bagi satu penutupan mock. Source Playwright menunjukkan closePage boleh menghasilkan echo. Counter kini mengira satu sambungan tertutup secara idempotent; ujian masih memerlukan tepat satu sambungan authenticated dan satu penutupan klien.

Tiada kod aplikasi, auth, backend, database, permission, CSS, navigasi, imej baseline, tolerance screenshot atau polisi retry diubah.

## Pengesahan akhir

Frontend dibina daripada source semasa melalui receipt-adaptive-build-4a87c44113c2. Semua browser target di bawah menggunakan build ini. Prefix receipt ujian ialah receipt-adaptive-tests-.

| Semakan | Keputusan | Suffix receipt |
| --- | --- | --- |
| Logout perlahan | 1 lulus; hanya satu event authenticated /ws dan satu penutupan klien | 223cc4299940 |
| Aliran landing → login → workspace → logout, cerah/gelap | 2 lulus | ef1fe3a40e17 |
| Guard WebSocket sebelum login | 1 lulus; sambungan ditolak dan tiada sambungan authenticated | df769aa98471 |
| Ilustrasi cerah/gelap pada 320, 722 dan 1440px | 3 lulus | 20860c5131c9 |
| Validasi login dan OTP gelap pada 320/1440px | 2 lulus | aef4ab84d6ca |
| Bootstrap dan loader landing | 1 lulus | 7f629c7a0da9 |
| Lint fail fixture | Lulus | 46e933fd752e |
| TypeScript semantik terfokus fail fixture | Lulus | 303f2a6b318f |
| Kontrak visual sedia ada | 10/10 lulus | 4663cebd35ad |

Jumlah 10 kes browser unik lulus. Semua receipt akhir mempunyai exit 0, tiada budget failure dan tiada artifak wajib hilang. Assertion tema, geometri, CSP/Trusted Types dan larangan unexpected requests dikekalkan.

## Batas bukti

Semakan menggunakan frontend sebenar yang dibina, Chromium setempat dan API sintetik pada loopback terasing. Ia mengesahkan lifecycle mock dan guard fixture, bukan handshake 101 atau penguatkuasaan sesi backend. Seluruh suite CI belum diulang selepas patch lokal ini.

Metadata artifak CI menunjukkan ZIP berukuran 137,914,300 bait. Cubaan mengambil hanya bahagian ZIP melalui HTTP Range menerima status 200 dan dihentikan sebelum badan respons dibaca. Tiada ZIP penuh dimuat turun, imej CI diekstrak atau screenshot CI diperiksa. Diagnosis berdasarkan log CI, jejak sumber dan reproduksi browser deterministik. Tiada tuntutan pembaikan visual baharu dibuat; source paparan kekal sama.

Semua target dijalankan bersiri melalui harness WSL/bwrap sedia ada, dengan CPU100%, RAM768MiB/high704, swap0, PID128, CPU120s/wall180s, tmp256MiB dan had fail32MiB. Tiada dependency dimuat turun, had dinaikkan atau rekod production digunakan.

Evidence lokal berada di C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105. Log asal dan metadata CI berada di folder ci-ai-reading-visual-20261110 pada root audit yang sama.
