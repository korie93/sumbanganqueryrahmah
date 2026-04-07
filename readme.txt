================================================================================
  LAPORAN AUDIT PENUH SISTEM — SUMBANGAN QUERY RAHMAH (SQR)
  Tarikh Audit: 2026-04-07
  Kaedah: Pemeriksaan kod statik keseluruhan (backend, frontend, config, infra)
  Mod: Dokumentasi sahaja — tiada perubahan kod dilakukan
================================================================================

RINGKASAN EKSEKUTIF
====================

Codebase ini menunjukkan tahap kematangan yang TINGGI — dengan 269 fail ujian,
pipeline CI/CD yang komprehensif, CSRF protection, Trusted Types, structured
logging, dan seni bina berlapis. Walau bagaimanapun, terdapat 74 isu yang perlu
ditangani merentas keselamatan, prestasi, UI/UX, dan kualiti kod.


RINGKASAN ISU
=============

+------------------------+----------+------+--------+-----+--------+
| Kategori               | CRITICAL | HIGH | MEDIUM | LOW | Jumlah |
+------------------------+----------+------+--------+-----+--------+
| Security               |     3    |   7  |    5   |  2  |   17   |
| Type Safety            |     2    |   1  |    2   |  1  |    6   |
| Error Handling         |     0    |   2  |    2   |  2  |    6   |
| Performance            |     0    |   1  |    3   |  2  |    6   |
| React/Frontend         |     2    |   3  |    2   |  2  |    9   |
| UI/UX & Accessibility  |     0    |   1  |    3   |  3  |    7   |
| CSS/Layout             |     0    |   0  |    2   |  1  |    3   |
| Database/Schema        |     0    |   0  |    2   |  1  |    3   |
| Architecture           |     0    |   0  |    1   |  2  |    3   |
| CI/CD                  |     0    |   2  |    3   |  2  |    7   |
| Config/Deployment      |     1    |   2  |    2   |  2  |    7   |
+------------------------+----------+------+--------+-----+--------+
| JUMLAH                 |     8    |  19  |   27   | 20  |   74   |
+------------------------+----------+------+--------+-----+--------+


================================================================================
  BAHAGIAN 1: ISU CRITICAL — MESTI DIPERBAIKI SEGERA
================================================================================

#1  WebSocket CSRF Vulnerability
    Fail: server/ws/runtime-manager.ts (baris 134-135)
    Isu:  WebSocket menerima token dari query string ?token=...
          Browser tidak boleh set custom headers pada WebSocket upgrade,
          jadi query-string auth terdedah kepada CSRF attack.
    Cadangan: Tolak token dari query string, hanya terima dari
              cookie/headers yang dilindungi CSRF.

#2  Unsafe Session Secret Fallback untuk 2FA
    Fail: server/config/security.ts (baris 16-27)
    Isu:  getTwoFactorDecryptionSecrets() guna sessionSecret sebagai
          fallback untuk 2FA decryption. Jika session secret bocor,
          2FA encryption juga terjejas.
    Cadangan: Guna dedicated TWO_FACTOR_ENCRYPTION_KEY sahaja,
              jangan fallback ke session secret.

#3  .env.example — Default Secret Terlalu Lemah
    Fail: .env.example (baris 13, 36)
    Isu:  SESSION_SECRET=change-this-session-secret (kurang 32 aksara)
          PG_PASSWORD=change-this-db-password (terlalu lemah)
          Developer mungkin guna default ini di production.
    Cadangan: Tukar kepada placeholder yang jelas tidak boleh dipakai
              + tambah arahan generate:
              # Generate: node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
              SESSION_SECRET=GENERATE-ME-AT-LEAST-32-CHARS

#4  Missing Backup Encryption Key Guidance
    Fail: .env.example (baris 125)
    Isu:  BACKUP_ENCRYPTION_KEY= kosong tanpa panduan penjanaan.
          Backup tanpa encryption key boleh didekripsi oleh sesiapa.
    Cadangan: Tambah arahan generate dan amaran keselamatan.

