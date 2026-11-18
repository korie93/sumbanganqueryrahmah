# Baki amaran CodeQL — 17 November 2026

Susulan pembaikan 22 amaran rate limiting, keputusan regresi dan status CI
direkodkan dalam [goal CodeQL rate limit](codeql-rate-limit-goal.md).
Laporan di bawah mengekalkan hasil semakan kumpulan terdahulu.

## Skop dan keputusan

Semakan bermula pada `a3e3e574fd8cc8e0d5a2c2dcfca06139a04289a1`, branch
`codex/visual-layout-repair`. API GitHub menyenaraikan 39 amaran terbuka pada
branch ini; #82 tidak lagi berada dalam senarai terbuka selepas pembetulan proxy
auth terdahulu. Nombor di bawah ialah nombor amaran, bukan bilangan kelemahan
production yang telah terbukti.

17 amaran mempunyai perubahan sumber/ujian dalam kumpulan ini. Dua daripadanya
ialah SSRF dalam **fixture lokal**, bukannya endpoint production. Baki 22 ialah
amaran rate limit yang memerlukan konteks pemasangan middleware dan fixture.
Tiada amaran ditutup melalui API, tiada query dimatikan, dan tiada folder ujian
dikecualikan daripada CodeQL. Status GitHub selepas perubahan ini memerlukan
analisis CI pada commit baharu; keputusan lokal tidak membuktikan alert ditutup.

## Pembetulan sumber

| Amaran | Fail | Punca dan pembetulan |
| --- | --- | --- |
| #70 | `scripts/lib/single-active-tab-fixture.mjs` | URL dinormalisasi dua kali; `/safe/..//host/path` boleh menjadi authority pada permintaan proxy. Guna terus handler static yang menghadkan fail kepada public root; tiada HTTP client outbound. Kekalkan cookie sintetik, GET/HEAD dan websocket. |
| #71 | `scripts/lib/general-search-empty-fixture.mjs` | Corak proxy sama. Guna handler fixture secara terus; kekalkan CSP, state, API sintetik dan respons carian kosong. Tolak authority/backslash sebelum parsing. |
| #62 | `scripts/lib/client-entry-shell-contract.mjs` | Pemeriksa terlepas penutup script seperti `</script foo="bar">`. Kini kes huruf, whitespace, atribut penutup dan script tanpa penutup turut dikesan. Ini pemeriksa kontrak HTML terkawal, bukan sanitizer umum. |
| #61 | `scripts/test-visual-built.mjs` | Wrapper membina regex daripada argumen CLI walaupun Playwright sendiri akan menyusunnya. Buang kompilasi berulang; kekalkan had argumen, forwarding literal tanpa shell dan sokongan expression. Playwright masih melaporkan syntax regex tidak sah. Ini argumen operator lokal, bukan input pengguna web. |
| #81 | `client/src/components/ai-space-presentation.test.ts` | Helper ujian membuang tag dengan replace. Kini baca nod teks feedback yang sudah di-escape; tiada gabungan semula serpihan HTML. |
| #72 | `client/src/pages/general-search/general-search-empty.test.ts` | Helper perbandingan SVG membuang komen sebelum tokenisasi. Kini komen dikonsumsi sebagai token tanpa menggabungkan serpihan. Artwork dan sanitizer production tidak diubah. |
| #80 | `client/src/pages/viewer/viewer-filter-column-search.test.ts` | Assertion script diperluas kepada sempadan nama tag dan semua kes huruf. |
| #73 | `client/src/pages/settings/account-management/managed-account-dashboard-status.test.ts` | Sama. |
| #69 | `client/src/components/auth/credential-recovery-layout.test.ts` | Sama. |
| #68 | `client/src/pages/collection-summary/CollectionMonthlyComparisonPanel.test.tsx` | Sama; semakan Infinity/NaN/undefined dikekalkan. |
| #67 | `client/src/pages/collection-summary/CollectionMonthlyComparisonLedger.test.ts` | Sama. |
| #66 | `client/src/pages/collection/tests/collection-source-match-display-contract.test.ts` | Sama. |
| #65 | `client/src/pages/collection-records/tests/collection-record-edit-change-summary.test.ts` | Sama; semakan img dikekalkan. |
| #64 | `client/src/pages/collection-summary/collection-monthly-export-context.test.ts` | Sama. |
| #60 | `client/src/pages/general-search/tests/highlight-match-presentation.test.tsx` | Sama, dengan payload script huruf bercampur dan atribut. |
| #59 | `client/src/pages/collection-summary/CollectionMonthlyComparisonDataQualityCard.test.tsx` | Sama; semakan had Signal dikekalkan. |
| #58 | `client/src/pages/general-search/GeneralSearchCollectionStatus.test.ts` | Sama bagi kedua-dua assertion escaping. |

## Amaran rate limit: jangan tambah had rawak untuk menghijaukan scanner

