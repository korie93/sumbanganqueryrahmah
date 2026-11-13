# Laporan peralihan auth SQR

14 November 2026. Draf berdasarkan bukti dalam [handoff](auth-smooth-transitions-handoff.md), audit asal `auth-smooth-tests-df35d8a8dc3e` dan diagnostik susulan hingga `auth-smooth-tests-bac327c1d924`. Penerimaan prestasi Fasa 10 belum lulus; siasatan punca dan audit akhir masih berjalan. Branch: `codex/visual-layout-repair`. Asas perbandingan: `54a99feb6cc95b822d665130d64034449080cdf2`.

## Skop dan status

Perubahan terhad kepada paparan `/login`, `/forgot-password` dan peralihan masuk/keluar landing. API/payload auth, sesi/JWT, validasi, rate limit, permission, URL dan copy maklum balas dikekalkan. Tiada dependency baharu, akses production, push atau deploy.

Fasa 1–9 telah dilaksanakan; Fasa 1 memang tidak memerlukan commit. Kriteria long task dan masa keseluruhan native API gagal dalam audit asal dan masih gagal pada ketiga-tiga profil direct 1×/4×/6× walaupun tiada event `memory.high`. Checkpoint Fasa 10 merekodkan pembaikan susunan baca/tulis landing, ujian dan hardening fixture; build `auth-smooth-build-be1c5a9d1e76` lulus dalam 16.438s, bersama kontrak, typecheck terfokus, lint sumber client dan lima regresi landing. Tiada bukti peningkatan prestasi yang muktamad daripada pembaikan ini. Hasil belum siap sepenuhnya untuk penerimaan.

## Commit mengikut fasa

| Fasa | Commit | Mesej |
| --- | --- | --- |
| 2 | `baac8b8f` | `chore(auth-ui): add motion tokens and reduced-motion guard` |
| 3 | `5b251502` | `refactor(auth-ui): persist auth layout across login and forgot-password` |
| 4 | `e683e1ab` | `fix(auth-ui): anchor form slot to stop vertical jump between routes` |
| 5 | `0da0e16d` | `feat(auth-ui): smooth login/forgot-password transition with view transitions` |
| 6 | `137f6f22` | `feat(auth-ui): crossfade brand illustration without pop-in` |
| 7 | `b6802756` | `feat(auth-ui): polish inputs, buttons, loading and status transitions` |
| 8 | `33646101` | `feat(auth-ui): fade transition between landing and auth pages` |
| 9 | `07382370` | `fix(auth-ui): collapse brand panel on small screens and clean up helper text and gradient` |
| 10 | Checkpoint sumber; hash dalam sejarah Git | `fix(auth-ui): address verification findings`; pembaikan dan hardening fixture disahkan secara terfokus, tetapi kriteria prestasi ketat dan full-project TypeScript masih terbuka. |

Setiap commit Fasa 2–9 mempunyai build frontend yang lulus. Resit setiap fasa dan sejarah percubaan yang gagal disimpan dalam handoff; kegagalan persediaan, ujian fixture dan kegagalan aplikasi dibezakan di situ.

## Fail yang berubah

Laluan berikut relatif kepada root repositori. Fail ujian visual dan diagnostik disertakan dalam checkpoint Fasa 10 untuk sambungan kerja.