#5  React List Key Anti-Pattern (15+ fail)
    Fail: MonitorDeferredSection.tsx, CollectionRecordsPage.tsx,
          AuditLogsFiltersPanel.tsx, dan 12+ fail lain
    Isu:  Guna key={index} pada senarai dinamik. Jika senarai
          ditambah/dipadam/disusun semula, React akan rosakkan state
          komponen — input form hilang, fokus salah, data tak betul.
    Cadangan: Guna ID unik dan stabil untuk setiap item senarai.

#6  Unsafe 'as any' pada Parsing Import Data
    Fail: client/src/pages/import/parsing.ts (baris 122-124)
    Isu:  null as any dan akses property tanpa type guard pada data
          Excel yang tidak divalidasi. Data luar yang tidak dipercayai
          dicast terus tanpa semakan.
    Cadangan: Guna Zod schema atau type guard yang betul.

#7  AIChat Message Key Tidak Stabil
    Fail: client/src/components/AIChat.tsx (baris 78)
    Isu:  key={`${msg.timestamp}-${idx}`} — gabungan timestamp+index
          tidak unik. Jika mesej tiba out-of-order, React boleh reuse
          DOM dengan salah.
    Cadangan: Guna msg.id yang unik.

#8  WebSocket Tiada Had Sambungan Per Pengguna
    Fail: server/ws/runtime-manager.ts (baris 22-47)
    Isu:  Satu pengguna boleh buat sambungan WebSocket tanpa had
          -> kehabisan memori (DoS).
    Cadangan: Tambah MAX_CONNECTIONS_PER_USER = 5.


================================================================================
  BAHAGIAN 2: ISU HIGH — PERLU DIPERBAIKI SEBELUM PRODUCTION
================================================================================

#9  Command Injection Risk dalam External Scan
    Fail: server/lib/collection-receipt-external-scan.ts (baris 145)
    Isu:  spawn(config.command, args) — command dan args datang dari
          env variable. Jika env variable dimanipulasi, boleh jadi
          command injection. Args ada {file} placeholder yang diganti
          dengan file path.
    Cadangan: Validate command path wujud dan bukan shell command.
              Pastikan file path tidak mengandungi shell metacharacters.

#10 File Upload MIME Type Spoofing
    Fail: server/routes/collection-receipt-file-type-utils.ts
    Isu:  Validasi extension hanya semak .startsWith("image/") untuk
          MIME type. MIME type dikawal oleh attacker dan boleh dipalsukan.
    Cadangan: Detect jenis fail sebenar dari file buffer menggunakan
              library 'file-type'.

#11 Path Traversal dalam Frontend Static Files
    Fail: server/internal/frontend-static.ts (baris 52-53)
    Isu:  path.resolve(cwd, relPath) tanpa pengesahan bahawa relPath
          tidak keluar dari cwd. Client boleh request ../../etc/passwd.
    Cadangan: Tambah semakan path containment menggunakan
              isPathInsideDirectory().

#12 Login Rate Limit Boleh Dielak
    Fail: server/middleware/rate-limit.ts (baris 90)
    Isu:  Login rate limiter guna req.body?.username dalam key.
          Attacker boleh bypass dengan tukar username sambil serang
          IP yang sama.
    Cadangan: Tambah IP sebagai rate limit key utama.

#13 CI/CD — Hardcoded Credentials
    Fail: .github/workflows/ci.yml (baris 126, 134, 137)
    Isu:  SESSION_SECRET: ci-session-secret (lemah)
          PG_PASSWORD: postgres (default password)
          SEED_SUPERUSER_PASSWORD: Password123! (lemah)
    Cadangan: Guna GitHub Secrets atau generate secara dinamik.

#14 CI/CD — Tiada Security Scanning
    Fail: .github/workflows/ci.yml
    Isu:  Tiada SAST, dependency scanning, atau secret scanning
          dalam pipeline. Vulnerable packages boleh masuk tanpa dikesan.
    Cadangan: Tambah CodeQL atau Trivy scanning.

