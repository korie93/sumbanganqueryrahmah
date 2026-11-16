# Laporan peralihan auth SQR

14 November 2026. Draf berdasarkan bukti dalam [handoff](auth-smooth-transitions-handoff.md), audit asal `auth-smooth-tests-df35d8a8dc3e` dan sambungan diagnostik sehingga `auth-smooth-tests-6b74c7c039db`. Penerimaan prestasi Fasa 10 belum lulus. Branch: `codex/visual-layout-repair`. Asas perbandingan: `54a99feb6cc95b822d665130d64034449080cdf2`.

## Skop dan status

Perubahan terhad kepada paparan `/login`, `/forgot-password` dan peralihan masuk/keluar landing. API/payload auth, sesi/JWT, validasi, rate limit, permission, URL dan copy maklum balas dikekalkan. Tiada dependency baharu, akses production, push atau deploy.

Fasa 1–9 telah dilaksanakan; Fasa 1 memang tidak memerlukan commit. Checkpoint Fasa 10 `68f8b4e9` merekodkan pembaikan susunan baca/tulis landing, ujian dan hardening fixture. Sambungan yang belum commit mengekalkan `lang="en"` pada landing, memindahkan effect metadata App kepada `useLayoutEffect` dan mengehadkan tiga selector snapshot auth kepada marker root milik pengawal. Satu pass style penuh berulang dihapuskan dalam trace; selector auth pula tidak lagi dilaporkan antara rule yang dicuba dalam perjalanan unsupported yang diukur. Build akhir sambungan `auth-smooth-build-b268845f99d6`, 82 ujian unit, lint sumber serta regresi native/geometri lulus. Namun run plain terkini masih gagal kriteria long task dan masa keseluruhan native API pada profil direct 1×/4×/6×; full-project TypeScript juga belum lulus. Matlamat belum tercapai; Fasa10 belum lulus.

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
| 10 | `68f8b4e9` checkpoint | `fix(auth-ui): address verification findings`; sambungan metadata/CSS belum commit dan belum meluluskan kriteria prestasi ketat atau full-project TypeScript. |

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
- Sambungan menetapkan skop bahasa English pada landing yang memang berbahasa English, kemudian memajukan effect metadata App kepada `useLayoutEffect`. Dependency, resolver, nilai metadata, callback navigasi dan auth tidak diubah. `lang="en"` sahaja tidak menghentikan invalidasi ancestor dalam Chromium; perubahan fasa metadata mengelakkan pass penuh kedua selepas layout pertama. Bukti ini ialah pembaikan kerja berulang yang khusus, bukan kelulusan budget masa keseluruhan.

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
| Sambungan bahasa/metadata | Regresi root English mula-mula RED `0270359f14d4` (9 lulus/1 gagal), kemudian GREEN `3a75841b33e1` (10 lulus). Regresi fasa metadata RED `80125c485462` (11 lulus/1 gagal); selepas effect App diubah, `auth-smooth-tests-5449801bd66d` lulus 29 ujian dalam tiga fail. Typecheck dua fail ujian unit `446e7d68e771` lulus 4.546s; ini tidak menyemak graph App penuh. |
| Gate lint sebenar pada sambungan | `auth-smooth-tests-de131614ae49`: arahan sebenar `npm run lint` client/server lulus 59.458s, dengan snapshot server read-only dan shim executable tool sedia terpasang dalam scratch. Percubaan terdahulu `1f576dbcdb33` gagal fixture kerana executable eslint tidak ditemui; itu bukan kegagalan rule sumber. Tiada dependency dipasang atau had dinaikkan. Skop ESLint masih tidak meliputi fail visual. |
| Build dan boundary selepas metadata | `auth-smooth-build-bae5a57a3281` lulus 17.793s. Tiga boundary native/unsupported/reduced `auth-smooth-tests-d6b5383553b5` lulus 33.907s, termasuk URL/history/tema/fokus dan assertion metadata/private SEO. |
| Selepas tiga selector snapshot dibatasi | Kontrak PostCSS RED `dbb69d4767e8` (12 lulus/1 gagal) menjadi GREEN dalam set `cf69bcb98b8e`: 82/82 lulus 13.458s. Typecheck dua fail ujian unit `ac2478496f3a` lulus 3.88s, lint sumber `9a407bf617a8` lulus 6.47s dan build `b268845f99d6` lulus 16.519s. Ini bukan full-project TypeScript. |
| Regresi akhir native dan geometri | `f935d6bbff86`: native rapid dan tiga boundary, 4 kes lulus 30.22s; CSS auth keluar 140ms/masuk tamat 340ms dan page 240ms, unsupported/reduced kekal. Geometri cerah `a076c14d386a` lulus 103.567s dan gelap `82b1c4b42edb` lulus 39.746s pada tujuh lebar, BM/EN, CLS perjalanan 0 dan layout sepadan. Empat belas JPG setiap tema dikumpul. Pemeriksaan visual manual kini meliputi20 screenshot EN: login/forgot, kedua-dua tema, pada360/390/412/768/1440px. Screenshot320/1024px hanya disokong pemeriksaan geometri automatik dalam set ini; tidak didakwa semuanya dilihat secara manual. Tiada clipping atau overflow baharu dilihat pada20 screenshot tersebut; sempadan canvas raster gelap asal masih kelihatan. |
| History selepas selector diperketatkan | `b8b0a3c18f90`: dua kes modifier/native-link/replace-history dan Back yang membatalkan snapshot berjalan lulus, 14.3s Playwright/16.418s keseluruhan run. |
| MFA pada shell akhir | `15d0c1b653cf`: dua kes cerah/gelap lulus15.437s keseluruhan (13.0s Playwright). OTP asli fokus/numeric/autofill, enam slot, busy/disabled/spinner, butang354×54px sebelum/semasa/selepas, satu alert dengan copy rasmi, payload tepat `{challengeToken:"v17-ui-challenge",code:"123456"}`, kembali ke password dan brand kekal. Tiada sesi berjaya atau rekod protected dibuka. Native View Transitions dimatikan untuk ujian keadaan ini; memory.high971 menjadikannya bukti fungsi sahaja. |
| TypeScript untuk ujian MFA | `3040354df4d5` lulus5.681s untuk satu fail visual yang dipilih dengan options root asal. Ia bukan full-project TypeScript atau lint visual. Percubaan browser awal `faee35ec2f07` gagal kerana assertion menjangka teks mentah API; pemetaan feedback asal memang memaparkan copy rasmi mengikut kod. Assertion dibetulkan tanpa perubahan aplikasi. |
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