| Tujuan | Fail |
| --- | --- |
| Entry dan penghalaan awam | `client/src/App.tsx`, `client/src/app/lazy-pages.tsx`, `client/src/app/usePublicAppState.ts`, `client/src/pages/AuthEntry.tsx` |
| Shell dan ilustrasi | `client/src/components/auth/AuthV17Layout.tsx`, `client/src/components/auth/AuthV17Layout.css`, `client/src/components/auth/AuthBrandArtwork.tsx`, `client/src/components/auth/AuthBrandArtwork.css` |
| Pautan, peralihan dan ketibaan fokus | `client/src/components/auth/AuthLink.tsx`, `client/src/components/auth/AuthFormView.tsx`, `client/src/components/auth/auth-view-transitions.css`, `client/src/lib/view-transition.ts`, `client/src/lib/auth-navigation-preload.ts`, `client/src/lib/public-auth-arrival.ts` |
| Borang dan keadaan ralat | `client/src/pages/Login.tsx`, `client/src/pages/Login.css`, `client/src/pages/ForgotPassword.tsx`, `client/src/components/auth/AuthError.tsx`, `client/src/components/auth/AuthError.css` |
| Landing dan CSS bersama | `client/src/pages/landing-next/LandingNext.tsx`, `client/src/pages/landing-next/useLandingNextMotion.ts` (checkpoint Fasa 10), `client/src/public-shell.css`, `client/src/styles/tokens/_animations.css` |
| Ujian unit/SSR/kontrak | `client/src/lib/view-transition.test.ts`, `client/src/components/auth/auth-brand-artwork.test.ts`, `client/src/components/auth/credential-recovery-layout.test.ts`, `client/src/app/public-auth-memory-contract.test.ts`, `client/src/app/landscape-overflow-contract.test.ts`, `client/src/pages/login-a11y-navigation-contract.test.ts`, `client/src/pages/public-auth-neutral-presentation.test.ts`, `client/src/pages/landing-next/landing-next-contract.test.ts` |
| Ujian browser baharu | `tests/visual/auth-smooth-transitions.spec.ts` |
| Diagnostik sementara | `tests/visual/auth-smooth-direct-performance.mjs`, dipanggil hanya dalam runtime audit sedia ada |
| Keserasian ujian browser sedia ada | `tests/visual/brand-logo.spec.ts`, `tests/visual/favicon-status.spec.ts`, `tests/visual/landing-next.spec.ts`, `tests/visual/public-auth-recovery-feedback.spec.ts`, `tests/visual/public-auth-reset-illustration.spec.ts`, `tests/visual/public-auth-theme-controls.spec.ts`, `tests/visual/public-theme-continuity.spec.ts`, `scripts/landing-v21-built-browser.mjs` |
| Dokumentasi | `docs/auth-smooth-transitions-handoff.md`, `docs/auth-smooth-transitions-report.md` |

Tiada aset ilustrasi asal diganti. Kemas kini kontrak sumber dihadkan kepada struktur atau import yang berubah secara sengaja; pemeriksaan lain, larangan import service dan pemeriksaan rahsia dikekalkan.

## Default dan keputusan pelaksanaan

- Gunakan CSS dan native View Transitions dengan feature detection. Token 150/260/360ms ditambah pada `_animations.css`, iaitu stylesheet global yang memang diimport aplikasi. Tiada library animasi ditambah.
- Kekalkan callback penghalaan awam dan `replaceState` sedia ada. `AuthLink` menyediakan `href` sebenar serta mengekalkan modified-click, middle-click, target, download dan `defaultPrevented`. Penyegerakan `popstate` terhad kepada tiga route awam ketika anonymous, tanpa menulis history atau mengubah sesi.
- Parent auth-family kekal; borang sahaja bertukar. Preload dibuat atas intent pengguna, dengan pembatalan intent lapuk dan perlindungan unmount. Pengawal native transition mengendalikan pertindihan, pembatalan history dan rejection tanpa mengulang callback navigasi.
- Fokus heading selepas ketibaan route, dengan first mount dilangkau. Autofokus username pada document load dibuang; fokus validasi, MFA dan tindakan kekal. Pengesahan recovery menghormati pengguna yang sudah memindahkan fokus ketika request pending; Back link kekal sebagai DOM node yang sama.
- Utamakan peraturan keras `opacity`/`transform` berbanding contoh animasi warna/shadow dalam spesifikasi. Focus ring berubah serta-merta, 0ms. Pengecualian tunggal ialah reveal ralat menggunakan `grid-template-rows`; hover dikawal oleh media query dan reduced motion dihormati. Tiada cabang UI atau animasi ditambah berdasarkan kewujudan akaun recovery.
- Kedua-dua imej asal berada dalam panel persisten. Frame bermula tanpa imej aktif sehingga decode; kegagalan sumber boleh dicuba semula pada lawatan tema yang disengajakan. Warna latar tambahan mengikuti scene yang sudah decoded melalui opacity sahaja.
- Bawah 768px, gunakan logo dan tagline asal sebagai header compact, sembunyikan ilustrasi dan gunakan teks borang/kawalan 16px. Tablet menggunakan 40/60; desktop menggunakan kira-kira 1.15/1 dengan slot 24rem. Reserve slot telefon dinaikkan kepada 35rem, atau 37rem bawah 360px, selepas ujian menemui footer bergerak. Toolbar dua baris digunakan bawah 380px.
- Tiada copy pemasaran atau supporting sentence baharu dicipta. Blueprint grid yang diminta secara jelas dikekalkan bersama palet incumbent.
- Pembaikan Fasa 10 mengumpulkan bacaan scroll/viewport/section/hero sebelum penulisan progress, kelas toTop, transform/opacity mark dan state React. Nilai, timing, gerakan, callback serta aliran pengguna dikekalkan. Ini mengelakkan interleaving baca/tulis dalam callback yang dikenal pasti; ia belum membuktikan peningkatan prestasi keseluruhan.