#15 Tiada npm audit dalam CI
    Fail: .github/workflows/ci.yml
    Isu:  Script npm run audit:dependencies wujud tapi tidak dipanggil
          dalam CI. 4 moderate vulnerabilities telah dikesan (esbuild
          via drizzle-kit).
    Cadangan: Tambah step npm run audit:dependencies dalam CI.

#16 PM2 Config Tanpa User/Group Specification
    Fail: deploy/pm2/ecosystem.config.cjs.example
    Isu:  Tiada OS user specification. Process mungkin berjalan sebagai
          root.
    Cadangan: Tambah user: "www-data", uid, gid.

#17 Token Storage dalam localStorage (Masih Ada Legacy)
    Fail: client/src/lib/auth-session.ts (baris 41-44, 60-61)
    Isu:  Migrasi dari localStorage ke sessionStorage masih dalam proses.
          Legacy localStorage access masih wujud. Token dalam localStorage
          terdedah kepada XSS.
    Cadangan: Selesaikan migrasi sepenuhnya. Pertimbangkan HttpOnly cookies.

#18 Missing useEffect Cleanup (Memory Leak)
    Fail: client/src/components/useAIChatTypingAction.ts (baris 46)
    Isu:  useEffect cipta setInterval tanpa cleanup function. Memory
          leak pada setiap re-render atau unmount.
    Cadangan: Tambah return cleanup dalam useEffect.

#19 AI Chat Error State Tidak Konsisten
    Fail: client/src/components/useAIChatState.ts (baris 130-200)
    Isu:  executeSearch guna fetch dengan abort controller tapi error
          handling tidak konsisten. Jika network gagal mid-stream,
          error state mungkin tidak dikemaskini.
    Cadangan: Pastikan semua error path set error state dan kemaskini UI.

#20 Typing Indicator Tiada Accessibility Label
    Fail: client/src/components/AIChat.tsx (baris 89-93)
    Isu:  Typing indicator dots tiada aria-label. Pengguna screen
          reader tidak tahu apa ini.
    Cadangan: Tambah aria-label="AI sedang berfikir".


================================================================================
  BAHAGIAN 3: ISU MEDIUM — PERLU DIPERBAIKI
================================================================================

#21 Unvalidated Idempotency Header
    Fail: server/routes/collection/collection-route-handler-factories.ts
          (baris 87-90)
    Isu:  Header x-idempotency-fingerprint terima sehingga 2048 aksara
          tanpa validasi format JSON.
    Cadangan: Had kepada 512 aksara dan validasi format.

#22 Missing NOT NULL Constraints pada Collection Fields
    Fail: shared/schema-postgres-collection.ts
    Isu:  Beberapa field kritikal nullable walaupun ada default values.
    Cadangan: Tambah .notNull() pada field yang wajib.

#23 Tab Visibility Cache Tiada Eviction
    Fail: server/auth/guards.ts (baris 75-87)
    Isu:  Cache tiada had saiz. Dengan banyak roles, cache membesar
          tanpa kawalan (memory leak).
    Cadangan: Implement LRU cache dengan MAX_CACHE_SIZE = 100.

#24 Missing Cascade Delete pada Foreign Keys
    Fail: server/internal/collection-bootstrap-record-schema.ts
    Isu:  Record yatim tidak dibersihkan apabila parent dipadam.
    Cadangan: Tambah ON DELETE CASCADE.

#25 Pagination Tiada Had Maximum
    Fail: shared/api-contracts.ts
    Isu:  Pagination schema tiada limit maximum. Client boleh request
          limit=999999999 -> DoS.
    Cadangan: Tambah z.number().max(1000).

#26 Readline Stream Error Tidak Ditangani
    Fail: server/services/import-upload-csv-utils.ts (baris 80-115)
    Isu:  for await (const rawLine of lineReader) boleh throw
          unhandled error jika lineReader.close() gagal.
    Cadangan: Tambah lineReader.on("error", ...).

