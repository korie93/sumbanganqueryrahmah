# Goal: baki 22 amaran CodeQL rate limiting

Status: **pembaikan kod dan semakan lokal selesai; menunggu commit/push dan analisis CodeQL/CI baharu**, 17 November 2026.

## Matlamat

Baiki punca 22 amaran `js/missing-rate-limiting` yang masih terbuka pada
`main` (`55bdf3b8b824a604a9c501643ca872fd0597bca1`), tanpa mematikan query,
mengecualikan fail ujian atau menutup alert melalui API. Kekalkan permission,
quota akaun, NAT pejabat, Collection dan data production.

Alat goal chat menolak goal baharu kerana goal `auth-smooth-transitions` lama
masih belum lengkap. Jangan tandakan goal lama lengkap semata-mata untuk
mengosongkan slot. Fail ini ialah handoff goal baharu yang boleh dibaca akaun lain.

## Punca dan perubahan

- #50–#51: CSRF dan identiti JWT dipasang sebelum limiter adaptif. Tambah
  `createPreAuthRateLimiter` sebelum kedua-duanya. Had menggunakan tetapan
  flood ceiling pejabat sedia ada, 120,000/minit secara default, dalam tingkap
  10 saat. Ia tidak menggantikan atau melonggarkan quota individu/route.
- Guard menggunakan `express-rate-limit` secara terus, stor Redis sedia ada
  untuk topology shared, dan bounded memory untuk mod memory. Kegagalan Redis
  menghentikan permintaan dengan 503; lebihan quota menghasilkan 429 dan
  `Retry-After`. Tiada pengecualian berdasarkan token atau header pengguna.
- #42–#49, #55, #57, #74–#78: fixture bersama mendapat guard sebenar melalui
  `createJsonTestApp` / `createRateLimitedTestApp`. `/fixture/*` turut diliputi.
- #52, #54, #56, #63, #79: fixture yang membina Express sendiri ditukar kepada
  helper guarded. Guard fixture menggunakan stor memory sendiri, tidak Redis
  production. Tiada perubahan pada assertion asal atau auth/permission double.
- Semua route AI production sudah berada selepas limiter adaptif; guard awal
  juga melindunginya. Amaran tersebut bukan bukti lima endpoint AI tanpa kawalan.

## Bukti setakat ini

Harness: `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/auth-smooth-20261113/sandbox.cjs`.
OS sandbox WSL/bwrap, rangkaian luaran disekat, sumber/toolchain read-only,
data sintetik, scratch sahaja, CPU/RAM/proses/masa terhad. Jalankan satu job
harness pada satu masa; jangan tindih `driver.lock`.

- RED `auth-smooth-tests-b84cdfe505da`: kontrak susunan gagal kerana guard awal tiada.
- `auth-smooth-tests-37c333581683`: 38/38 lulus — admission, 100 staff NAT
  dalam NORMAL/DEGRADED/PROTECTION, quota identiti dan lima route AI.
- `auth-smooth-tests-e20fdc2fb338`: 120/120 lulus — Collection handler,
  avatar, respons auth, HTTP 2FA, AI ownership/routes, permission matrix,
  recovery/2FA NAT, limiter, stor Redis dan sempadan CSRF/CORS.
- `auth-smooth-tests-bb2263b18c79`: 14/14 lulus — termasuk RSA sebenar
  (permintaan yang disekat tidak memanggil JWT verify) dan `/fixture/*` 429.
- Test baharu dipindahkan ke `server/http/tests/pre-auth-rate-limit.test.ts`
  supaya `npm run test:http` CI menjalankannya secara automatik.
- RED `auth-smooth-tests-99f2ccf47f08`: casing `/API/fixture` berjaya
  melepasi guard asal. Predicate guard kini menyamakan casing dengan routing
  Express. `auth-smooth-tests-2e1e61a51d01`: **16/16 lulus**, termasuk
  pipeline sebenar, RSA, 100 staff NAT setiap mod, fixture dan sempadan AI.