| Amaran | Bukti dan status |
| --- | --- |
| #74–#78 | Lima route di `server/routes/ai.routes.ts`. Trace #74 menghala ke guard sintetik dalam `server/routes/tests/ai-conversation-ownership.integration.test.ts`, bukan guard production. Runtime memasang `registerLocalHttpPipeline` sebelum `registerLocalServerRoutes`; `adaptiveRateLimit` meliputi `/api/ai/`. Ujian baharu `ai-rate-limit-boundary.test.ts` memeriksa kelima-lima route: 429/503 sebelum auth/controller serta 200 apabila quota tersedia. Tiada bukti lima route production ini tidak dilindungi. |
| #79 | `tests/security/http-provenance-boundaries.test.ts:16`: fixture CSRF/CORS lokal dengan counter sintetik, bind loopback sendiri; bukan route production. |
| #63 | `server/routes/tests/auth-avatar.routes.test.ts:25`: fixture fail avatar sementara, auth/storage double dan limiter spy. |
| #57 | `server/routes/tests/auth-two-factor-http.test.ts:77`: fixture dengan limiter no-op yang disengajakan untuk menguji komposisi auth/crypto; kuota diuji dalam suite berasingan. |
| #56 | `server/http/tests/two-factor-management-nat.test.ts:27`: suite menguji limiter sebenar selepas CSRF dan identiti sintetik, termasuk mod protection. |
| #55 | `server/routes/tests/auth-route-response-utils.test.ts:40`: route `/fixture/recovery` bagi log ralat sintetik dan respons selamat. |
| #54 | `server/http/tests/auth-recovery-nat.test.ts:34`: suite limiter recovery dengan stor token sintetik serta protection sebenar. |
| #52 | `server/middleware/tests/rate-limit.test.ts:496`: ujian CSRF + limiter sebenar untuk 100 pengguna NAT, bukannya endpoint tanpa quota. |
| #48–#49 | `server/repositories/tests/role-permissions-postgres.integration.test.ts:67–68`: route `/fixture/activity` dan `/fixture/viewer` pada DB pakai buang; fokus permission. DB integration tidak dijalankan semula dalam kumpulan lokal ini. |
| #47 | `server/repositories/tests/auth-managed-user-delete-postgres.integration.test.ts:164`: `/fixture/authenticated` bagi lifecycle pemadaman pada DB pakai buang. DB integration tidak dijalankan semula di sini. |
| #42–#46 | `server/routes/tests/collection-route-handler-factories.test.ts`: route sintetik menguji idempotency, replay, conflict dan cleanup; bukan route Collection production. |
| #50–#51 | `server/internal/local-http-pipeline.ts:86–87`: CSRF dan pengesahan identiti quota berada **sebelum** limiter adaptif. Identiti ini bukan authorization dan tidak memuatkan `req.user`; guard revocation/role sebenar masih wajib. Ujian susunan dan quota diluluskan. Kos pre-verification/CSRF pada trafik volum tinggi belum dibuktikan selamat oleh ujian ini: kekalkan sebagai **needs-validation**, jangan label selesai/false positive secara automatik. Perubahan flood guard sebelum identiti memerlukan ukuran dan regresi NAT tersendiri. |

Pelayan fixture bersama `server/routes/tests/http-test-utils.ts` kini bind
`127.0.0.1` secara eksplisit. Sebelum ini `app.listen(0)` menerima sambungan pada
semua interface. Had ini mengelakkan auth header sintetik terdedah kepada LAN;
ia tidak menambah limiter palsu ke ujian atau mengubah limiter production.

Model CodeQL lalai tidak meliputi setiap limiter tersuai. Dokumentasi rasmi
menyediakan sambungan `RateLimitedRouteHandlerExpr`, tetapi model tersuai atau
suppression belum ditambah kerana CodeQL CLI tidak tersedia untuk mengesahkan
semantik model tersebut. Kekalkan query dan semua fail dalam analisis.

## Bukti ujian

Ujian dijalankan dalam WSL/bwrap: sumber/toolchain read-only, rangkaian luaran
disekat, loopback terasing, data sintetik, scratch terhad, 1 CPU, RAM 768 MiB,
swap 0 dan had 128 proses. Tiada akses production atau perubahan data Collection.

- Sebelum pembetulan SSRF: `auth-smooth-tests-2584a2ae39ca` menunjukkan
  `/safe/..//127.0.0.1:<port>/probe` mendapat 200 daripada canary, bukan 404.
- Selepas pembetulan: kedua-dua fixture diuji dengan authority, dot-segment,
  encoded dot-segment dan backslash; canary mesti menerima **0 permintaan**.
- `auth-smooth-tests-04a25d274d95`: **52/52** — 23 script/fixture + 29 Collection.
- `auth-smooth-tests-eddf9b1e6ff8`: **43/43** — AI, auth, Viewer, Settings,
  General Search, escaping dan SVG reference.
- `auth-smooth-tests-c640f2a11f8b`: **23/23** — lima route AI, 20–100 pengguna
  NAT dalam tiga mod, kuota pengguna/upload/AI serta susunan pipeline.