## Sebelum dan selepas: enam isu asal

| Isu | Sebelum | Selepas dan bukti |
| --- | --- | --- |
| Navigasi terputus mendadak | Pertukaran auth dan landing menggunakan hard cut. | Auth menggunakan native keluar 140ms/masuk 260ms dengan delay 80ms; motion CSS masuk tamat 340ms dan jarak maksimum 10px. Landing menggunakan fade opacity 240ms. Fallback auth enter 260ms; page boundary unsupported/reduced berlaku serta-merta. Tempoh CSS ini lulus pemeriksaan, tetapi masa keseluruhan native API dalam run Fasa 10 melebihi had; lihat jadual prestasi. |
| Brand panel remount/pop-in | Dua lazy page masing-masing membina layout, toolbar dan lifecycle panel. | Shell dan toolbar persisten; identiti DOM disahkan ketika login⇄forgot. Dua imej bertindih dalam frame sama, crossfade 360ms selepas decode. Ujian rangkaian berpagar dan retry sumber lulus. |
| Kedudukan heading melompat | Baseline sebenar berbeza pada desktop: Y pada 1440px ialah 189.28125/231, dan pada 768px ialah 275.453125/247. | Heading kedua-dua route sepadan dalam toleransi ±1px pada tujuh lebar, kedua-dua tema dan BM/EN. Slot dan footer stabil. Baseline telefon yang diukur sudah mempunyai heading Y sama; jangan dakwa pembaikan beza yang tidak diukur di situ. |
| Susun atur telefon | Header lama tinggi dan ilustrasi masih dipaparkan; breakpoint lama 700px turut mengekalkan split pada 700–767px. | Header compact bawah 768px; ilustrasi disembunyikan, teks borang/kawalan 16px dan sasaran kawalan sekurang-kurangnya 44px. Ujian tujuh lebar mengesahkan tiada overflow dan art desktop tidak terpotong. Back pada 360px kini satu baris dan telah diperiksa secara visual. |
| Helper recovery kelihatan seperti field | Nota enumeration dipaparkan sebagai kad berbingkai/berlatar. | Nota menjadi teks muted dengan ikon Info di bawah input; copy asal sama. Input sentiasa merujuk `forgot-password-identifier-hint` dan turut merujuk id ralat ketika invalid. Ujian helper/ARIA lulus. |
| Banding/latar ilustrasi | Lapisan linear dan crop/position berlainan menonjolkan perbezaan panel. | Latar radial lembut dan frame bersama menggantikan susunan lama, dengan ruang untuk curve. Sempadan canvas recovery gelap masih boleh dilihat kerana latar dalam raster asal; aset tidak menjadi transparent dan hasil tidak didakwa sempurna tanpa sempadan. |