- `auth-smooth-tests-6a176720f445`: **108/108 lulus** — login/auth,
  Activity, nickname dashboard, dashboard account/summary, nickname Collection,
  save access dan team filter. Ulangan ini menggunakan scratch untuk resit
  sintetik. Percubaan `a616b9bfd689` sebelum itu gagal kerana fixture cuba
  menulis `/src/uploads` yang read-only; percubaan itu bukan keputusan lulus.
- Tiga kumpulan akhir runtime (120 + 108 + 16) memberikan **244 ujian lulus**.
  Ini bukan keseluruhan suite CI. Ujian dua worker menggunakan shared-store
  double; ia bukan ujian dua proses production atau Redis sebenar.
- `auth-smooth-tests-b28fd7bbfc8a`: typecheck tertumpu lima fail teras lulus,
  dengan pilihan tsconfig projek asal. Typecheck penuh projek belum dijalankan.
- `auth-smooth-tests-5334ac32d8aa`: typecheck tertumpu enam fail fixture/kontrak
  yang berubah lulus. Jumlah 11 fail TypeScript berubah diperiksa dalam dua kumpulan.
- `auth-smooth-tests-66ef9d3a729c`: lint kesemua 10 fail server TypeScript
  berubah lulus. Fail `tests/security/http-provenance-boundaries.test.ts`
  berada di luar skop ESLint projek; ia diuji runtime dan typecheck di atas.
- `git diff --check` lulus. Tiada dependency atau workflow CodeQL diubah.

Bukti stdout/stderr disimpan di direktori `evidence/<run-id>/` di sebelah
harness. Metadata `<run-id>.json` mengandungi exit code, kiraan dan hash bukti.
Manifest sumber untuk lint/typecheck akhir:
`e94429e224dce14638de838db1e9579cc4f68d9f938b68165ee16fd4f415ae84`.

## Skop fail dan kesan operasi

- `server/middleware/pre-auth-rate-limit.ts`: guard baharu dan respons gagal stor.
- `server/internal/local-http-pipeline.ts`: pemasangan sebelum CSRF/JWT.
- `server/middleware/redis-rate-limit-store.ts`: eksport kelas bounded memory
  sedia ada; algoritma stor tidak diubah.
- `server/routes/tests/http-test-utils.ts`: fixture guarded yang terasing.
- `server/http/tests/pre-auth-rate-limit.test.ts`: 13 kes regresi baharu.
- `server/http/tests/local-http-pipeline-order-contract.test.ts`: kontrak susunan.
- Fixture sedia ada: `server/http/tests/auth-recovery-nat.test.ts`,
  `server/http/tests/two-factor-management-nat.test.ts`,
  `server/middleware/tests/rate-limit.test.ts`,
  `server/routes/tests/auth-avatar.routes.test.ts`,
  `tests/security/http-provenance-boundaries.test.ts`.
- `.env.example`: penjelasan penggunaan ceiling sedia ada, tiada nilai diubah.

Guard menambah satu operasi stor bagi permintaan API/telemetry yang diliputi.
Dalam mod Redis, ini bermaksud tambahan operasi Redis setiap permintaan.
Prestasi production belum dibenchmark. Mod memory mempunyai quota per proses;
topology berbilang worker perlu mengekalkan konfigurasi shared Redis sedia ada.
Tiada perubahan schema, data Collection, permission atau UI. Tiada akses
data production dalam ujian ini.

## Baki kerja

1. Commit/push apabila diminta pengguna; jalankan CodeQL asal dan pastikan
   fingerprint #42–#52, #54–#57, #63 dan #74–#79 benar-benar selesai.
2. Jangan dakwa 0 alert sebelum analisis commit baharu. CLI CodeQL belum
   tersedia lokal; tiada custom model, suppression atau perubahan workflow.
3. Suite PostgreSQL pakai buang dan keseluruhan CI kekal perlu disahkan
   pada commit baharu. Tiada ujian pada akaun/data production.
4. Jika amaran masih terbuka, baca trace analisis baharu sebelum mengubah kod;
   jangan buang assertion, menutup alert secara manual atau menukar query.

Working tree: `codex/visual-layout-repair`, asas `cac318b3` (tree sama dengan
`main` 55bdf3b8). Folder tooling untracked `.agents`, `.codex`, `.github/agents`,
`.github/hooks`, `.github/skills`, `.impeccable` bukan perubahan tugas ini.