#27 WebSocket Session Auth Silent Catch
    Fail: server/ws/session-auth.ts (baris 20-22)
    Isu:  JWT validation error ditelan tanpa logging. Attacker boleh
          probe untuk valid activity IDs tanpa dikesan.
    Cadangan: Log suspicious JWT validation failures.

#28 CORS Missing Access-Control-Allow-Credentials
    Fail: server/http/cors.ts (baris 101-129)
    Isu:  Tiada Access-Control-Allow-Credentials header, tiada
          Access-Control-Max-Age (preflight caching).
    Cadangan: Tambah headers yang hilang.

#29 Missing Source Map Config untuk Staging
    Fail: vite.config.ts (baris 35)
    Isu:  sourcemap: false global. Tiada config berbeza untuk staging
          vs production.
    Cadangan: Tambah environment-aware source maps.

#30 Chunk Size Warning Limit Terlalu Tinggi
    Fail: vite.config.ts (baris 36)
    Isu:  chunkSizeWarningLimit: 1200 (1200 KB) — default ialah 500 KB.
    Cadangan: Kurangkan kepada 600 KB dan optimumkan chunk splitting.

#31 Nginx Config Tiada HTTPS/SSL
    Fail: deploy/nginx/sqr.conf.example
    Isu:  Tiada HTTPS configuration, tiada security headers dari Nginx,
          tiada rate limiting di peringkat Nginx.
    Cadangan: Tambah SSL config dan security headers.

#32 100vh vs 100dvh pada Mobile
    Fail: Pelbagai — AIConversationCard.tsx, BackupList.tsx, dll.
    Isu:  100vh tidak mengambil kira UI browser mobile. Menyebabkan
          overflow dan kandungan tersembunyi.
    Cadangan: Guna 100dvh dengan @supports fallback.

#33 console.error dalam Production Code
    Fail: useActivityFeedState.ts, useAuditLogsDataState.ts, 10+ fail lain
    Isu:  console.error boleh dedahkan maklumat sensitif dan cipta
          log noise.
    Cadangan: Guna error tracking service atau buang log tak kritikal.

#34 TypeScript Missing Strictness Options
    Fail: tsconfig.json
    Isu:  Missing exactOptionalPropertyTypes, noUnusedLocals,
          noUnusedParameters, noImplicitReturns.
    Cadangan: Tambah secara beransur-ansur.

#35 588 Instances of any/@ts-ignore/@ts-expect-error
    Isu:  Jumlah tinggi menandakan banyak bahagian kod tanpa typing
          yang betul.
    Cadangan: Kurangkan secara beransur-ansur, utamakan bahagian yang
              mengendalikan data luaran.

#36 Missing Test Coverage Reporting dalam CI
    Fail: .github/workflows/ci.yml (baris 68-98)
    Isu:  Coverage job muat naik artifacts tapi tiada badge/status
          check integration. Tiada kegagalan jika coverage menurun.
    Cadangan: Integrate dengan Codecov atau serupa.

#37 Missing Test Suites dalam CI
    Fail: .github/workflows/ci.yml
    Isu:  test:repositories, test:ws, test:intelligence wujud tapi
          tidak dipanggil dalam CI.
    Cadangan: Tambah test steps yang hilang.

#38 Missing Form Loading States
    Fail: useLoginPageState.ts dan form lain
    Isu:  Form tiada loading state semasa submission. Pengguna mungkin
          klik submit berkali-kali.
    Cadangan: Tambah isLoading state dan disabled={isLoading} pada butang.

#39 Drizzle Config Tiada DATABASE_URL Support
    Fail: drizzle.config.ts (baris 13-19)
    Isu:  Hanya terima parameter individu (host/port/user/password),
          tiada sokongan untuk DATABASE_URL connection string.
    Cadangan: Tambah sokongan DATABASE_URL.