Keputusan plain terkini di bawah menggunakan build akhir sambungan `b268845f99d6`, selepas pembaikan metadata dan skop selector. Run CPU1 `7b91ea314549` tamat exit0 dalam 12.64s; CPU4/6 `6b74c7c039db` tamat exit0 dalam 52.731s. Semua perjalanan fungsi selesai, tetapi semua mod native/unsupported masih `longTaskAcceptance=FAIL` dan native masih `nativeWallAcceptance=FAIL`.

| Profil / resit terkini | Native API auth, ms | Native API page, ms | Long task maksimum native auth/page, ms | Long task maksimum unsupported auth/page, ms |
| --- | --- | --- | --- | --- |
| CPU 1× high / `7b91ea314549` | 531.8; 463.1 | 562.0; 555.7 | 0 / 146 | 0 / 169 |
| CPU 4× auto→low / `6b74c7c039db` | 668.3; 682.7 | 1171.4; 1369.5 | 116 / 423 | 145 / 398 |
| CPU 6× low / `6b74c7c039db` | 740.7; 812.7 | 1406.6; 1185.5 | 157 / 728 | 120 / 651 |

Dua angka API mengikut arah perjalanan; long task ialah maksimum merentasi dua arah setiap jenis pertukaran. Angka 0 bermaksud tiada long task bertindih dikesan dalam langkah berkaitan, bukannya tiada kerja CPU. Jadual ini mengatasi angka run terdahulu untuk status semasa; bukti berikut mengekalkan sejarah diagnosis tanpa dakwaan peningkatan latency keseluruhan.

### Audit asal dan sejarah diagnosis

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

