# Release Verification: picomatch — 18 November 2026

Status: pembetulan sumber lokal dilaksanakan selepas pengguna meminta isu diselesaikan dan goal ditetapkan. Patch upstream masih belum tersedia. Tiada penerimaan risiko untuk pakej asal yang belum ditampal; audit memerlukan bukti integriti patch.

## Bukti

- Run gagal: https://github.com/korie93/sumbanganqueryrahmah/actions/runs/44150619903
- Job `release-readiness` / `134277605604`, langkah 9 `Audit dependencies`, gagal 17 November 2026 18:42 UTC (18 November 02:42 MYT).
- Commit run: `55bdf3b8b824a604a9c501643ca872fd0597bca1`. Run `44087572658` pada commit sama sebelumnya berjaya.
- Log menyenaraikan 12 finding high: picomatch serta fdir, tinyglobby, vite, @vitejs/plugin-react, lint-staged, typescript-eslint dan lima pakej @typescript-eslint.
- `npm audit --package-lock-only --ignore-scripts --json --fetch-timeout=30000 --fetch-retries=0` menghasilkan 12 high, 0 critical, semuanya berakar pada GHSA-fc5q-39xc-vjpf.
- `npm audit --omit=dev --package-lock-only --ignore-scripts --json --fetch-timeout=15000 --fetch-retries=0` menghasilkan 0 vulnerability. Ini audit metadata dependency production, bukan pengesahan keselamatan keseluruhan aplikasi.
- Ujian `scripts/tests/dependency-audit-cli.test.mjs` dan `scripts/tests/dependency-audit-retry.test.mjs`: 77/77 lulus dalam sandbox tanpa rangkaian (run `auth-smooth-tests-35040e6b135e`, exit 0). Gate menolak finding high dan respons audit tidak lengkap seperti yang direka; bukan kegagalan parser/retry CI.

## Punca sebenar

[GHSA-fc5q-39xc-vjpf / CVE-2026-112366](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) disemak/dikemas kini pada 17 November 2026. Advisory meliputi picomatch <=4.0.7 dan menyatakan tiada patched version. Registry npm masih melaporkan latest 4.0.7 ketika semakan ini.

`package-lock.json` sudah menggunakan 4.0.7; tiada patch rasmi lebih baharu untuk dinaik taraf. Kod `analyzeRepeatedExtglob` dalam pakej tersebut mengabaikan sesetengah single-branch repeated extglob yang boleh menghasilkan catastrophic backtracking. Tiada payload eksploitasi dijalankan pada production atau komputer hos.

Semua 12 node terjejas mempunyai `dev: true` dalam lockfile. `deploy/immutable/deploy-release.sh` memasang dependency dengan `npm ci --omit=dev`. Semakan sumber tidak menemui penggunaan langsung picomatch dalam server/client; Vite dan lint tooling menggunakannya secara transitif. Ini mengecilkan skop kepada tooling, tetapi tidak menjadikan kelemahan tersebut telah ditampal.

Cadangan automatik npm untuk Vite 6.2.7, typescript-eslint 8.47.0 dan lint-staged 16.3.4 ialah penurunan versi/pertukaran major; jangan jalankan `npm audit fix --force` tanpa analisis keserasian dan advisory versi lama. PR upstream #194 juga tidak membaiki isu single-branch secara menyeluruh menurut penulisnya.

## Pembetulan yang dipilih

Pengguna meminta alternatif, kemudian meminta pembetulan dilaksanakan. Penggantian terus dengan Minimatch tidak serasi dengan `scan()`/API yang digunakan Vite dan tinyglobby. Pembetulan lebih kecil menggunakan salinan lokal picomatch 4.0.7, dengan pengawal tambahan dalam parser. Nama dan versi upstream dikekalkan untuk mengelakkan amaran disembunyikan melalui penamaan semula.

