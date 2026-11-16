# Pembetulan smoke UI: kontrak visual auth

## Bukti kegagalan

Run GitHub Actions `43776299622` pada commit `f74bc33a5e109c9c4c5b374d713cd190e18bb1d2`
lulus build-and-test, coverage dan semakan browser V17. Langkah **Run Playwright
visual regression snapshots** gagal: 1,058 lulus, 20 gagal. Log dan screenshot
daripada artifact `14187423144` diperiksa sebelum pembetulan.

## Punca dan perubahan

- `LandingNext` menggunakan `AuthLink`, tetapi pemilikan chunk transitif menarik
  masuk `public-auth-runtime` semasa startup landing. `vite.config.ts` menetapkan
  modul pautan bersama itu kepada `public-runtime`. Route dan paparan auth kekal
  lazy. Regresi pemilikan meliputi path Windows/POSIX dan mengecualikan fail ujian.
- Ujian lama masih menjangka ilustrasi CSS pseudo-element, pemadaman imej ketika
  navigasi, toolbar satu baris pada 320px, alert pada elemen dalaman dan fokus
  pada kad kejayaan. Pelaksanaan auth semasa menggunakan dua imej persisten,
  branding ringkas di bawah 768px, toolbar membalut di bawah 380px, alert luar dan
  fokus tajuk pengesahan. Assertion diselaraskan dengan kontrak tersebut; fokus,
  nilai borang, bilangan API, kontras, keyboard dan accessibility tetap diuji.
- Ujian fokus invalid kini menatal medan ke luar viewport secara eksplisit;
  menatal butang submit sahaja tidak lagi menjamin medan berada di luar paparan.
- Full-page screenshot diambil selepas probe layout shift dikosongkan. Chromium
  mengubah viewport sementara ketika capture, lalu perubahan itu tersalah dikira
  sebagai shift navigasi. Bukti CI menunjukkan shift sebelum navigasi diminta.
  Screenshot dan settling kini mendahului tetingkap ukuran. Syarat jumlah shift
  **tepat 0** tidak diubah.
- Dua baseline login predating shell auth semasa diganti dengan actual screenshot
  CI yang telah diperiksa secara visual: tema cerah dan gelap, 1280×720. Baseline
  lain dan toleransi pixel tidak diubah. Fixture snapshot menetapkan status online
  secara eksplisit supaya status OS tidak mencemarkan screenshot sintetik.
- Fixture startup membenarkan hanya dua path ilustrasi recovery tempatan yang
  diperlukan oleh shell persisten. Ia masih menolak path lain dan akses luar.

Tiada perubahan CSS, reka bentuk, animasi, backend, permission atau data production.

## Pengesahan lokal

Build frontend: `auth-smooth-build-a8bf80e38dbe`, lulus. Semua 20 kes yang gagal
dalam CI lulus semula secara berkelompok menggunakan build tersebut:

| Skop | Kes lulus | Run sandbox |
| --- | ---: | --- |
| Landing full/reduced motion dan login startup | 3 | `49fdc23f15e7` |
| Fokus invalid, clipboard denial, tema ilustrasi recovery | 3 | `1660f8702206` |
| Pengesahan permintaan dan kembali ke login | 1 | `161a52c28fe8` |
| Ilustrasi mengikut tema dan ralat/OTP | 5 | `949fb4529aa4` |
| Kawalan tema, keyboard, WCAG A/AA | 4 | `169573fa2acb` |
| Geometri shell auth cerah/gelap | 2 | `edc1b75b2d17` |
| Snapshot login cerah/gelap | 2 | `a628e9adb9c5` |

ID pendek di atas mempunyai awalan `auth-smooth-tests-`. Semua run dalam jadual
selesai dengan exit 0 dan tanpa kegagalan had sumber sandbox.

Ujian geometri mengukur 28 kombinasi (7 lebar × 2 bahasa × 2 tema), jumlah layout
shift 0. Semakan turut memastikan node branding/toolbar/imej dikekalkan, heading
sejajar, tiada overflow dan kawalan telefon sekurang-kurangnya 44px.

Semakan tambahan:

- 51 ujian pemilikan chunk, fixture auth, view transition dan kontrak memori:
  `auth-smooth-tests-88496b90ffdd`, lulus tanpa skip.
- TypeScript terfokus untuk kesemua 8 fail spec yang berubah:
  `auth-smooth-tests-2f38b3587cca`, lulus menggunakan pilihan compiler CI asal.
- ESLint untuk 8 fail spec tersebut: `auth-smooth-tests-2a08ff1dc07c`, lulus.
  Ini bukan dakwaan typecheck/lint seluruh projek telah dijalankan semula.
- Skrip browser auth V17 penuh: `auth-smooth-tests-aba3c20c9899`,
  `AUTH_V17_BUILT_PASS (38 checks)`, termasuk MFA, recovery/reset dan CSP/Trusted Types.

Ujian menggunakan data sintetik dalam WSL/bwrap tanpa rangkaian luar, satu CPU,
had memori 768 MiB, tanpa swap dan had masa/proses. Satu percubaan menggabungkan
beberapa fail tidak selesai ketika pembersihan proses sandbox; ia bukan keputusan
lulus dan diganti dengan kumpulan kecil di bawah had yang sama. Penyesuaian
online/offline sandbox sama seperti yang didokumenkan dalam
`ci-auth-v17-startup-fix.md`.

Keseluruhan pipeline GitHub Actions, suite 1,078 kes dan Lighthouse belum dijalankan
semula untuk patch ini. Keputusan lokal bukan dakwaan CI remote sudah hijau.

## Semakan commit

Guard rahsia mentafsir dua urutan bait IDAT screenshot gelap sebagai masked
placeholder. PNG tersebut sepadan tepat dengan actual screenshot CI yang disemak:
SHA-256 `8f762976cf7e1a9c7fb1b802438cea57641a32a6454aa12019f829694b9e618d`.
Semakan khusus mengesahkan signature PNG, CRC setiap chunk dan hanya IHDR/IDAT/IEND
(tiada metadata teks). Dua dapatan palsu sahaja diterima untuk hash tepat ini;
guard asal tidak diubah dan fail staged lain tetap melalui pengimbas asal.