CLS yang diperhatikan ialah 0 sebelum perubahan pada baseline asal dan 0 dalam ujian geometri akhir. Ini bukti mengekalkan CLS 0, bukannya penurunan daripada baseline yang lebih tinggi. Regresi kecil semasa Fasa 9 benar-benar dikesan dan reserve slot dibetulkan tanpa melonggarkan penerimaan CLS 0.

Skop tersebut ialah perjalanan geometri dengan locale sudah stabil. Selepas toggle locale yang disengajakan, run native `8f0aabe94084` merekodkan satu raw layout entry `0.00003170352511935764` pada badge `.auth-v17-status`, dengan `hadRecentInput:true`; perubahan lebar teks itu dikecualikan daripada pengiraan CLS standard. Sebelum rapid navigation, senarai shift kosong. Laporan tidak mendakwa semua raw layout entry bagi setiap interaksi ialah0.

## Liputan sebenar dan keputusan pemeriksaan

Ujian browser menggunakan Chromium dalam WSL/bwrap dengan fixture localhost sintetik. Viewport: 320×800, 360×800, 390×844, 412×915, 768×1024, 1024×900 dan 1440×900. Kedua-dua route diuji dalam tema cerah/gelap dan BM/EN. Ujian touch menggunakan konteks emulasi 390px dengan `hover:none`. Unsupported View Transitions diuji dengan API tersebut dioverride dalam Chromium; reduced motion juga diemulasikan. Ini bukan pelaksanaan ujian Firefox/Safari atau telefon fizikal.

| Pemeriksaan | Keputusan dan resit utama |
| --- | --- |
| Lifecycle pengawal, shell persisten dan kontrak auth | Fasa 3: 34/34; Fasa 4: 27/27; Fasa 5: 28/28. Resit terperinci dalam handoff. |
| Artwork, decode, tema dan retry | Fasa 6: 23/23 unit/SSR, typecheck komponen dan 3 kes browser lulus. Ulangan selepas Fasa 9 `auth-smooth-tests-9e8120164345` lulus satu kes slow-artwork dalam 19.964s. Dua kes retry yang lulus pada Fasa 6 tidak diulang dalam run ini; JavaScript retry kekal sama. Profil rangkaian: latency 150ms, download 200000B/s, upload 93750B/s; bukan dakwaan preset DevTools tertentu. |
| Loading, mata password, ralat, success dan fokus | Fasa 7: 39+24 ujian, lint, typecheck helper, build serta browser states/fokus lulus. Dua ikon mata stabil, opacity 120ms, butang loading bersaiz tetap dan status entry 260ms diperiksa. |
| Landing/auth tanpa jeda buatan | `auth-smooth-tests-697889e028d2`: 3 roundtrip native/unsupported/reduced lulus, termasuk URL/history, tema, CLS 0 dan animasi opacity sahaja selama 240ms. |
| Kontrak/unit/SSR hingga Fasa 9 | `auth-smooth-tests-4327d2c00d62`: 72/72 lulus dalam 12.876s pada sumber build `7e034d294641`, sebelum pembaikan hook Fasa 10. Regex 26rem lapuk telah dikemas kini kepada keperluan 24rem. |
| Geometri Fasa 9 dan gambar | `auth-smooth-tests-f5e49348f94a` cerah dan `auth-smooth-tests-116b0348b515` gelap lulus; 28 screenshot selepas dikumpul. Pemeriksaan visual terpilih meliputi desktop/tablet kedua-dua tema dan telefon, termasuk Back pada 360px selepas pembaikan. |
| Helper/ARIA dan touch | `0a8f72b9c353` dan `8f4300afc709` lulus, termasuk hint+error `aria-describedby` dan konteks touch. |
| Regresi browser dan filmstrip terasing | `auth-smooth-tests-7de4d108f663`: 5 kes native rapid, filmstrip, login states, forgot states dan history cancellation lulus. Filmstrip mengambil frame pada timeline 0/120ms dan membatalkan snapshot miliknya selepas capture; ia bukan ukuran natural completion atau prestasi. |
| Lint dan typecheck terfokus | Sumber client yang berubah lulus lint mengikut konfigurasi repositori. `tests/visual/*.ts` tiada konfigurasi ESLint yang sepadan; exit0 `--quiet` pada `4bdae358fcc0` tidak membuktikan rules lint digunakan pada fail visual. Typecheck strict bagi fail browser `faf5b8161452` dan ulangan terkini `0030fc71bf34` (5.58s) lulus dengan `exactOptionalPropertyTypes` dikekalkan; ujian visual turut dijalankan dalam Chromium. Helper/komponen terpilih lulus mengikut handoff. |
| Pembaikan hook Fasa 10 | Kontrak landing `auth-smooth-tests-442e1de9f70f`: 9/9 lulus; typecheck hook/test `3c0525cad2a8` lulus; lint sumber hook dalam `fe5b351aa679` lulus (fail visual tidak diliputi config ESLint); build `be1c5a9d1e76` lulus. Browser `auth-smooth-tests-c880714f2ae5`: 5/5 lulus (21.6s Playwright; 24.374s keseluruhan run), meliputi dua tema desktop 1366/1440, menu mobile/keyboard/enlarged text, visibility/reduced motion/pointer cleanup dan anchor/fokus/current index di bawah CSP ketat. |
| Verifikasi selepas hardening fixture | Native rapid `auth-smooth-tests-8f0aabe94084` lulus 11.293s dan perjalanan fungsi direct high `auth-smooth-tests-bbc00b2688fd` lulus 14.169s pada aplikasi terkompil yang sama. Ini memeriksa pengendalian fixture yang diperketat, bukan dakwaan penerimaan prestasi. |
| Detector statik | Impeccable engine Windows 0.1.18 disahkan dengan SHA256 pinned, dijalankan sebagai analisis statik pada 5 fail CSS/TSX dengan `--no-config --json`: 0 primary findings, 1 advisory grid. Blueprint grid dikekalkan kerana diminta spesifikasi. Ini bukan skor reka bentuk, audit WCAG atau bukti prestasi runtime. |