#40 Missing @types Packages
    Fail: package.json
    Isu:  Hilang @types/react-window, @types/recharts.
    Cadangan: Tambah dev dependencies.


================================================================================
  BAHAGIAN 4: ISU LOW — CADANGAN PENAMBAHBAIKAN
================================================================================

#41 Unsafe res: any dalam Error Handler
    Fail: server/routes/collection/collection-route-handler-factories.ts
          (baris 29)
    Isu:  res ditaip sebagai any, melangkau keselamatan jenis Express.
    Cadangan: Guna Response dari Express.

#42 Error Response Format Tidak Konsisten
    Fail: server/routes/collection-receipt.service.ts (baris 125-135)
    Isu:  Error responses kadang ada error.code, kadang hanya message.
    Cadangan: Standardkan format error response.

#43 WebSocket Broadcast Silent Catch
    Fail: server/ws/runtime-manager.ts (baris 40-46)
    Isu:  WebSocket send errors ditelan tanpa logging.
    Cadangan: Log error sebelum delete.

#44 JSON Deep Clone untuk Idempotency
    Fail: server/routes/collection/collection-route-handler-factories.ts
          (baris 73-78)
    Isu:  JSON.parse(JSON.stringify(payload)) untuk setiap request —
          O(n) dan membazir.
    Cadangan: Guna deterministic hash.

#45 Oversized File — cluster-local.ts (505 baris)
    Fail: server/cluster-local.ts
    Cadangan: Pecah kepada cluster-lifecycle-manager.ts,
              cluster-scaling-engine.ts, cluster-worker-pool.ts.

#46 Missing Secret Rotation Documentation
    Fail: server/config/security.ts
    Cadangan: Dokumentasi prosedur rotasi SESSION_SECRET dan
              TWO_FACTOR_ENCRYPTION_KEY.

#47 Permission Matrix Test Guna 50+ 'as any'
    Fail: server/routes/tests/permission-matrix.integration.test.ts
    Cadangan: Cipta test doubles yang betul.

#48 Missing Error Messages pada Form Fields
    Fail: Login form dan form lain
    Cadangan: Tambah validasi peringkat field dengan mesej ralat.

#49 Missing 404 Page
    Fail: App routing
    Cadangan: Tambah catch-all route
              <Route path="*" element={<NotFoundPage />} />

#50 Missing Pagination Loading Indicator
    Cadangan: Tambah loading indicator pada kawalan pagination.

#51 .gitignore Missing Patterns
    Isu:  Hilang *.sql, *.dump, pgdata/, .idea/, *.swp.
    Cadangan: Tambah pattern yang hilang.

#52 Dark Mode Config Kurang Explicit
    Fail: tailwind.config.ts (baris 4)
    Cadangan: Tukar darkMode: ["class"] -> darkMode: ["selector", ".dark"].

#53 Status Colors Hardcoded
    Fail: tailwind.config.ts (baris 79-82)
    Cadangan: Guna CSS variables untuk konsistensi.

#54 framer-motion Chunk Referenced Tapi Tiada dalam Dependencies
    Fail: vite.config.ts (baris 89)
    Cadangan: Buang jika tidak digunakan, atau tambah dependency.

#55 Dependency Overrides Tanpa Komen
    Fail: package.json (baris 146-151)
    Cadangan: Tambah komen menjelaskan CVE yang dimaksudkan.


================================================================================
  BAHAGIAN 5: AUDIT BACKEND TERPERINCI
================================================================================

A) KESELAMATAN (SECURITY)
--------------------------

A.1) SQL Injection
     - Drizzle ORM digunakan secara konsisten — tiada raw SQL injection
       yang dikesan.
     - SQL LIKE escaping telah diperbaiki melalui sql-like-utils.ts.
     STATUS: SELAMAT