### Sambungan: pass style metadata yang berulang

Trace `8ab62da6251d` merekodkan style utama 96.102ms dan layout 78.687ms sebelum marker perubahan `html.lang` ms→en, diikuti style utama kedua 88.296ms dan layout 5.14ms. Menambah bahasa pada root landing sahaja (build `207cc48ee792`, trace `bfd8d7b05a14`) masih meninggalkan pass lewat 78.338ms; pembaikan semantik itu dikekalkan, tetapi tidak dianggap penyelesaian prestasi.

Selepas metadata App dipindahkan kepada `useLayoutEffect`, trace `334adc22810e` menempatkan marker bahasa sebelum pass utama pertama. Hanya satu pass style besar 92.379ms direkodkan, dengan jumlah main-style 98.553ms; full layout 675 objek berlaku sekali. Bilangan invalidasi `Style changed` turun daripada 699 kepada 32. Ini mengesahkan penghapusan satu pass penuh yang berulang dalam jejak tersebut. Ia bukan ukuran peratus peningkatan kelajuan atau bukti semua punca kelewatan selesai.

Trace susulan `395b7ca87665` memisahkan wall dan thread CPU: main-style 94.546ms wall/39.831ms thread CPU; main-layout 48.93ms wall/13.949ms thread CPU. Cgroup run itu dithrottle pada 67 daripada 86 period. Wall time bukan masa CPU eksklusif, tetapi throttling juga tidak membatalkan kriteria penerimaan pengguna. Raw trace dibatasi 2MiB dalam memori dan hanya aggregate dikeluarkan; masa instrumentasi tidak dibandingkan dengan budget run biasa.

Ulangan tanpa trace pada build metadata, sebelum skop selector CSS dibatasi, masih gagal metrik ketat:

| Profil / resit | Native API auth, ms | Native API page, ms | Long task maksimum native auth/page, ms | Long task maksimum unsupported auth/page, ms |
| --- | --- | --- | --- | --- |
| CPU 1× high / `65f3df2a1309` | 510.7; 474.4 | 607.5; 539.9 | 0 / 127 | 56 / 124 |
| CPU 4× auto→low / `d2fb439ae9c4` | 686.8; 766.6 | 1309.8; 1078.7 | 140 / 667 | 158 / 363 |
| CPU 6× low / `d2fb439ae9c4` | 827.0; 725.3 | 1682.7; 995.9 | 239 / 806 | 167 / 564 |

Resit `d2fb439ae9c4` tamat exit0 dalam 55.061s dengan metadata dan aliran yang betul. Semua mod masih `longTaskAcceptance=FAIL`, dan native masih `nativeWallAcceptance=FAIL`. Angka long task dalam jadual ialah maksimum merentasi dua arah setiap jenis pertukaran; ia bukan masa setiap langkah.

### Atribusi selector dan skop rule auth

Run `e16a7f064911` menggunakan Selector Stats dan mengenal pasti rule global `::view-transition-new(auth-form)` dengan 414 cubaan, 0 padanan dan 0 fast reject. Tiga rule bernama group/old/new dibatasi kepada `html[data-vt="auth"]`, dengan declaration dan timing yang sama. Kontrak PostCSS mula-mula RED dalam `dbb69d4767e8` (12 lulus/1 gagal), kemudian GREEN dalam set 82 ujian. Trace selepas perubahan `723cffaa784c` merekodkan `authSnapshotSelectors:[]`: ketiga-tiga rule auth tidak dilaporkan antara rule yang dicuba dalam perjalanan unsupported yang diukur. Semakan bucketing sumber turut sepadan. Regresi native dan geometri akhir lulus seperti jadual pemeriksaan. Ini bukti skop matching berubah sambil UI/motion yang diuji kekal, bukan ukuran CPU eksklusif atau peningkatan latency keseluruhan.