Percubaan filmstrip terdahulu yang mengganggu roundtrip diasingkan daripada tiga ujian fungsi tanpa jeda; tiada perubahan routing/controller dibuat untuk menutup kegagalan fixture. Satu percubaan lain ditolak sebelum target kerana allowlist bukti melebihi had 17MiB. Senarai nama kemudian dikecilkan per run; had tidak dinaikkan.

Hardening keselamatan ujian: `route.fetch` asal boleh mengikuti redirect secara dalaman, melangkaui pemeriksaan origin handler browser. Kedua-dua fixture baharu kini menetapkan `maxRedirects:0`, timeout 20s, GET sahaja, serta dispose/abort respons bukan200. Rangkaian luar sudah disekat oleh sandbox; ini pembaikan pengasingan fixture ujian, tanpa perubahan aplikasi. Strict TypeScript dan dua smoke test di atas lulus selepas pembaikan. Tiada config ESLint repositori diperluas.

Nisbah kontras berikut dikira daripada pasangan token warna legap. Ia bukan ukuran semua piksel yang dirender, keadaan disabled/overlay atau pensijilan WCAG.

| Kegunaan | Pasangan cerah dan nisbah | Pasangan gelap dan nisbah |
| --- | --- | --- |
| Teks utama | `#0f1d2e` / `#fff`:17.00:1 | `#f5f5f5` / `#111`:17.32:1 |
| Teks muted | `#5d6c7e` / `#fff`:5.37:1 | `#adb7c5` / `#111`:9.31:1 |
| Placeholder | `#647285` / `#fff`:4.90:1 | `#9eabba` / `#181818`:7.60:1 |
| Butang utama | `#fff` / `#1f5f99`:6.66:1 | `#fff` / `#286a9f`:5.75:1 |