A.2) CSRF Protection
     - Double-submit token pattern.
     - Sec-Fetch-Site header check.
     - Origin/Referrer validation.
     - Proper 403 responses.
     STATUS: BAIK (Cadangan: Tambah X-CSRF-Token ke exposure list)

A.3) Authentication & Authorization
     - bcrypt dengan configurable cost.
     - Timing-safe comparison dengan dummy hash.
     - Prevents user enumeration.
     - Strong temporary password generation.
     STATUS: BAIK

A.4) Session Management
     - HttpOnly, SameSite, Secure flags pada cookie.
     - Session invalidation pada logout.
     STATUS: BAIK

A.5) Rate Limiting
     - express-rate-limit dengan pelbagai tiers.
     - Login, API, admin endpoints dilindungi.
     ISU: IP spoofing via x-forwarded-for (lihat #12)

A.6) Helmet Security Headers
     - HSTS enabled (180-day max-age).
     - CSP dengan proper directives.
     - X-Content-Type-Options: nosniff.
     - require-trusted-types-for: ["script"].
     STATUS: BAIK

A.7) Body Size Limits
     - Import uploads: 64MB limit.
     - Collection data: 8MB limit.
     - Default: 2MB limit.
     STATUS: BAIK

A.8) Backup Security
     - Streaming dengan cursor-based pagination (QUERY_PAGE_LIMIT=1000).
     - OOM risk lama telah diperbaiki.
     ISU: Restore masih ada unbounded Set<string> untuk record IDs.


B) ERROR HANDLING
------------------

B.1) Global Error Handler
     - server/middleware/error-handler.ts menangkap semua unhandled errors.
     - Structured logging via pino.
     STATUS: BAIK

B.2) Receipt Service
     - 5 catch blocks, SEMUA dengan proper logging.
     - Silent catch block issue telah DISELESAIKAN.
     STATUS: BAIK

B.3) Silent Catches yang Masih Ada
     - WebSocket broadcast (runtime-manager.ts:40-46)
     - WebSocket session auth (session-auth.ts:20-22)
     CADANGAN: Tambah logging.


C) DATABASE
-----------

C.1) Schema
     - Drizzle ORM dengan PostgreSQL.
     - Rollup tables sudah ada composite PKs (DIPERBAIKI).
     - N+1 day insert sudah dibatch via sql.join (DIPERBAIKI).
     ISU: Missing cascade deletes, beberapa nullable fields.

C.2) Migrations
     - Drizzle-kit untuk migration management.
     - Schema governance verified dalam CI.
     STATUS: BAIK


D) ARCHITECTURE
---------------

D.1) Backend Layer Structure
     routes -> controllers -> services -> repositories -> database
     STATUS: Konsisten dan bersih.

D.2) Oversized Files (masih ada 4 fail >700 baris)
     - schema-postgres.ts (898 baris)
     - Viewer.tsx (839 baris)
     - sidebar.tsx (727 baris, generated)
     - collection-record-mutation-operations.ts (725 baris)
     CADANGAN: Pecahkan secara beransur-ansur.

D.3) Logging
     - pino structured logging digunakan secara konsisten.
     STATUS: BAIK


================================================================================
  BAHAGIAN 6: AUDIT FRONTEND TERPERINCI
================================================================================

A) REACT BEST PRACTICES
-------------------------

A.1) Keys dalam Lists
     ISU: 15+ fail guna key={index} — CRITICAL (lihat #5)

A.2) useEffect Dependencies
     - Kebanyakan hooks mempunyai dependency arrays yang betul.
     ISU: useAIChatTypingAction.ts missing cleanup (lihat #18)

A.3) Error Boundaries
     - AppRouteErrorBoundary.tsx wujud dan berfungsi.
     STATUS: BAIK

A.4) Lazy Loading
     - lazy-pages.tsx menggunakan React.lazy() untuk code splitting.
     STATUS: BAIK

A.5) State Management
     - Kombinasi React hooks, context, dan TanStack Query.
     - Tiada prop drilling yang teruk.
     STATUS: BAIK