- `auth-smooth-tests-dfd52c1db40b`: **41/41** — idempotency/cleanup Collection,
  auth response/logging, kuota recovery/2FA, sempadan CSRF/CORS. Untuk ujian
  cleanup, cwd ialah scratch supaya resit sintetik tidak ditulis ke sumber
  read-only. Percubaan awal gagal pada laluan `/src/uploads`, bukan assertion
  produk; selepas pembetulan cwd harness, semua ujian lulus.
- `auth-smooth-tests-6bb2599ab349`: **17/17** — pengesahan semula AI feedback,
  escaping status Collection, pemilikan perbualan AI dan aliran HTTP 2FA.
- `auth-smooth-tests-68c6aedc3825`: lint semua 15 fail TypeScript yang berubah lulus.
- `auth-smooth-tests-56148f989a01`: typecheck tertumpu dua fail backend lulus.
- `auth-smooth-tests-341bf4c42ae0`: typecheck tertumpu helper ujian AI/SVG lulus.
  Percubaan gabungan 13 fail client (`auth-smooth-tests-ede3f6f58dcb`) kehabisan
  heap 384 MiB; jangan anggap typecheck seluruh projek sudah lulus.
- Pecahan baki client: `auth-smooth-tests-5aeda1c2cb37` (5 fail) dan
  `auth-smooth-tests-106f8df0a5a6` (6 fail) lulus. Dengan kumpulan AI/SVG dan
  backend di atas, **semua 15 fail TypeScript yang berubah** lulus semakan
  jenis tertumpu menggunakan pilihan tsconfig asal. Ini bukan typecheck
  keseluruhan graf projek.
- `auth-smooth-build-df630d50e461`: build frontend Vite lulus.
- Browser dua tab pada build tersebut: `auth-smooth-tests-ca39cf488f39`
  melepasi **7 pemeriksaan awal**, termasuk deep-link, tiada protected
  mount/fetch/WebSocket pada tab disekat, navigasi asal, close/recheck,
  refresh serentak, hydration dan unsupported Web Locks. Suite berhenti pada
  assertion kesamaan lebar dua butang di **641px**.
- Pembandingan terkawal `auth-smooth-tests-40170c3aa0f8` menggunakan frontend,
  Chromium, viewport dan harness sama, dengan kedua-dua fixture daripada
  commit `a3e3e574` (sebelum perubahan), turut gagal pada assertion **641px
  yang sama**. Ini bukan regresi fixture SSRF. Tiada perubahan CSS/UI atau
  pelonggaran assertion dibuat. Suite browser penuh kekal **belum lulus**,
  dan pemeriksaan selepas assertion tersebut belum dijalankan dalam run ini.
- Browser menggunakan Chromium lokal, data sintetik dan `navigator.onLine`
  tetap true untuk loopback sandbox tanpa rangkaian luaran. Ini bukan ujian
  offline atau ukuran visual production.
- Harness lokal menggunakan TypeScript loader sedia ada. Panggilan tunggal
  `tsImport` untuk schema fixture turut menggunakan loader ini kerana binary
  esbuild Linux tiada; tiada dependency dimuat turun. CI kekal menggunakan
  runner asal projek.

`git diff --check` lulus. Jangan tafsir ujian terpilih ini sebagai keseluruhan CI,
CodeQL baharu, ujian beban pre-auth, atau DB integration yang sudah lulus.

## Baki kerja dan syarat penutupan

1. Selepas commit/push, jalankan CodeQL asal dan semak fingerprint/status
   #58–#81 yang disentuh. Jangan anggap perubahan lokasi baris menutup isu.
2. #50–#51 belum ditutup: sahkan kos CSRF/JWT sebelum limiter dalam sandbox
   dengan kunci RSA sintetik dan konfigurasi production yang disanitasi.
   CSRF membandingkan buffer tetap 64 bait; JWT disahkan sekali setiap request
   dan digunakan semula oleh guard, tetapi itu bukan bukti ketahanan flood.
   Jika perlu guard awal, uji pemisahan quota dan beban 30–100 staff NAT sebelum
   mengubah susunan middleware. Jangan alihkan limiter kecil tanpa identiti
   ke hadapan dan mengulangi masalah shared-IP terdahulu.
3. Semak 20 amaran rate-limit konteks fixture/global secara berasingan sebelum
   sebarang dismissal/model khusus. Query serta analisis keselamatan ujian
   masih aktif. Dua suite DB pakai buang kekal dalam CI.
4. Siasat assertion layout 641px secara berasingan dengan browser/versi font
   CI yang sama. Tiada perubahan reka bentuk dibuat dalam pembetulan CodeQL.

Laporan ini merekodkan pengesahan sebelum commit/push. Status CodeQL selepas
push perlu disemak pada commit berkenaan; deployment production tidak dilakukan.

## Rujukan teknikal

- [CodeQL: bad HTML filtering regexp](https://codeql.github.com/codeql-query-help/javascript/js-bad-tag-filter/)
- [CodeQL: missing rate limiting](https://codeql.github.com/codeql-query-help/javascript/js-missing-rate-limiting/)
- [CodeQL: model rate limiter tersuai](https://codeql.github.com/codeql-standard-libraries/javascript/semmle/javascript/security/dataflow/MissingRateLimiting.qll/module.MissingRateLimiting.html)
