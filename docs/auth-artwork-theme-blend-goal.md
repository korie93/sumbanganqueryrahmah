# Ilustrasi auth menyatu dengan tema

Tarikh: 18 November 2026. Branch: `codex/visual-layout-repair`.

## Skop dan punca

Login dan Forgot Password mempunyai gambar dengan kanvas legap putih/gelap. Kanvas tersebut menutup corak dan pencahayaan panel, menghasilkan sempadan petak yang terlihat dalam screenshot lokal sebelum pembetulan. Aset asal, saiz, nisbah, susunan, teks, animasi, backend dan aliran autentikasi dikekalkan.

## Pembetulan

- `client/src/components/auth/AuthBrandArtwork.css`: gabungkan kanvas cerah dengan `multiply` dan kanvas gelap dengan `lighten`, dalam panel yang sudah mempunyai `isolation: isolate`. Tiada filter, mask, library atau aset baharu.
- `client/src/components/auth/AuthBrandArtwork.tsx`: simpan tema bersama frame gambar yang telah dimuat/decoded. Blend mengikuti frame sebenar, supaya gambar cerah yang masih dipaparkan ketika gambar gelap lambat dimuat tidak bertukar menjadi kotak putih.
- `client/src/components/auth/auth-brand-artwork.test.ts`: sahkan atribut tema pada kedua-dua frame.
- `tests/visual/auth-artwork-blend.spec.ts`: enam regresi browser untuk dua halaman, dua tema, empat viewport, serta pertukaran tema dengan muatan gambar ditangguhkan pada CPU 6x.

## Pengesahan

- Unit: 12/12 lulus melalui `node --import tsx --test client/src/components/auth/auth-brand-artwork.test.ts client/src/components/auth/credential-recovery-layout.test.ts`.
- ESLint tertumpu: lulus untuk komponen dan ujian unit yang berubah.
- Build frontend production: lulus, menggunakan Vite dengan output terasing `artifacts/auth-artwork-blend/build`.
- Playwright baharu: 6/6 lulus pada Vite dev dan 6/6 pada build production dengan API sintetik localhost. Tiada akses production.
- Snapshot login sedia ada: 2/2 lulus menggunakan tetapan CI sedia ada (`CI=true`). Perbandingan lokal Windows dengan toleransi lalai lebih ketat gagal sekitar 2% pada teks/font berbanding baseline Linux. Tiada baseline atau threshold diubah.
- Typecheck tertumpu: lulus untuk ketiga-tiga fail TypeScript yang berubah (sandbox run `auth-smooth-tests-71e5e659d98d`, exit 0). Semakan awal mengesan literal fixture Playwright yang diluaskan kepada `string`; diperbetulkan dengan `as const`, tanpa perubahan runtime.
- `git diff --check`: lulus.

Viewport diuji secara automatik: 320, 768, 1366 dan 1920 x 900, kedua-dua halaman dan tema. Tiada overflow mendatar dikesan. Pada telefon, ilustrasi kekal tersembunyi mengikut reka bentuk sedia ada. CPU 6x menguji interaksi pertukaran tema; ia bukan benchmark FPS untuk semua perkakasan.

## Bukti visual

Folder lokal: `artifacts/auth-artwork-blend/` (artifak tidak dimasukkan ke Git).

- Sebelum 1366x900: `before-login-dark.png`, `before-forgot-dark.png`, `before-forgot-light.png`. `before-login-light.png` ditangkap ketika animasi borang belum tamat; hanya digunakan untuk menilai kanvas ilustrasi.
- Selepas matriks viewport: `after-{login|forgot-password}-{light|dark}-{320|768|1366|1920}.png`.
- Screenshot akhir build sebenar 1366x900, keempat-empatnya diperiksa secara visual: `built-login-light.png`, `built-login-dark.png`, `built-forgot-password-light.png`, `built-forgot-password-dark.png`.
- `before-initial.png` ialah kegagalan fixture awal, bukan bukti reka bentuk; jangan gunakan dalam perbandingan.

Keempat-empat paparan build akhir menunjukkan kanvas menyatu dengan panel tanpa menukar ukuran ilustrasi atau borang. Semakan browser Codex tidak tersedia kerana ralat kernel assets; Playwright lokal yang telah dibenarkan digunakan.

## Handoff

Semakan susulan selepas deployment `3e06b210` mengesahkan CSS release itu masih menggunakan fail asal. Build lokal semasa lulus 12 ujian unit dan enam ujian Playwright. Pada 1366px, ujian membandingkan piksel sebenar di empat bucu bitmap dengan panel yang sama ketika gambar disembunyikan (beza maksimum dibenarkan 5/255 setiap saluran). Ujian turut memeriksa bahawa subjek ilustrasi masih kelihatan. Pratonton keempat-empat keadaan ialah `artifacts/auth-artwork-blend/theme-review.png`.

Goal implementasi dan pengesahan lokal selesai.

Belum commit, push atau deploy. Folder tooling untracked yang sedia ada tidak termasuk perubahan ini. Full CI dan typecheck seluruh repositori tidak dijalankan untuk perubahan tertumpu ini; jangan mendakwa keseluruhan suite CI lulus.