## Fasa 10: keputusan prestasi dan penerimaan yang gagal

Run `auth-smooth-tests-df35d8a8dc3e` tamat dengan exit code 0 dalam 115.07s dan tiga ujian deterministik lulus. Namun log merekodkan `AUTH_LONG_TASK_ACCEPTANCE=FAIL` bagi ketiga-tiga profil. Kejayaan ujian pengumpulan/kontrak tidak bermaksud sasaran prestasi dipenuhi.

CPU throttling 1×/4×/6× ialah simulasi tambahan dalam sandbox dengan CPU host yang sudah dihadkan; ia tidak mewakili ujian PC fizikal kelas medium/high. Browser melaporkan 2 core dan `deviceMemory=2`. Profil konfigurasi `auto` benar-benar memilih low-spec pada host ini.

| Profil sintetik / konfigurasi | Native API mula→finished auth, ms | Native API mula→finished page, ms | Long task overlap maksimum, ms | Keputusan penerimaan |
| --- | --- | --- | --- | --- |
| CPU 1× / high | 556.9; 509.3 | 14899.3; 13695.1 | 5162 keseluruhan; 56 untuk auth | Gagal |
| CPU 4× / auto→low | 904.7; 680.7 | 2502.9; 18442.4 | 4552 keseluruhan; 285 untuk auth | Gagal |
| CPU 6× / low | 985.4; 740.4 | 10973.6; 1243.3 | 4527 keseluruhan; 359 untuk auth | Gagal |

Dua angka auth/page mengikut urutan pertukaran dalam resit. Tiada motion yang hilang atau tidak selesai dikesan oleh pemeriksaan run ini; sifat/durasi CSS yang ditetapkan dan interaksi keyboard berfungsi seperti dijangka. Walau bagaimanapun, kriteria tiada long task melebihi 50ms tidak dipenuhi, dan masa keseluruhan native API tidak lulus had ≤400ms auth/≤260ms page. Angka CSS 340ms/240ms mesti dibezakan daripada masa dinding API yang merangkumi snapshot/render.

Audit asal juga mencatat `memory.high=19128`, peak 744,071,168 bait, OOM 0, system CPU 72.785s berbanding user CPU 16.772s, 4,060,238 direct page scans dan 7,684 major faults. Tekanan sumber ialah confound yang nyata; angka ini tidak membuktikan punca tunggal atau kesalahan aplikasi.

### Atribusi dan perubahan sumber yang terhad

`auth-smooth-tests-ddf787fe52d6` lulus dua kes atribusi native/unsupported pada build sebelum pembaikan. CDP merekodkan delta layout 140.686ms native dan 99.365ms unsupported. Sampel fungsi minified `u` pada `/assets/Landing-CgXzgG_I.js` dipadankan secara statik kepada callback scroll/hero `useLandingNextMotion.ts`; sampel unsupported melaporkan 160.147ms. Ini ialah atribusi statistik wall-delta, bukan masa CPU eksklusif: sela off-CPU/reclaim serta probe boleh membesarkan sampel. Ia mengenal pasti tempat yang munasabah untuk membataskan interleaving baca/tulis, bukan bukti bahawa callback itu menjelaskan semua kelewatan.

Diagnostik Node tunggal kemudian membuang lapisan CLI/worker dan probe `getAnimations`/style snapshot. Had CPU/RAM asal kekal. Dua konteks baharu menjalankan native diikuti unsupported, CPU 1×/high, dengan pemeriksaan URL/history/tema/fokus/API/CSP. Modul diagnostik mempunyai hash yang sama dalam resit sebelum dan selepas di bawah.