Kaedah merujuk [dokumentasi Selector Stats Chrome DevTools](https://developer.chrome.com/docs/devtools/performance/selector-stats), yang menyatakan rakaman statistik ini menambah overhead. Elapsed berinstrumentasi tidak dibandingkan dengan budget biasa atau dianggap CPU production. Struktur `selector_stats.selector_timings` dan medan cubaan/padanan disemak terhadap [sumber Chromium yang dipin](https://chromium.googlesource.com/chromium/src/+/54e69a145747eccc022ded8d94c537154ed15852/third_party/blink/renderer/core/css/element_rule_collector.cc).

## Had yang masih terbuka

- Typecheck 11 fail `auth-smooth-tests-151aaa8c85b5` ialah percubaan terfokus yang kehabisan heap 384MB; ia bukan percubaan penuh repositori. Percubaan inventory TypeScript penuh `auth-smooth-tests-6b0e80e8fe28` kemudian menggunakan snapshot server dan 3,006 root daripada config asal tanpa mengubah options, tetapi turut OOM pada heap 384MB sebelum graph/semantik lengkap. `semanticChecked:false`; tiada keputusan semantik penuh atau dakwaan jenis kod bebas ralat. Arahan sebenar `npm run typecheck` kemudian dijalankan dalam `f64afe1ae542` menggunakan CLI TypeScript rasmi yang sudah dipasang; ia tamat kerana heap V8 384MiB habis, sebelum semakan penuh selesai. Peak cgroup600,666,112 bait, tiada cgroup OOM. Percubaan `dec73afd9345` sebelumnya ialah kegagalan fixture: wrapper bin TypeScript tidak disalin dalam snapshot. Shim dipercayai dibetulkan untuk menjalankan lib/tsc.js yang sama seperti wrapper rasmi, tanpa pemasangan atau perubahan dependency/options projek. Gate ini masih terbuka.
- Build yang disahkan ialah frontend Vite. Full backend/release build belum disahkan kerana binary esbuild Linux tambahan tidak tersedia; tiada muat turun atau instalasi dibuat.
- Semantik ARIA, fokus keyboard dan perlindungan fokus diuji melalui kod/browser. Tiada sesi screen reader sebenar, audit pematuhan WCAG menyeluruh, ujian GPU, Firefox/Safari sebenar atau peranti fizikal dijalankan.
- ESLint repositori meliputi sumber client/server/shared, tetapi tiada rules yang sepadan untuk fail `tests/visual/*.ts`. Strict TypeScript dan pelaksanaan Chromium memberi pengesahan yang berbeza; laporan tidak menganggap exit0 lint yang diabaikan sebagai lulus lint visual.
- Gambar hanya menyokong keadaan dan viewport yang dirakam. Latar raster recovery gelap asal masih mempunyai sempadan canvas yang kelihatan; tiada dakwaan transparent atau sepenuhnya seamless.
- Penerimaan prestasi Fasa 10 masih gagal pada ketiga-tiga profil direct terkini. Penghapusan pass metadata berulang dan skop matching selector auth disahkan secara khusus; ujian fungsi, build dan geometri sambungan lulus, tetapi ia tidak meluluskan budget keseluruhan. Tiada fasa pelaksanaan dilangkau; exit code 0 tidak menukar kegagalan metrik kepada lulus. Matlamat belum tercapai kerana kriteria prestasi ketat dan full-project TypeScript belum selesai.

Langkah sambungan yang masih boleh dibuat ialah mengaitkan kos initial full-tree/offscreen layout kepada sumber yang tepat sambil mengekalkan UI dan motion. Unsupported juga masih menunjukkan long task; pengurangan durasi CSS atau pembuangan animasi tidak membuktikan punca selesai. Full-project TypeScript, full backend/release build Linux dan pemeriksaan screen reader/peranti sebenar kekal tidak disahkan. Had runtime sedia ada tidak dinaikkan untuk menutup jurang ini.

## Sempadan pelaksanaan dan cleanup

Semua build/test/browser aplikasi dijalankan bersiri dalam WSL/bwrap dengan had asal: CPU 100%, RAM 768MiB/high 704MiB, swap 0, PID 128, tmp 256MiB, CPU 120s dan wall 180s. Had tidak dinaikkan. Alat Windows yang dipercayai digunakan untuk orkestrasi, pembacaan bukti dan analisis statik; kod aplikasi tidak dijalankan di host Windows.

Ruang C: beberapa kali habis dan menyebabkan percubaan persediaan gagal. Pemampatan NTFS standard pada enam dump WSL yang telah ditutup berjaya dengan SHA256 sebelum/selepas sepadan. Ruang tersedia diperhatikan naik 46,219,264→2,187,608,064 bait, pertambahan 2,141,388,800 bait (~1.99GiB). Percubaan LZX awal gagal kerana ruang tidak cukup. Pemadaman ditolak oleh semakan kelulusan automatik dengan `blocked by policy`; tiada fail dipadam dan tiada jalan lain digunakan untuk memintas penolakan itu. Fail aplikasi, data dan `.env` tidak disentuh oleh cleanup.

Cleanup susulan melalui pemampatan NTFS tanpa kehilangan data berjaya; root kemudian memerhatikan kira-kira 1.8GiB ruang tersedia. Ini bacaan ruang pada masa tersebut, bukan tambahan 1.8GiB yang boleh dijumlahkan dengan keuntungan terdahulu.

Dalam sambungan ini, satu lagi dump WSL tertutup kira-kira 1.064GB dimampat tanpa kehilangan data, dengan hash sebelum/selepas sama dan peruntukan selepas pemampatan 142,102,528 bait. Ruang tersedia diperhatikan 779,816,960→1,701,363,712 bait; tiada pemadaman. Bacaan ruang pada masa berlainan tidak dijumlahkan sebagai keuntungan baharu.

Laporan kekal draf sehingga siasatan prestasi dan pengesahan akhir Fasa 10 selesai. Tiada push/deploy dilakukan.

Cleanup susulan atas permintaan pengguna memampat manifest snapshot ujian sendiri; `compact /Q` mengesahkan 267 fail (106,791,009 bait logik) sudah compressed. Baki C: diperhatikan1,558,659,072 bait (~1.45GiB). Tiada pemadaman atau perubahan aplikasi/data melalui cleanup. Hash stabil dalam pemeriksaan akhir; rekod hash awal sebelum pemampatan tidak disimpan sepenuhnya, jadi bukti sebelum/selepas lengkap tidak didakwa. Semua dump WSL besar sudah dimampat dan tiada calon pemadaman besar yang jelas selamat ditemui. TypeScript penuh kekal terhalang had heap384MiB, bukan selesai dengan cleanup ini; ujian OOM yang sama tidak diulang.

Semakan sumber tambahan tidak menyokong perubahan umum `content-visibility:auto` pada panel landing: tingginya bergantung kandungan, minimum desktop bukan tinggi tetap, dan workflow strip tiada minimum itu. Placeholder tekaan berisiko mengubah anchor, scrollbar dan pembalutan teks200%. Tiada perubahan aplikasi atau dakwaan peningkatan prestasi dibuat daripada cadangan yang belum diuji ini.

## Pemeriksaan akhir spesifikasi dan titik sambungan

| Keperluan | Bukti semasa | Keputusan |
| --- | --- | --- |
| Frontend sahaja; auth/API/payload/validasi/copy/permission kekal | Diff terhadap asas tiada perubahan server/shared/package/API atau hooks auth; browser login, MFA dan recovery memeriksa kontrak rekaan | Lulus dalam skop frontend diuji |
| Token sekali, parent/toolbar persisten, ilustrasi asal decode/crossfade | Commit Fasa2–6, kontrak dan resit setiap fasa; identity/geometry terkini | Lulus |
| Heading ±1px, compact bawah768px, split40%+, form16px dan tiada clipping | Geometri tujuh lebar BM/EN,20 screenshot EN dilihat secara manual | Lulus pada viewport diuji |
| Anchor sebenar, modifier, replace-history, Back/Forward, fokus dan rapid cancellation | f935d6bbff86 dan b8b0a3c18f90; fallback/reduced; MFA15d0c1b653cf | Lulus untuk Chromium diuji |
| Busy/error/success stabil dan recovery enumeration-safe pada frontend | Ujian keadaan Fasa7 + dua identifier path yang sama + dua kes MFA akhir | Lulus pada respons rekaan yang sama; timing backend sebenar bukan skop perubahan |
| CLS0 serta properti/durasi CSS yang diminta | Ujian geometri dan motion; auth140/340ms, page240ms; raw locale badge recent-input diterangkan berasingan | Lulus keadaan/journey yang dinyatakan |
| Jumlah native auth≤400ms/page≤260ms dan tiada long task>50ms | Run plain7b91ea314549/6b74c7c039db masih gagal; trace hanya mengesahkan punca kerja berulang tertentu | Gagal, belum diselesaikan |
| npm run lint | de131614ae49 menjalankan client+server; lint perubahan TS sumber akhir9a407bf617a8 | Lulus; visual TS tiada skop ESLint |
| npm run typecheck penuh | f64afe1ae542 benar-benar menjalankan tsc--noEmit lalu heap OOM | Tidak selesai; jangan anggap bebas ralat |
| npm run build penuh | Vite b268845f99d6 lulus; binary esbuild Linux untuk build server/release tiada | Build penuh belum disahkan |
| Screen reader sebenar, GPU/compositor, enjin/peranti sebenar | Semantik/fokus Chromium sahaja; tiada akses ujian tersebut | Belum disahkan |
| Commit mengikut fasa, laporan dan handoff | Fasa2–9 mempunyai commit/build frontend; Fasa10 checkpoint68f8 dan9 fail sambungan belum commit | Belum memenuhi penutupan Fasa10; tiada push/deploy |

Penghadang heap yang sama kekal pada sambungan inventory penuh, sambungan cleanup dan arahan npm sebenar sekarang. Ruang cakera sudah cukup untuk ujian bounded, tetapi semakan penuh masih tidak boleh ditamatkan di bawah had tersebut. Pemeriksaan selamat yang tidak bergantung padanya (MFA dan screenshot akhir) telah dilengkapkan. Sambungan memerlukan persekitaran sandbox yang boleh menjalankan typecheck/build penuh serta profiling/rendering yang mewakili pengguna; budget prestasi belum boleh diisytiharkan lulus atau disalahkan sepenuhnya pada sandbox. Jangan tambah CSS spekulatif atau melonggarkan kriteria untuk menutup gate ini.

Pencegahan cakera penuh: `.wslconfig` lokal dibackup sebelum menambah `maxCrashDumpCount=-1`, mengikut [penjelasan penyelenggara WSL](https://github.com/microsoft/WSL/issues/12147). WSL ujian dimulakan semula selepas tiada target aktif; memory1024MB/processors2/swap0 dan had target kekal. Wrapper ujian juga menetapkan RLIMIT_CORE0. Selepas OOM npm sebenar,10 dump lama mempunyai nama/saiz/timestamp yang sama dan tiada dump baharu. Ini mengesahkan pencegahan dump untuk kejadian itu, bukan pembaikan typecheck atau prestasi aplikasi. Tiada dump lama dipadam.

## Goal disambung: eksperimen exact-top ditolak

Pengguna mengaktifkan goal semula selepas status blocked. Audit blocked bermula semula; sambungan pertama ini menghasilkan bukti baharu, bukan kejayaan penerimaan prestasi. Worktree asal sembilan fail dikekalkan.

Hipotesis sempit: apabila scrollY tepat0 dan pointer null, output progress0, seksyen top, Back-to-top tersembunyi dan watermark0px/1 tidak memerlukan bacaan geometri. Callback sebenar diuji dengan getter terkawal: RED `8f220476a8e8` mempunyai3 lulus/2 gagal pada bacaan top; guard eksperimen kemudian meluluskan28 kes berkaitan dalam `7001cc36c80d` (5.227s), lint `8395f9d85b8a` (5.453s), TypeScript dua fail `046e17bb7d42` (3.843s) dan build frontend eksperimen `8d5272328fe7` (17.049s). TypeScript spec browser eksperimen `9cd21320ae92` turut lulus5.719s.

Browser `5aab7382145b` lulus12.106s: top/return-top mempunyai0 bacaan scrollHeight/sectionRects/heroHeight/heroRects; scroll1170px membaca1/7/1/0 dan output progress0.1829840475, seksyen About serta watermark sama dengan formula asal. Pointer pada top kembali membaca1/7/1/1 dan menghasilkan LOC30·35 serta nilai glow/rotation yang sepadan. Ini membuktikan kesetaraan fungsi dan pengurangan bacaan eksplisit sahaja.

Run plain CPU1/high `9ac8fed99f63` tidak menunjukkan peningkatan latency yang konsisten. Native API auth526.4/467.7ms dan page592.2/699.3ms masih gagal; sebelum guard dalam `7b91ea314549`, nilainya531.8/463.1 dan562.0/555.7ms. Long task maksimum perjalanan Home native164ms/unsupported159ms berbanding146/169ms sebelumnya. Satu sampel dan varian scheduler tidak membuktikan manfaat daripada159 berbanding169ms. Kedua-dua mod kekal longTaskAcceptanceFAIL dan nativeWallAcceptanceFAIL.

Trace berasingan `bdda5efee82f` (atribusi sahaja,7.785s,998390 bait/2030 event dalam memori) masih merekodkan full layout675 objek:68.59ms wall/16.94ms thread CPU. Trace sebelum guard `395b7ca87665` mempunyai48.93/13.949ms untuk675 objek. Kedua-duanya tidak mempunyai enclosing FunctionCall yang direkodkan bagi layout itu; tiada bukti full layout dihapuskan atau dipindahkan oleh guard. Pengurangan bacaan tidak membuktikan punca budget keseluruhan selesai.

Oleh sebab manfaat prestasi tidak ditunjukkan, guard eksperimen, unit test khusus dan kes browser eksperimen telah dikeluarkan. Hook kembali tepat kepada HEAD68f8; kes MFA dan semua perubahan terdahulu kekal. Keseluruhan sembilan hash fail checkpoint sebelum eksperimen disahkan sama selepas rollback, termasuk spec SHA256 `06459f914dcc673d34285b51b81e477b6601f109e9cdc0cb7661095e2d125185`. Binaan aktif kembali kepada `b268845f99d6`; build8d527 ialah artifak eksperimen yang ditolak, bukan binaan akhir. Semua resit negatif dikekalkan di helper luar projek;5 ujian dan kes browser tambahan itu tidak lagi sebahagian kod semasa.

Carian baca sahaja turut menolak alternatif binary build yang mungkin sudah dicache: lockfile memerlukan esbuild/@esbuild/linux-x64 versi0.28.1. Indeks cache npm lokal tiada padanan tepat tarball linux-x64-0.28.1.tgz dan contentpath daripada integrity SHA512 lockfile tidak wujud; cache alternatif .npm juga tiada. Tiada muat turun, pemasangan, extraction atau perubahan dependency dilakukan. Gate full build dan heap penuh kekal terbuka. Pengguna kemudian mengesahkan belum mempunyai runner lain.

## Kemas kini typecheck lokal — 15 November 2026

Atas persetujuan pengguna, arahan tambahan `npm run typecheck:low-memory`
disediakan tanpa menggantikan `npm run typecheck` atau mengubah konfigurasi CI.
Run `0157573c2a80` lulus **3006/3006 root** secara bersiri dalam485.814s dengan
heap pekerja768MiB dan batch64. Peak keseluruhan991350784 bait (945.4MiB),
tanpa memory-high,max atau OOM. Enam ujian regresi lulus dalam`9b20686b8499`.

Pengesahan ini membuktikan mod lokal boleh menyemak semua root SQR dalam
persekitaran tersebut. Ia tidak membuktikan typecheck monolitik CI lulus:
konteks augmentation dependency antara kumpulan boleh berbeza dan dependency
TS di luar root tidak dijadualkan berasingan. Butiran,bukti eksperimen dan
penggunaan terdapat dalam [panduan mod lokal](typecheck-low-memory.md).
Gate Fasa10 yang lain kekal terbuka; keputusan prestasi tidak ditukar kepada lulus.

Binaan frontend terkini `auth-smooth-build-07032abb4d13` lulus dalam20.72s
selepas perubahan package.json. Ia tidak menggantikan gate full release build.