- `vendor/picomatch/package/lib/parse.js`: repeated extglob yang mengandungi wildcard star diliteralize melalui laluan keselamatan upstream. Escape, quote dan character class dikendalikan berasingan; ordinary glob dan scanner kekal. Had keserasian dinyatakan dalam `vendor/picomatch/README.md`.
- `package.json`, `package-lock.json`: direct dev dependency arkib lokal dan override `$picomatch`; hanya root dev dependency serta satu rekod package berubah dalam lockfile.
- `scripts/lib/picomatch-vendor.mjs`: sahkan SHA-512 arkib, SHA-256 manifest, setiap fail terpasang, tiada fail/salinan tambahan, serta `dev: true`. Kemudian klasifikasikan hanya advisory tepat dan chain yang mewarisinya sepenuhnya sebagai telah dimitigasi.
- `scripts/audit-dependencies.mjs`, `scripts/lib/dependency-audit.mjs`: gate memerlukan bukti tersebut; metadata/transport gagal, advisory lain, checksum berubah dan penggunaan production tetap gagal.
- `.gitattributes`: kekalkan bait vendor untuk checkout Windows/Linux.
- Ujian parser, integriti, audit negatif, pemasangan bersih offline, CLI audit sebenar dan penemuan fail sintetik ditambah dalam `scripts/tests/`.

Raw `npm audit` masih melaporkan 12 high kerana identiti versi upstream dikekalkan. Gate SQR mengakui patch yang disahkan, bukannya mendakwa registry sudah bersih. Tiada `npm audit fix --force`, downgrade Vite atau penurunan threshold.

## Bukti regresi dan handoff

- Baseline sandbox `auth-smooth-tests-cddd722cda17`: 1 gagal / 1 lulus; parser asal menerima bentuk wildcard berulang yang sepatutnya dilindungi. Hanya input pendek diuji.
- Selepas patch `auth-smooth-tests-003f9aa4ed5f`: kedua-dua ujian parser/API lulus.
- Kumpulan audit/pemasangan/parser/minimatch `auth-smooth-tests-13f0b00c1a95`: 174/174 lulus, termasuk `npm ci --offline --ignore-scripts` pada fixture bersih dan CLI sebenar.
- Suite tambahan glob mula-mula terhenti kerana snapshot sandbox tidak menyertakan `test-exclude`. Selepas memasukkan dependency ujian sedia ada secara baca sahaja, keempat-empat semakan lulus dalam `auth-smooth-tests-0709203ca22c`.
- Build frontend production sandbox `auth-smooth-build-3f2c9a08db79`: lulus. Tiada rangkaian/production digunakan oleh proses target.
- Parser akhir merekodkan kedudukan wildcard semasa token dibina. Keputusan menggunakan tafsiran parser yang sama untuk escape, petikan dan kelas aksara. Hanya `lib/parse.js` berbeza daripada pakej upstream yang terpasang. Kesemua sepuluh fail dalam arkib sepadan dengan sumber vendor dan manifest.
- Suite akhir `auth-smooth-tests-b36cdc89521e` lulus 175/175. CLI audit diuji dengan respons registry yang dirakam daripada kegagalan sebenar. Ia lulus dengan patch yang sah dan gagal apabila fail parser diubah. Dalam fixture pemasangan bersih, `npm ci --omit=dev` meninggalkan `picomatch` di luar pemasangan.
- Build frontend production akhir `auth-smooth-build-09d19de50b51` lulus. Ujian visual login cerah dan gelap `auth-smooth-tests-7b4d65ec62da` lulus pada build tersebut. Audit metadata production pada lockfile akhir melaporkan sifar dapatan di semua tahap.
- Ujian browser tujuh modul selepas login lulus pada build akhir dalam `auth-smooth-tests-a74169032218` menggunakan sesi sintetik. Ujian login dan modul dijalankan dalam proses berasingan selepas percubaan gabungan terdahulu mencapai had memori sandbox.
- Semakan registry selepas pembungkusan akhir menghasilkan 12 dapatan yang sama dengan fixture audit. Ambang CI kekal. Pengesahan GitHub Actions untuk perubahan ini menunggu push.
- Lint client dan server dengan pakej akhir lulus dalam `auth-smooth-tests-7fd97da00199`.

Jangan gunakan host `node_modules` lama sebagai bukti patch telah dipasang. Ujian menggunakan mount read-only patch dan pemasangan arkib bersih dalam scratch. CI perlu `npm ci` seperti biasa. Arkib vendor dibawa bersama release melalui langkah pembungkusan `vendor` sedia ada; pemasangan production kekal `--omit=dev`.

Belum commit/push/deploy. Gantikan patch lokal dengan release rasmi apabila tersedia dan ulangi regresi yang sama. Ini pembetulan advisory tertentu, bukan audit menyeluruh semua glob/regex.

Perubahan ilustrasi auth yang belum commit adalah kerja berasingan dan tidak menyebabkan kegagalan ini.