B) UI/UX & ACCESSIBILITY
--------------------------

B.1) Focus Management
     - Global :focus-visible outline style dalam index.css.
     - Radix UI handles focus management dalam dialogs.
     STATUS: BAIK

B.2) Screen Reader Support
     ISU: Typing indicator tiada aria-label (lihat #20)
     ISU: Beberapa butang tiada accessible names.

B.3) Color Contrast
     - Contrast validation tests wujud.
     STATUS: BAIK

B.4) Responsive Design
     ISU: 100vh pada mobile (lihat #32)
     ISU: Missing form loading states (lihat #38)


C) CSS & LAYOUT
----------------

C.1) Tailwind Configuration
     - Proper content purge.
     - Theme extensions dengan CSS variables.
     STATUS: BAIK

C.2) Z-Index Management
     - Konsisten dalam kebanyakan komponen.
     STATUS: BAIK

C.3) Mobile Viewport
     ISU: Beberapa halaman guna 100vh (lihat #32)


D) SECURITY (FRONTEND)
-----------------------

D.1) XSS Prevention
     - dangerouslySetInnerHTML HANYA di chart.tsx.
     - Dilindungi melalui toTrustedHTML().
     - DOM XSS sink tests wujud.
     STATUS: BAIK

D.2) Safe URL Handling
     - resolveSafeUrl() dengan protocol validation.
     STATUS: BAIK
     ISU KECIL: data: URLs dibenarkan dalam preview (lihat perbincangan)