| Resit / sumber / mod | Native API auth, ms | Native API page, ms | Long task maksimum auth, ms | Long task maksimum page, ms |
| --- | --- | --- | --- | --- |
| `1e90decd5771` / sebelum / native | 523.6; 463.4 | 667.9; 565.4 | 58; 52 | 136; 70 |
| `ff5ed15f2c5b` / selepas / native | 501.5; 436.5 | 594.5; 609.0 | 0; 58 | 134; 0 |
| `1e90decd5771` / sebelum / unsupported | Tidak berkenaan | Tidak berkenaan | 0; 0 | 129; 71 |
| `ff5ed15f2c5b` / selepas / unsupported | Tidak berkenaan | Tidak berkenaan | 58; 0 | 128; 67 |

Angka 0 bermaksud tiada long task bertindih dikesan dalam langkah itu, bukannya tiada kerja CPU. Kedua-dua mod masih melaporkan `longTaskAcceptance=FAIL`; native juga `nativeWallAcceptance=FAIL`. Selepas pembaikan, semua empat masa native masih melebihi had auth/page, dan long task melebihi 50ms masih wujud walaupun unsupported.

Pada langkah login→home, delta CDP layout/script sebelum→selepas ialah 97.991→92.690ms / 41.924→39.381ms bagi native dan 62.332→58.488ms / 40.688→40.793ms bagi unsupported. Perubahan kecil dan bercampur ini tidak menyokong dakwaan peningkatan prestasi. Perbandingan hanya satu run sebelum dan satu selepas, dengan urutan mod tetap; cache, JIT, scheduler dan tekanan sumber tidak diasingkan sepenuhnya.

Run direct sebelum/selepas tamat dalam 12.642s/12.381s dengan `memory.high=0`, peak 656,187,392/664,711,168 bait dan OOM 0. Ini mengurangkan satu confound yang dilihat dalam runner berat, tetapi profil dan probe berbeza daripada audit tiga profil asal; perbezaan masa run tidak boleh ditukar menjadi peningkatan aplikasi. Tiada kesimpulan production, compositor atau GPU dibuat.

Percubaan tambahan `auth-smooth-tests-bdfba1086eae` gagal pada assertion fixture sebelum perjalanan: initializer memang memadam `perf_mode` untuk auto, menghasilkan `null`, sedangkan runner meminta string `auto`. Assertion ujian dibetulkan kepada nilai tepat `null`, tanpa perubahan aplikasi. Kegagalan fixture itu bukan regresi aplikasi atau keputusan prestasi.

Ulangan `auth-smooth-tests-bac327c1d924` bagi dua profil tetap tambahan tamat exit0 dalam 52.285s pada build aplikasi yang sama `be1c5a9d1e76`. Profil 4×/auto merekodkan override `null` dan low-spec sebenar; profil 6× menggunakan low. Modul diagnostik diperluas untuk tiga kombinasi yang ditetapkan sahaja, tanpa menaikkan had. Jadual ini menyatakan maksimum long task merentasi dua pertukaran auth/page, bukan setiap langkah secara berasingan.

| Profil / mod | Native API auth, ms | Native API page, ms | Long task maksimum auth, ms | Long task maksimum page, ms |
| --- | --- | --- | --- | --- |
| CPU 4× auto→low / native | 618.6; 666.7 | 1530.9; 1108.4 | 154 | 859 |
| CPU 4× auto→low / unsupported | Tidak berkenaan | Tidak berkenaan | 102 | 352 |
| CPU 6× low / native | 701.1; 691.3 | 1663.2; 1097.5 | 178 | 898 |
| CPU 6× low / unsupported | Tidak berkenaan | Tidak berkenaan | 123 | 569 |

Run ini mencatat peak 701,259,776 bait, `memory.high=0` dan OOM 0. Semua mod masih `longTaskAcceptance=FAIL`; kedua-dua profil native juga `nativeWallAcceptance=FAIL`. Ketiadaan event memory.high tidak membebaskan layout/aplikasi daripada kemungkinan menyumbang kepada kelewatan; ia hanya menghapuskan event tekanan tertentu dalam run ini. Tiga profil yang ditetapkan kini selesai dan masih tidak memenuhi kriteria ketat. Tiada dakwaan prestasi lulus atau latency production dibuat.