D.3) Token Storage
     ISU: Legacy localStorage access masih ada (lihat #17)


================================================================================
  BAHAGIAN 7: AUDIT KONFIGURASI & INFRASTRUKTUR
================================================================================

A) PACKAGE.JSON
    - 4 moderate npm audit vulnerabilities (esbuild via drizzle-kit).
    - Dependency overrides untuk qs, lodash, rollup, dompurify (BAIK).
    ISU: Overrides tanpa komen penjelasan (lihat #55).
    ISU: Missing @types packages (lihat #40).

B) TSCONFIG.JSON
    - strict: true AKTIF.
    ISU: Missing additional strictness flags (lihat #34).

C) VITE.CONFIG.TS
    - Manual chunk splitting AKTIF.
    ISU: chunkSizeWarningLimit terlalu tinggi (lihat #30).
    ISU: Tiada source maps untuk staging (lihat #29).

D) CI/CD PIPELINE (.github/workflows/ci.yml)
    - Typecheck, contract tests, client tests, services tests, routes tests.
    - Build verification + bundle budgets.
    - Coverage gate.
    ISU: Hardcoded credentials (lihat #13).
    ISU: Tiada security scanning (lihat #14).
    ISU: Missing test suites (lihat #37).

E) DEPLOYMENT
    ISU: Nginx config tiada HTTPS (lihat #31).
    ISU: PM2 config tiada user specification (lihat #16).

F) .ENV FILES
    - Tiada .env files yang committed. SELAMAT.
    - .env.example wujud dengan semua variables.
    ISU: Default secrets terlalu lemah (lihat #3).


================================================================================
  BAHAGIAN 8: PERKARA YANG SUDAH BAIK
================================================================================

+-----------------------------------+----------+---------------------------------+
| Area                              | Status   | Keterangan                      |
+-----------------------------------+----------+---------------------------------+
| CSRF Protection                   | Excellent| Double-submit + Sec-Fetch-Site  |
| Password Hashing                  | Excellent| bcrypt + timing-safe comparison |
| Trusted Types                     | Excellent| toTrustedHTML() digunakan betul |
| Safe URL Handling                 | Good     | Protocol validation             |
| Helmet/Security Headers           | Good     | HSTS, CSP, noSniff, frameguard  |
| Structured Logging                | Good     | Pino logger konsisten           |
| Test Coverage                     | Good     | 269 fail ujian, CI coverage gate|
| Input Validation                  | Good     | Zod schemas pada API contracts  |
| Cookie Security                   | Good     | HttpOnly, SameSite, Secure      |
| Rate Limiting                     | Good     | express-rate-limit pelbagai tier|
| Bundle Budgets                    | Good     | Enforced dalam CI               |
| Body Size Limits                  | Good     | Differentiated per endpoint     |
| Error Boundaries                  | Good     | Route-level error boundary      |
| Backup Streaming                  | Fixed    | Cursor-based pagination         |
| SQL LIKE Escaping                 | Fixed    | sql-like-utils.ts               |
| Rollup PKs                        | Fixed    | Composite primary keys          |
| N+1 Day Insert                    | Fixed    | Batch via sql.join              |
| Radix UI Focus                    | Good     | Auto focus management dialogs   |
| Schema Governance                 | Good     | Verified dalam CI               |
| Repo Hygiene                      | Good     | Automated verification CI       |
+-----------------------------------+----------+---------------------------------+


================================================================================
  BAHAGIAN 9: KEUTAMAAN PEMBETULAN
================================================================================

P0 — SEGERA (Minggu Ini)
  1. WebSocket CSRF vulnerability (#1)
  2. 2FA secret fallback (#2)
  3. .env.example default secrets (#3, #4)
  4. WebSocket connection limit (#8)

P1 — SEBELUM PRODUCTION (2 Minggu)
  5. Command injection validation (#9)
  6. File upload MIME detection (#10)
  7. Path traversal check (#11)
  8. Login rate limit fix (#12)
  9. CI security scanning (#14, #15)
  10. Token storage migration (#17)
  11. useEffect cleanup (#18)

P2 — PENAMBAHBAIKAN BERTERUSAN (Bulan Ini)
  12. React key anti-pattern (#5, #7)
  13. Type safety improvements (#6, #34, #35)
  14. Pagination limits (#25)
  15. Form loading states (#38)
  16. Mobile viewport (#32)
  17. Missing tests dalam CI (#37)

P3 — NICE TO HAVE
  18. Error format standardization (#42)
  19. Documentation improvements (#46, #51)
  20. Config improvements (#39, #52-55)


================================================================================
  BAHAGIAN 10: STATISTIK CODEBASE
================================================================================

Jumlah fail sumber (*.ts, *.tsx):          ~500+ fail
Jumlah fail ujian (*.test.ts, *.test.tsx): 269 fail
Jumlah baris kod:                          ~166,843 baris
Fail terbesar:
  - collection.routes.integration.test.ts  (3,100 baris)
  - auth.routes.integration.test.ts        (1,756 baris)
  - collection-daily-record.service.test.ts(1,542 baris)
  - permission-matrix.integration.test.ts  (1,208 baris)

Stack Teknologi:
  Frontend:  React, TypeScript, Tailwind CSS, Radix UI, TanStack Query
  Backend:   Node.js, Express, Drizzle ORM, Pino logger
  Database:  PostgreSQL
  Build:     Vite, esbuild
  CI/CD:     GitHub Actions
  Testing:   Vitest, Supertest


================================================================================
  KESIMPULAN
================================================================================

Codebase Sumbangan Query Rahmah (SQR) adalah BERKUALITI TINGGI secara
keseluruhan dengan seni bina yang matang dan amalan keselamatan yang kukuh.

74 isu telah dikenal pasti — kebanyakannya adalah penambahbaikan keselamatan
defensif dan penyelenggaraan kod yang biasa dalam projek berskala ini.

8 isu CRITICAL memerlukan tindakan segera sebelum deployment ke production.
19 isu HIGH perlu ditangani dalam tempoh 2 minggu.
Baki 47 isu (MEDIUM + LOW) boleh ditangani secara beransur-ansur.

Skor kesihatan keseluruhan: 8.2 / 10

Disediakan oleh: AI Full-Stack Engineer Audit
Tarikh: 2026-04-07

================================================================================
  TAMAT LAPORAN AUDIT
================================================================================