## Had yang masih terbuka

- Typecheck 11 fail `auth-smooth-tests-151aaa8c85b5` benar-benar berjalan tetapi kehabisan heap 384MB. Peak cgroup 590,606,336 bait tanpa cgroup OOM. Kejayaan helper/browser terfokus tidak menggantikan full-project typecheck; status ini belum selesai.
- Build yang disahkan ialah frontend Vite. Full backend/release build belum disahkan kerana binary esbuild Linux tambahan tidak tersedia; tiada muat turun atau instalasi dibuat.
- Semantik ARIA, fokus keyboard dan perlindungan fokus diuji melalui kod/browser. Tiada sesi screen reader sebenar, audit pematuhan WCAG menyeluruh, ujian GPU, Firefox/Safari sebenar atau peranti fizikal dijalankan.
- ESLint repositori meliputi sumber client/server/shared, tetapi tiada rules yang sepadan untuk fail `tests/visual/*.ts`. Strict TypeScript dan pelaksanaan Chromium memberi pengesahan yang berbeza; laporan tidak menganggap exit0 lint yang diabaikan sebagai lulus lint visual.
- Gambar hanya menyokong keadaan dan viewport yang dirakam. Latar raster recovery gelap asal masih mempunyai sempadan canvas yang kelihatan; tiada dakwaan transparent atau sepenuhnya seamless.
- Penerimaan prestasi Fasa 10 masih gagal pada ketiga-tiga profil direct dengan tekanan memori lebih rendah. Checkpoint pembaikan hook, ujian dan hardening fixture telah disahkan secara terfokus. Tiada fasa pelaksanaan dilangkau; exit code 0 tidak menukar kegagalan metrik kepada lulus. Goal kekal terbuka kerana kriteria prestasi ketat dan full-project TypeScript belum selesai.

Langkah sambungan ialah mengasingkan kos style/layout ketika landing mula dipasang sebelum mencuba pembaikan lain. Unsupported juga menunjukkan long task, jadi mengurangkan durasi CSS atau mematikan animasi tidak membuktikan punca telah dibetulkan. Selesaikan full-project TypeScript dalam runtime terasing yang mencukupi dan semakan screen reader/peranti sebenar sebelum mendakwa keseluruhan Definition of Done dipenuhi.

## Sempadan pelaksanaan dan cleanup

Semua build/test/browser aplikasi dijalankan bersiri dalam WSL/bwrap dengan had asal: CPU 100%, RAM 768MiB/high 704MiB, swap 0, PID 128, tmp 256MiB, CPU 120s dan wall 180s. Had tidak dinaikkan. Alat Windows yang dipercayai digunakan untuk orkestrasi, pembacaan bukti dan analisis statik; kod aplikasi tidak dijalankan di host Windows.

Ruang C: beberapa kali habis dan menyebabkan percubaan persediaan gagal. Pemampatan NTFS standard pada enam dump WSL yang telah ditutup berjaya dengan SHA256 sebelum/selepas sepadan. Ruang tersedia diperhatikan naik 46,219,264→2,187,608,064 bait, pertambahan 2,141,388,800 bait (~1.99GiB). Percubaan LZX awal gagal kerana ruang tidak cukup. Pemadaman ditolak oleh semakan kelulusan automatik dengan `blocked by policy`; tiada fail dipadam dan tiada jalan lain digunakan untuk memintas penolakan itu. Fail aplikasi, data dan `.env` tidak disentuh oleh cleanup.

Cleanup susulan melalui pemampatan NTFS tanpa kehilangan data berjaya; root kemudian memerhatikan kira-kira 1.8GiB ruang tersedia. Ini bacaan ruang pada masa tersebut, bukan tambahan 1.8GiB yang boleh dijumlahkan dengan keuntungan terdahulu.

Laporan kekal draf sehingga siasatan prestasi dan pengesahan akhir Fasa 10 selesai. Tiada push/deploy dilakukan.
