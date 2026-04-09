================================================================================
  LAPORAN AUDIT PENUH SISTEM — SUMBANGAN QUERY RAHMAH (SQR)
  Tarikh Audit Asal: 2026-04-07
  Tarikh Kemaskini Kedua: 2026-04-08 (Audit Menyeluruh Kedua)
  Tarikh Kemaskini Ketiga: 2026-04-09 (Audit Menyeluruh Ketiga)
  Kaedah: Pemeriksaan kod statik keseluruhan
          (backend, frontend, UI/UX, layout, CSS, database, WebSocket, memori)
  Mod: Dokumentasi sahaja — tiada perubahan kod dilakukan
================================================================================


RINGKASAN EKSEKUTIF
====================

Codebase ini menunjukkan tahap kematangan yang TINGGI — dengan 269 fail ujian,
pipeline CI/CD yang komprehensif, CSRF protection, Trusted Types, structured
logging, dan seni bina berlapis.

Audit kedua (2026-04-08) menambah penemuan baharu merangkumi:
  - Kebocoran memori dalam rate limiting dan WebSocket
  - Isu CSS shadow opacity 0% (UI depth hilang sepenuhnya)
  - 13 kolum timestamp tanpa .notNull()
  - Timestamp tanpa timezone
  - Touch targets terlalu kecil pada mobile
  - 54+ hardcoded color values
  - Race condition dalam WebSocket reconnection

Audit ketiga (2026-04-09) mengesahkan beberapa pembetulan dan menambah
penemuan baharu merangkumi:
  - 4 isu TELAH DIPERBAIKI (#3, #4, #34, #40)
  - Unmounted state update risk dalam useCollectionRecordsData
  - Event listener accumulation dalam useFloatingAILayoutState
  - Missing :focus-visible pada interactive home cards
  - Backdrop filter performance tanpa will-change
  - Content-visibility CLS risk pada Landing page
  - Contrast ratio rendah untuk public auth text
  - Query stale time terlalu agresif
  - Promise chain tanpa .catch() handler
  - Missing AbortController cleanup
  - AI search timeout buffer terlalu ketat
  - Receipt preview zoom CSS duplication (26 class)
  - Missing prefers-reduced-motion untuk welcome-pop
  - Safe area inset inconsistency

Jumlah isu keseluruhan: 110 (55 asal + 34 audit kedua + 13 audit ketiga
                              + 8 dipindah ke DIPERBAIKI)
Nota: angka ini ialah snapshot audit asal setakat 2026-04-09. Beberapa item
      telah ditutup selepas audit tersebut; rujuk penanda STATUS terkini pada
      item berkaitan untuk keadaan repo semasa.

ISU YANG DIPERBAIKI SEJAK AUDIT LEPAS:
  #3  .env.example default secrets → DIPERBAIKI
      (kini guna GENERATE_ME placeholder yang jelas)
  #4  Missing backup encryption key guidance → DIPERBAIKI
      (kini ada arahan generate dan amaran)
  #34 TypeScript missing strictness options → DIPERBAIKI
      (exactOptionalPropertyTypes, noUnusedLocals, noImplicitReturns AKTIF)
  #40 Missing @types packages → DIPERBAIKI
      (@types/react-window dan @types/recharts sudah ditambah)


RINGKASAN ISU GABUNGAN (Audit 1 + Audit 2 + Audit 3)
======================================================

+-------------------------------+----------+------+--------+-----+--------+
| Kategori                      | CRITICAL | HIGH | MEDIUM | LOW | Jumlah |
+-------------------------------+----------+------+--------+-----+--------+
| Security                      |     4    |   7  |    7   |  2  |   20   |
| Database/Schema               |     2    |   2  |    5   |  1  |   10   |
| WebSocket & Memory            |     2    |   3  |    5   |  0  |   10   |
| CSS/Layout/UI/UX              |     1    |   4  |   11   |  6  |   22   |
| React/Frontend                |     2    |   3  |    9   |  4  |   18   |
| Type Safety                   |     2    |   1  |    2   |  1  |    6   |
| Error Handling                |     0    |   2  |    4   |  2  |    8   |
| Architecture                  |     0    |   0  |    1   |  2  |    3   |
| CI/CD                         |     0    |   2  |    3   |  2  |    7   |
| Config/Deployment             |     1    |   2  |    1   |  2  |    6   |
+-------------------------------+----------+------+--------+-----+--------+
| JUMLAH AKTIF                  |    14    |  26  |   48   | 22  |  110   |
| Diperbaiki (tidak dikira)     |     0    |   0  |    2   |  2  |    4   |
+-------------------------------+----------+------+--------+-----+--------+


================================================================================
  BAHAGIAN 1: ISU CRITICAL — MESTI DIPERBAIKI SEGERA
================================================================================

--- Audit Asal (#1 - #8) ---

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
    >>> STATUS: ✅ DIPERBAIKI (Audit 3, 2026-04-09)
        Kini menggunakan placeholder GENERATE_ME_AT_LEAST_32_CHARS_DO_NOT_USE_IN_PRODUCTION
        dan GENERATE_ME_DB_PASSWORD_DO_NOT_USE_IN_PRODUCTION dengan arahan generate.

#4  Missing Backup Encryption Key Guidance
    Fail: .env.example (baris 125)
    Isu:  BACKUP_ENCRYPTION_KEY= kosong tanpa panduan penjanaan.
          Backup tanpa encryption key boleh didekripsi oleh sesiapa.
    Cadangan: Tambah arahan generate dan amaran keselamatan.
    >>> STATUS: ✅ DIPERBAIKI (Audit 3, 2026-04-09)
        Kini ada BACKUP_ENCRYPTION_KEY=GENERATE_ME_BACKUP_KEY_AND_STORE_OFFLINE
        dengan arahan generate dan amaran keselamatan.

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

--- Penemuan Baharu Audit 2 (#56 - #61) ---

#56 [BAHARU] Kebocoran Memori: adaptiveRateState Map Tidak Dibersihkan
    Fail: server/internal/apiProtection.ts (baris 33, 88, 141-146)
    Isu:  Map adaptiveRateState menyimpan satu entry bagi setiap
          kombinasi IP+scope. Fungsi sweepAdaptiveRateState() telah
          ditulis tetapi TIDAK dipanggil secara automatik oleh mana-mana
          setInterval. Setiap entry hanya dibuang 60 saat selepas tamat
          tempoh. Dalam serangan bot yang menggunakan banyak IP, Map ini
          boleh membesar tanpa had.
          Contoh: 10,000 IP unik = 70,000 entry dalam memori serentak.
    Cadangan: Daftarkan setInterval(sweepAdaptiveRateState, 30_000)
              dan kurangkan grace period daripada 60s ke 10s.
              Tambah had saiz maksimum dengan LRU eviction.

#57 [BAHARU] WebSocket Race Condition Semasa Reconnect
    Fail: server/ws/runtime-manager.ts (baris 281-291)
    Isu:  Apabila pengguna reconnect, sambungan lama ditutup ws.close()
          SEBELUM sambungan baru didaftarkan dalam connectedClients.set().
          Jika close handler berjalan secara sinkron, ia menetapkan
          cleanedUp = true, menyebabkan sambungan baru TIDAK PERNAH
          didaftarkan tetapi masih aktif — sambungan yatim dalam memori.
    Cadangan: Daftarkan sambungan baru dalam Map SEBELUM menutup
              sambungan lama.

#58 [BAHARU] Shadow CSS Tidak Kelihatan (Opacity 0%)
    Fail: client/src/theme-tokens.css (baris 50-57 & 134-141)
    Isu:  SEMUA shadow token ditetapkan dengan opacity / 0 — bermakna
          tiada bayangan kelihatan di mana-mana dalam UI. Kad, butang,
          dan kesan kedalaman semuanya hilang.
          Contoh: --shadow-sm: 0px 2px 0px 0px hsl(217 91% 60% / 0);
    Cadangan: Tetapkan nilai opacity yang betul (cth. 0.08, 0.12, 0.15).

#59 [BAHARU] 13 Kolum Timestamp Tanpa .notNull()
    Fail: shared/schema-postgres-core.ts, schema-postgres-ai.ts,
          schema-postgres-settings.ts
    Isu:  Sebanyak 13 kolum timestamp menggunakan .defaultNow() TANPA
          .notNull(). Ini membenarkan nilai NULL walaupun mempunyai
          default, melanggar integriti data.
          Kolum terjejas:
            - imports.createdAt
            - auditLogs.timestamp
            - bannedSessions.bannedAt
            - backups.createdAt
            - dataEmbeddings.createdAt
            - aiConversations.createdAt
            - aiMessages.createdAt
            - aiCategoryStats.updatedAt
            - aiCategoryRules.updatedAt
            - settingCategories.createdAt
            - systemSettings.updatedAt
            - settingVersions.changedAt
            - featureFlags.updatedAt
    Cadangan: Tambah .notNull() pada semua kolum timestamp yang ada
              .defaultNow().

#60 [BAHARU] Semua Timestamp Tanpa Timezone
    Fail: Semua fail schema-postgres-*.ts
    Isu:  Semua kolum timestamp menggunakan timestamp("...") tanpa
          .withTimezone(true). Dalam persekitaran multi-timezone atau
          deployment cloud, data boleh ditafsirkan secara berbeza.
    Cadangan: Tambah .withTimezone(true) pada semua timestamp
              untuk memastikan konsistensi UTC.

#61 [BAHARU] IP Spoofing dalam Rate Limiting
    Fail: server/middleware/rate-limit.ts (baris 46)
    Isu:  Rate limiter bergantung sepenuhnya pada req.ip tanpa
          pengesahan tambahan. Jika trust proxy tidak dikonfigurasi
          dengan betul, penyerang boleh mengelak rate limiting dengan
          menghantar header X-Forwarded-For palsu.
    Cadangan: Tambah pengesahan trust proxy yang ketat dan pertimbangkan
              fingerprinting tambahan (User-Agent, Accept-Language).


================================================================================
  BAHAGIAN 2: ISU HIGH — PERLU DIPERBAIKI SEBELUM PRODUCTION
================================================================================

--- Audit Asal (#9 - #20) ---

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

--- Penemuan Baharu Audit 2 (#62 - #68) ---

#62 [BAHARU] Heartbeat WebSocket: Race Condition
    Fail: server/ws/runtime-manager.ts (baris 135-154)
    Isu:  Heartbeat check menggunakan WeakSet aliveSockets. Jika socket
          bertukar ke status CONNECTING antara semakan dan terminate(),
          socket yang masih sah boleh ditamatkan. Tiada semakan
          ws.readyState sebelum terminate().
    Cadangan: Tambah if (ws.readyState === WebSocket.OPEN) sebelum
              terminate().

#63 [BAHARU] Backup Export: Memori untuk Payload Besar
    Fail: server/repositories/backups-payload-utils.ts (baris 117-289)
    Isu:  Walaupun streaming pagination telah dilaksanakan (baik),
          setiap halaman masih di-JSON.stringify dalam memori. Password
          hashes dan data sensitif ditulis ke fail temp dalam plaintext.
    Cadangan: Set memory limits, monitor backup export memory usage,
              encrypt sensitive fields sebelum tulis ke disk.

#64 [BAHARU] Sasaran Sentuh (Touch Targets) Terlalu Kecil
    Fail: client/src/components/ui/button.tsx
    Isu:  Saiz butang di bawah standard 44x44px minimum:
            - Button default: min-h-9 = 36px (kurang 8px)
            - Button sm: min-h-8 = 32px (kurang 12px)
            - Icon button: h-9 w-9 = 36px (kurang 8px)
          Menyukarkan pengguna pada peranti mudah alih.
    Cadangan: Pada mobile, tetapkan minimum 44x44px:
              @media (max-width: 767px) {
                button { min-height: 44px; min-width: 44px; }
              }

#65 [BAHARU] 54+ Warna Hardcoded dalam CSS
    Fail: FloatingAI.module.css, PublicAuthLayout.css,
          PublicAuthControls.css, styles/ai.css
    Isu:  54+ nilai warna RGBA/HSL hardcoded dijumpai berbanding
          menggunakan CSS variable dari sistem tema. Menyukarkan
          penyelenggaraan dan penukaran tema/dark mode.
          Contoh: rgba(2, 6, 23, 0.72), rgba(59, 130, 246, 0.7)
    Cadangan: Gantikan dengan CSS variables dari theme-tokens.css.

#66 [BAHARU] LIKE Pattern: Perlu Ujian Komprehensif
    Fail: server/repositories/search.repository.ts (baris 86-126)
    Isu:  Walaupun escapeLikePattern() telah dilaksanakan, tiada ujian
          unit yang komprehensif untuk mengesahkan terhadap semua variasi
          input LIKE injection (%, _, \, dsb).
    Cadangan: Tambah ujian unit untuk pelbagai kes LIKE injection.

#67 [BAHARU] Tiada Cleanup Path Lengkap untuk WebSocket Maps
    Fail: server/ws/runtime-manager.ts (baris 224-302)
    Isu:  Beberapa path error memanggil cleanupSocket() tanpa
          membersihkan kedua-dua connectedClients DAN socketUserKeys
          Maps secara eksplisit. Entry boleh terkumpul.
    Cadangan: Pastikan semua path cleanup membersihkan kedua-dua Maps.

#68 [BAHARU] Logger Tidak Redact Semua PII
    Fail: server/lib/logger.ts (baris 8-25)
    Isu:  Logger redacts password, token, email, tetapi TIDAK redact:
            - phone / customerphone (data peribadi sensitif)
            - customername (PII dalam collection records)
            - staffname (PII)
            - amount (sensitif dalam konteks tertentu)
    Cadangan: Tambah pattern PII yang lebih komprehensif ke REDACT_KEYS.


================================================================================
  BAHAGIAN 3: ISU MEDIUM — PERLU DIPERBAIKI
================================================================================

--- Audit Asal (#21 - #40) ---

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
    Isu:  Cache tiada had saiz dan tiada TTL enforcement. Dengan banyak
          pengguna, cache membesar tanpa kawalan (memory leak).
    Cadangan: Implement LRU cache dengan MAX_CACHE_SIZE = 100
              dan TTL 5 minit.

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
    >>> STATUS: ✅ DIPERBAIKI (Audit 3, 2026-04-09)
        exactOptionalPropertyTypes, noUnusedLocals, noImplicitReturns
        semuanya AKTIF dalam tsconfig.json.

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
    >>> STATUS: ✅ DIPERBAIKI (Audit 3, 2026-04-09)
        @types/react-window dan @types/recharts sudah ada dalam
        devDependencies.

--- Penemuan Baharu Audit 2 (#69 - #80) ---

#69 [BAHARU] CSRF Fallback Tanpa Token Requirement
    Fail: server/http/csrf.ts (baris 38-84)
    Isu:  Jika double-submit token check gagal DAN sec-fetch-site bukan
          cross-site, code fallback ke origin/referer check. Jika kedua-
          duanya tiada, request ditolak — tetapi logic chain boleh
          membenarkan bypass jika headers hilang (browser lama, proxy).
    Cadangan: Log semua CSRF check failures untuk monitoring,
              implementasi origin matching yang lebih ketat.

#70 [BAHARU] PII Disimpan Tanpa Enkripsi
    Fail: shared/schema-postgres-collection.ts (baris 18-70)
    Isu:  Collection records menyimpan unencrypted:
            - Nama pelanggan (customerName)
            - Nombor IC (icNumber)
            - Nombor telefon (customerPhone)
            - Nombor akaun (accountNumber)
    Cadangan: Encrypt PII sensitif di peringkat aplikasi atau database.
              Tambah audit logging untuk akses PII.
    >>> STATUS: MATERIALLY CLOSED (Audit 3 pasca pembetulan, 2026-04-09)
        - Shadow encrypted fields, blind-index search, startup guards,
          backup/export safeguards, redaction tooling, dan env-scoped
          retirement helpers sudah dilaksanakan.
        - Local rollout kini bersih untuk customerName, icNumber,
          customerPhone, dan accountNumber.
        - Baki kerja hanyalah rollout lintas-environment dan pelupusan
          compatibility plaintext/schema pada masa depan.

#71 [BAHARU] Missing onUpdate cascade pada Settings FK
    Fail: shared/schema-postgres-settings.ts (baris 22, 38)
    Isu:  systemSettings.categoryId dan settingOptions.settingId
          ada onDelete: "cascade" sahaja, TIADA onUpdate: "cascade".
          Jika parent record dikemaskini, child records tidak dikemaskini.
    Cadangan: Tambah onUpdate: "cascade".

#72 [BAHARU] Missing Indexes pada Kolum Status
    Fail: shared/schema-postgres-collection.ts (baris 38-70)
    Isu:  Kolum yang kerap ditapis tiada index:
            - receiptValidationStatus (dalam collectionRecords)
            - extractionStatus (dalam collectionRecordReceipts)
            - receiptDate (dalam collectionRecordReceipts)
    Cadangan: Cipta index pada kolum status dan tarikh.

#73 [BAHARU] Campuran Data Type untuk Amount
    Fail: shared/schema-postgres-collection.ts (baris 26-83)
    Isu:  Campuran numeric(14,2) (Ringgit) dan bigint (mungkin sen):
            - collectionRecords.amount = numeric(14, 2)
            - collectionRecords.receiptTotalAmount = bigint
            - collectionRecordReceipts.receiptAmount = bigint
          Risiko ralat pengiraan jika unit tidak konsisten.
    Cadangan: Standardkan - guna numeric(14,2) secara konsisten atau
              dokumentasikan unit bigint dengan jelas.
    >>> STATUS: MATERIALLY CLOSED (Audit 3 pasca pembetulan, 2026-04-09)
        - Boundary amount kini diseragamkan pada shared helpers,
          repository, service, client, backup, validation, dan SQL
          conversion paths.
        - Unit MYR vs cents kini didokumen dan dipaksa dengan lebih
          ketat dalam code paths semasa.
        - Baki pilihan masa depan hanyalah migration schema literal jika
          benar-benar mahu satu datatype DB sahaja.

#74 [BAHARU] imports.isDeleted Tiada .notNull()
    Fail: shared/schema-postgres-core.ts (baris 110)
    Isu:  .default(false) tanpa .notNull() — boleh jadi NULL secara
          tidak sengaja.
    Cadangan: Tambah .notNull().

#75 [BAHARU] JSON.stringify/parse Tanpa Had Saiz
    Fail: server/ws/runtime-manager.ts (baris 114-132),
          server/services/ai-search-query-row-utils.ts (baris 95-104)
    Isu:  WebSocket broadcast: JSON.stringify(payload) tanpa had saiz
          boleh block event loop untuk payload besar.
          AI search: JSON.parse(row.jsonDataJsonb) tanpa had saiz
          per-row boleh block event loop jika row mengandungi JSON 10MB+.
    Cadangan: Tambah pengesahan saiz payload sebelum stringify/parse.
              Pertimbangkan Worker thread untuk payload besar.

#76 [BAHARU] Z-Index Hardcoded Tanpa Pengurusan Berpusat
    Fail: FloatingAI.module.css (z-index: 40),
          PublicAuthLayout.css (z-index: 10),
          Login.css (z-index: -2, -1)
    Isu:  Nilai z-index tersebar tanpa dokumentasi stacking order.
          Boleh menyebabkan konflik antara komponen.
    Cadangan: Cipta CSS variable berpusat:
              --z-floating-widget: 40;
              --z-modal: 50;
              --z-tooltip: 60;

#77 [BAHARU] Animasi Box-Shadow Menyebabkan Repaint
    Fail: client/src/components/FloatingAI.module.css (baris 69-73)
    Isu:  @keyframes pulseRing menggunakan animasi box-shadow yang
          menyebabkan browser repaint. Tidak seoptimum transform.
    Cadangan: Gantikan box-shadow animation dengan transform: scale()
              dan opacity.

#78 [BAHARU] FloatingAI Panel Melebihi Skrin iPhone
    Fail: client/src/components/FloatingAI.module.css (baris 20)
    Isu:  Panel width: 380px melebihi skrin iPhone 375px.
          Pada skrin kecil, panel boleh terkeluar dari viewport.
    Cadangan: Tambah responsive rule:
              @media (max-width: 375px) {
                width: calc(100vw - 2rem);
              }

#79 [BAHARU] Nav Pill Font Size Terlalu Kecil
    Fail: client/src/components/Navbar.css (baris 37)
    Isu:  .nav-pill guna font-size: 0.85rem (13.6px) — di bawah
          minimum 14px yang disyorkan untuk teks body pada mobile.
    Cadangan: Naikkan kepada minimum 0.875rem (14px).

#80 [BAHARU] Accent Color Contrast Ratio Rendah
    Fail: client/src/theme-tokens.css (baris 33)
    Isu:  Accent color 214 25% 92% pada background 210 20% 98%
          memberikan contrast ratio ~1.1:1 — SANGAT RENDAH.
          Tidak memenuhi standard WCAG AA (minimum 4.5:1 untuk teks).
    Cadangan: Turunkan lightness accent color untuk kontras yang lebih
              baik, atau gunakan untuk elemen non-kritikal sahaja.


================================================================================
  BAHAGIAN 4: ISU LOW — CADANGAN PENAMBAHBAIKAN
================================================================================

--- Audit Asal (#41 - #55) ---

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

--- Penemuan Baharu Audit 2 (#81 - #89) ---

#81 [BAHARU] Error Boundary Tiada Focus Management
    Fail: client/src/app/AppRouteErrorBoundary.tsx
    Isu:  Selepas error dipaparkan, tiada focus management ke
          container mesej error. Pengguna screen reader mungkin
          tidak sedar ada error berlaku.
    Cadangan: Tambah useEffect untuk focus container error.

#82 [BAHARU] localStorage Tiada Quota Management
    Fail: client/src/components/useTheme.ts,
          client/src/app/useSingleTabSession.ts
    Isu:  localStorage digunakan tanpa pengurusan kuota storan.
          Tiada cleanup untuk data sesi lama.
    Cadangan: Tambah semakan kuota dan pembersihan automatik.

#83 [BAHARU] Print Stylesheet Hardcoded Colors
    Fail: client/src/index.css (baris 18-19)
    Isu:  Print styles guna #fff dan #000 hardcoded berbanding
          CSS variables.
    Cadangan: Guna hsl(var(--background)) dan hsl(var(--foreground)).

#84 [BAHARU] Hardcoded Focus Colors dalam Auth CSS
    Fail: client/src/pages/auth/PublicAuthLayout.css (baris 92),
          PublicAuthControls.css
    Isu:  Focus rings guna rgb(255 255 255 / 0.25) hardcoded
          berbanding --ring CSS variable.
    Cadangan: Guna hsl(var(--ring) / 0.3).

#85 [BAHARU] Line Height Tidak Konsisten
    Fail: Pelbagai fail CSS
    Isu:  7 nilai line-height berbeza dijumpai: 1.2, 1.35, 1.45, 1.5,
          1.6, 1.75, 2.0. Terlalu banyak variasi.
    Cadangan: Standardkan kepada 3-4 nilai sahaja:
              --line-height-tight: 1.2 (headers)
              --line-height-normal: 1.5 (body)
              --line-height-loose: 1.75 (descriptions)

#86 [BAHARU] Overflow Hidden pada Body Menyekat Shadow/Tooltip
    Fail: client/src/theme-tokens.css (baris 182)
    Isu:  overflow-x: hidden pada body boleh memotong shadow effects,
          tooltips, dan popovers yang melangkaui container bounds.
    Cadangan: Guna overflow-x: clip (CSS Level 4) atau pastikan
              elemen overflow menggunakan portal.

#87 [BAHARU] Silent WebSocket clearNicknameSession
    Fail: server/ws/runtime-manager.ts (baris 92)
    Isu:  clearNicknameSession() catch block menelan semua error:
          .catch(() => undefined) — tanpa logging.
    Cadangan: Tukar kepada .catch(err => logger.debug(...)).

#88 [BAHARU] Backup Restore: Temp Table Tanpa Chunking
    Fail: server/repositories/backups-restore-collection-datasets-utils.ts
          (baris 146-154)
    Isu:  Bulk INSERT ke temp table menggunakan sql.join() tanpa
          chunking. Jika rows sangat besar (1M+ records), SQL string
          boleh menjadi 100+ MB dalam memori.
    Cadangan: Pecahkan INSERT kepada batch 10,000 records.

#89 [BAHARU] Idempotency Fingerprint JSON Parse Per-Request
    Fail: server/routes/collection/collection-route-handler-factories.ts
          (baris 76-88)
    Isu:  JSON.parse() dipanggil untuk setiap request (max 512 bytes).
          Pada 1000 req/s, ini 1000 JSON parses per saat.
    Cadangan: Pertimbangkan LRU cache untuk hasil parsing, atau
              guna regex validation yang lebih ringan.

--- Penemuan Baharu Audit 3 (#90 - #102) ---

#90 [BAHARU] AI Search Timeout Buffer Terlalu Ketat
    Fail: server/services/ai-search.service.ts (baris 108)
    Isu:  Pengiraan timeout AI search hanya menyisakan 1200ms buffer
          untuk pemprosesan selepas configured timeout. Jika Ollama
          response lambat, request mungkin timeout sebelum respons
          diproses sepenuhnya.
    Cadangan: Semak logic timeout dan tambah buffer jika timeout
              sering dicapai dalam production.

#91 [BAHARU] Missing AbortController dalam useCollectionRecordsData
    Fail: client/src/pages/collection-records/useCollectionRecordsData.ts
          (baris 69-80)
    Isu:  loadNicknames() promise tidak dibatalkan apabila komponen
          unmount. Jika network request lambat, ia masih resolve dan
          cuba kemaskini state yang sudah unmounted.
    Cadangan: Tambah AbortController sokongan pada loadNicknames()
              atau wrap .then() dengan mounted check.

#92 [BAHARU] Promise Chain Tanpa .catch() dalam useCollectionRecordsData
    Fail: client/src/pages/collection-records/useCollectionRecordsData.ts
          (baris 69)
    Isu:  loadNicknames().then(...) tiada .catch() handler. Jika
          promise ditolak, ia menjadi unhandled rejection.
    Cadangan: Tambah error handling:
              void loadNicknames()
                .then((options) => { /* ... */ })
                .catch((error) => console.error("Gagal load nicknames:", error));

#93 [BAHARU] Unmounted State Update dalam useCollectionRecordsData
    Fail: client/src/pages/collection-records/useCollectionRecordsData.ts
          (baris 69-80)
    Isu:  .then() chain dalam useEffect untuk loading nicknames tidak
          semak sama ada komponen masih mounted sebelum panggil
          handleNicknameFilterChange(). Jika komponen unmount semasa
          operasi async, ia akan cuba kemaskini state yang unmounted.
    Cadangan: Tambah isMounted check:
              useEffect(() => {
                let isMounted = true;
                void loadNicknames().then((options) => {
                  if (!isMounted) return;
                  // ... logik seterusnya
                });
                return () => { isMounted = false; };
              }, []);

#94 [BAHARU] Event Listener Accumulation dalam useFloatingAILayoutState
    Fail: client/src/components/useFloatingAILayoutState.ts
    Isu:  Pelbagai listener (focusin, focusout, resize, scroll)
          didaftarkan tanpa pengesahan cleanup sebelumnya. Jika
          effect re-run tanpa complete cleanup, listener boleh
          terkumpul dan menyebabkan memory leak.
    Cadangan: Simpan listener references dalam refs dan pastikan
              cleanup berlaku tanpa mengira keadaan.

#95 [BAHARU] Missing :focus-visible pada Home Cards
    Fail: client/src/pages/Home.css (baris 147-177)
    Isu:  .home-card dan .home-mobile-quick-card ada :hover states
          tetapi TIADA :focus-visible atau :focus states. Pengguna
          yang navigasi via keyboard tidak nampak focus indicator.
    Cadangan: Tambah explicit focus styles:
              .home-card:focus-visible {
                outline: 2px solid var(--primary);
                outline-offset: 2px;
              }

#96 [BAHARU] Backdrop Filter Performance Tanpa will-change
    Fail: client/src/pages/Login.css (baris 48-85, 69-70),
          client/src/components/Navbar.css (baris 15-16)
    Isu:  Blur filters berat (18px-64px) dengan saturate(160%) pada
          Login page. Animasi kompleks (content-fade, glass-float)
          dengan transforms dan opacity tanpa will-change hints.
          Boleh menyebabkan GPU spikes dan jank pada frame pertama.
    Cadangan: Tambah will-change: transform, opacity pada elemen
              animasi. Tambah will-change: filter pada elemen dengan
              backdrop-filter. Buang will-change selepas animasi selesai.

#97 [BAHARU] Content-Visibility CLS Risk pada Landing Page
    Fail: client/src/pages/Landing.css (baris 184-207)
    Isu:  .landing-deferred-section guna content-visibility: auto
          dengan contain-intrinsic-size tetapi nilai adalah anggaran
          kasar (auto 720px, 980px, 680px). Jika kandungan sebenar
          jauh lebih besar, akan menyebabkan Cumulative Layout Shift.
    Cadangan: Kira saiz intrinsik sebenar atau guna JavaScript
              ResizeObserver untuk capture actual heights.

#98 [BAHARU] Contrast Ratio Rendah untuk Public Auth Text
    Fail: client/src/theme-tokens.css (baris 68-70)
    Isu:  --public-auth-text-soft: hsl(0 0% 100% / 0.75) (75% opacity
          putih) pada latar belakang gradient gelap mungkin gagal
          memenuhi WCAG AA contrast requirements. Bermasalah pada
          monitor dengan kalibrasi lebih cerah.
    Cadangan: Uji contrast ratios dengan warna latar sebenar.
              Pertimbangkan hsl(0 0% 100% / 0.85) atau opacity
              lebih tinggi untuk teks body.

#99 [BAHARU] Query Stale Time Terlalu Agresif
    Fail: client/src/lib/queryClient.ts (baris 18-19)
    Isu:  Stale time hanya 10-30 saat. High-frequency queries mungkin
          menyebabkan refetch berlebihan dan beban rangkaian tambahan.
    Cadangan: Laraskan berdasarkan keperluan data freshness:
              - Senarai pengguna/roles: 60-120 saat (jarang berubah)
              - Analytics: 30 saat (kadar perubahan sederhana)
              - Aktiviti langsung: 5-10 saat (kerap berubah)

#100 [BAHARU] Receipt Preview Zoom CSS Duplication
     Fail: client/src/pages/collection-records/receipt-preview-dialog.css
           (baris 1-26)
     Isu:  26 kelas zoom identical (.receipt-preview-zoom-5 hingga
           .receipt-preview-zoom-30) dengan hanya nilai scale berubah.
           Setiap kelas mengulangi transform dan transform-origin.
     Cadangan: Guna satu kelas dengan CSS custom properties:
               .receipt-preview-zoom {
                 transform: scale(var(--zoom-level));
                 transform-origin: top center;
               }
               dan set --zoom-level secara inline.

#101 [BAHARU] Missing prefers-reduced-motion untuk Welcome Animation
     Fail: client/src/pages/Home.css (baris 1-24)
     Isu:  .welcome-pop animation tiada @media (prefers-reduced-motion)
           rule. Pengguna dengan gangguan vestibular akan mengalami
           animasi pop yang berpotensi mengganggu.
     Cadangan: Tambah:
               @media (prefers-reduced-motion: reduce) {
                 .welcome-pop { animation: none !important; }
               }

#102 [BAHARU] Safe Area Inset Inconsistency
     Fail: client/src/components/FloatingAI.module.css (baris 5-6, 47-48),
           client/src/pages/viewer/ViewerFooter.module.css (baris 2)
     Isu:  Safe area insets diaplikasikan secara tidak konsisten.
           Floating AI apply pada bottom dan top, tetapi tidak semua
           elemen interaktif mengikut pola ini. Peranti notch mungkin
           ada kandungan yang bertindih.
     Cadangan: Cipta strategi safe area inset yang konsisten:
               --safe-inset-top: env(safe-area-inset-top, 0px);
               --safe-inset-bottom: env(safe-area-inset-bottom, 0px);
               dan apply secara universal.


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
     STATUS: BAIK
     ISU BAHARU: Fallback logic boleh dibypass (#69)

A.3) Authentication & Authorization
     - bcrypt dengan configurable cost.
     - Timing-safe comparison dengan dummy hash.
     - Prevents user enumeration.
     - Strong temporary password generation.
     STATUS: BAIK

A.4) Session Management
     - HttpOnly, SameSite, Secure flags pada cookie.
     - Session invalidation pada logout.
     - JWT algorithm fixed to HS256 (prevents alg=none).
     - Session secret rotation supported (current + previous).
     - CSRF token 32 bytes via randomBytes.
     STATUS: BAIK

A.5) Rate Limiting
     - express-rate-limit dengan pelbagai tiers:
       * Login IP: 50 attempts / 10 minit
       * Login user: 15 attempts / 10 minit
       * Search: 10 / 10 saat
       * Admin actions: 30 / 10 minit
       * Admin destructive: 10 / 10 minit
     - Adaptive rate limiting dengan system protection
       (NORMAL/DEGRADED/PROTECTION mode).
     ISU: IP spoofing (#12, #61)
     ISU: adaptiveRateState Map leak (#56)

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
     ISU: Temp table insert tanpa chunking (#88)

A.9) Input Validation
     - Zod schema validation dengan error details.
     - String length limits (max 2048 chars default).
     - Integer clamping, date parsing, list parsing.
     STATUS: BAIK

A.10) Logging
     - Pino structured logging — tiada console.log dalam production.
     - Sensitive field redaction untuk password, token, email.
     ISU: Perlu tambah PII redaction (#68)


B) ERROR HANDLING
------------------

B.1) Global Error Handler
     - server/middleware/error-handler.ts menangkap semua unhandled errors.
     - Structured logging via pino.
     - Differentiated exposed vs internal errors.
     - Consistent error response format: { ok: false, message, error }
     STATUS: BAIK

B.2) Async Handler
     - server/http/async-handler.ts properly catches promise rejections.
     STATUS: BAIK

B.3) Receipt Service
     - 5 catch blocks, SEMUA dengan proper logging.
     - Silent catch block issue telah DISELESAIKAN.
     STATUS: BAIK

B.4) Silent Catches yang Masih Ada
     - WebSocket broadcast (runtime-manager.ts:40-46) (#43)
     - WebSocket session auth (session-auth.ts:20-22) (#27)
     - clearNicknameSession .catch(() => undefined) (#87)
     - safeSelectRows hides "relation not exist" errors
     CADANGAN: Tambah logging pada semua.


C) DATABASE
-----------

C.1) Schema
     - Drizzle ORM dengan PostgreSQL.
     - Rollup tables sudah ada composite PKs (DIPERBAIKI).
     - N+1 day insert sudah dibatch via sql.join (DIPERBAIKI).
     ISU: Missing cascade deletes (#24, #71)
     ISU: Nullable fields tanpa .notNull() (#22, #59, #74)
     ISU: Timestamps tanpa timezone (#60)
     ISU: Missing indexes pada kolum status (#72)
     ISU: Campuran data type untuk amount (#73)

C.2) Migrations
     - Drizzle-kit untuk migration management.
     - Schema governance verified dalam CI.
     STATUS: BAIK

C.3) Connection Pool
     - Max connections: configurable via PG_MAX_CONNECTIONS (max 50).
     - Idle timeout: 30s.
     - Connection timeout: 5s.
     - Pool pressure monitoring via db-pool-monitor.ts.
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
     - Retry dan reload functionality.
     ISU: Tiada focus management selepas error (#81)
     STATUS: BAIK

A.4) Lazy Loading
     - lazy-pages.tsx menggunakan React.lazy() untuk code splitting.
     - Vite manual chunks untuk library berat (charts, pdf, excel).
     - Module preload strategy filters out heavy assets.
     STATUS: CEMERLANG

A.5) State Management
     - Kombinasi React hooks, context, dan TanStack Query.
     - Tiada prop drilling yang teruk.
     - Device-aware cache configuration (low-spec: 10s, high-spec: 30s).
     STATUS: CEMERLANG

A.6) Memoization
     - 726 instances useMemo dijumpai — coverage baik.
     STATUS: BAIK

A.7) Timer/Event Cleanup
     - setInterval/setTimeout dibersihkan dalam useEffect cleanup.
     - Document event listeners dipasangkan add/remove.
     - AbortController digunakan untuk fetch requests.
     - Refs digunakan untuk mutable state (elak stale closures).
     STATUS: BAIK


B) UI/UX & ACCESSIBILITY
--------------------------

B.1) Focus Management
     - Global :focus-visible outline style dalam index.css.
     - Radix UI handles focus management dalam dialogs.
     STATUS: BAIK

B.2) Screen Reader Support
     - aria-label, aria-hidden, role, aria-live, aria-expanded digunakan.
     ISU: Typing indicator tiada aria-label (#20)
     ISU: Beberapa butang tiada accessible names.
     ISU: Error boundary tiada focus management (#81)

B.3) Color Contrast
     - Foreground/background: ~15:1 contrast (WCAG AAA)
     - Muted foreground: ~8.2:1 contrast (WCAG AAA)
     ISU: Accent color contrast ~1.1:1 — SANGAT RENDAH (#80)

B.4) Responsive Design
     - 480+ responsive breakpoint instances (sm:, md:, lg:, xl:).
     ISU: 100vh pada mobile (#32)
     ISU: Form loading states (#38)
     ISU: FloatingAI panel melebihi iPhone 375px (#78)

B.5) Loading & Empty States
     - Suspense boundaries dan skeleton components.
     - BackupListEmptyState.tsx — explicit empty state component.
     STATUS: BAIK

B.6) Form Validation
     - React Hook Form + Zod integration.
     - Field-level error rendering.
     STATUS: BAIK


C) CSS & LAYOUT
----------------

C.1) Tailwind Configuration
     - Proper content purge.
     - Theme extensions dengan CSS variables.
     - Dark mode supported via selector strategy.
     STATUS: BAIK

C.2) Theme System
     - CSS variables lengkap dalam theme-tokens.css.
     - @supports fallback pattern.
     ISU: Shadow tokens opacity 0% (#58)
     ISU: 54+ hardcoded colors (#65)

C.3) Z-Index Management
     ISU: Hardcoded tanpa pengurusan berpusat (#76)

C.4) Mobile Viewport
     - 100dvh with @supports fallback dalam index.css (BAIK).
     ISU: FloatingAI.module.css tiada 100svh fallback
     ISU: Beberapa halaman masih guna 100vh (#32)

C.5) Typography
     - System fonts sahaja (tiada web fonts — elak CLS).
     ISU: Nav pill font 13.6px terlalu kecil (#79)
     ISU: Line height tidak konsisten (#85)

C.6) Touch Targets
     ISU: Button sizes di bawah 44px minimum (#64)

C.7) Animations
     - prefers-reduced-motion properly implemented.
     - Kebanyakan animasi guna transform (BAIK).
     ISU: Box-shadow animation dalam FloatingAI (#77)

C.8) Print Styles
     ISU: Hardcoded colors (#83)


D) SECURITY (FRONTEND)
-----------------------

D.1) XSS Prevention
     - dangerouslySetInnerHTML HANYA di chart.tsx.
     - Dilindungi melalui toTrustedHTML().
     - DOM XSS sink tests wujud.
     - Tiada innerHTML atau eval usage.
     STATUS: CEMERLANG

D.2) Safe URL Handling
     - resolveSafeUrl() dengan protocol validation.
     STATUS: BAIK
     ISU KECIL: data: URLs dibenarkan dalam preview

D.3) Token Storage
     ISU: Legacy localStorage access masih ada (#17)

D.4) TypeScript Strict Mode
     - strict: true AKTIF.
     - exactOptionalPropertyTypes AKTIF.
     - noUnusedLocals, noUnusedParameters AKTIF.
     STATUS: CEMERLANG
     >>> Audit 3: Isu #34 DIPERBAIKI ✅


================================================================================
  BAHAGIAN 7: AUDIT KONFIGURASI & INFRASTRUKTUR
================================================================================

A) PACKAGE.JSON
    - 4 moderate npm audit vulnerabilities (esbuild via drizzle-kit).
    - Dependency overrides untuk qs, lodash, rollup, dompurify (BAIK).
    - Node.js >= 24 specified (BAIK).
    - xlsx dari vendor local (file:vendor/sheetjs/xlsx-0.20.2.tgz).
    ISU: Overrides tanpa komen penjelasan (#55).
    >>> Audit 3: Isu #40 (Missing @types) DIPERBAIKI ✅
    STATUS: BAIK

B) TSCONFIG.JSON
    - strict: true AKTIF.
    - exactOptionalPropertyTypes AKTIF.
    - noUnusedLocals AKTIF.
    - noImplicitReturns AKTIF.
    STATUS: CEMERLANG
    >>> Audit 3: Semua isu #34 DIPERBAIKI ✅

C) VITE.CONFIG.TS
    - Manual chunk splitting AKTIF.
    ISU: chunkSizeWarningLimit terlalu tinggi (#30).
    ISU: Tiada source maps untuk staging (#29).

D) CI/CD PIPELINE (.github/workflows/ci.yml)
    - Typecheck, contract tests, client tests, services tests, routes tests.
    - Build verification + bundle budgets.
    - Coverage gate.
    ISU: Hardcoded credentials (#13).
    ISU: Tiada security scanning (#14).
    ISU: Missing test suites (#37).

E) DEPLOYMENT
    ISU: Nginx config tiada HTTPS (#31).
    ISU: PM2 config tiada user specification (#16).

F) .ENV FILES
    - Tiada .env files yang committed. SELAMAT.
    - .env.example wujud dengan semua variables.
    >>> Audit 3: Isu #3 dan #4 DIPERBAIKI ✅
    STATUS: BAIK (default secrets dan guidance sudah dikemaskini)


================================================================================
  BAHAGIAN 8: AUDIT WEBSOCKET & MEMORY TERPERINCI
================================================================================

A) WEBSOCKET LIFECYCLE

A.1) Connection Registration
     ISU: Race condition semasa reconnect — set() selepas close() (#57)
     ISU: Cleanup paths tidak bersihkan kedua-dua Maps (#67)

A.2) Heartbeat
     - 30s sweep interval membersihkan dead sockets.
     ISU: Tiada ws.readyState check sebelum terminate() (#62)

A.3) Authentication
     - JWT verified, rejected sockets closed before Map.set().
     - Failed token attempts kini dilog (DIPERBAIKI).
     STATUS: BAIK

A.4) Broadcast
     ISU: JSON.stringify tanpa had saiz (#75)
     ISU: ws.send() return value diabaikan (backpressure) (#75)
     ISU: Silent catch block (#43)


B) MEMORY MANAGEMENT

B.1) Rate Limit State
     ISU: adaptiveRateState Map boleh membesar tanpa had (#56)

B.2) Tab Visibility Cache
     ISU: Map tanpa TTL enforcement atau had saiz (#23)

B.3) Backup Restore
     ISU: Unbounded Set<string> untuk collection record IDs
     ISU: Temp table INSERT tanpa chunking (#88)

B.4) Payload Processing
     ISU: JSON parse/stringify tanpa had saiz (#75)


C) DATABASE CONNECTION POOL

     - Pool pressure detection (db-pool-monitor.ts).
     - Warning cooldown prevents log spam (60s).
     - Max connections: configurable (default max 50).
     - Idle timeout: 30s.
     - Connection timeout: 5s.
     STATUS: BAIK


D) BCRYPT OPERATIONS

     - Dummy hash digunakan untuk pengguna tidak wujud (timing-safe).
     - Asynchronous bcrypt — tidak block event loop.
     STATUS: CEMERLANG


================================================================================
  BAHAGIAN 9: PERKARA YANG SUDAH BAIK
================================================================================

+-------------------------------------------+----------+---------------------------------+
| Area                                      | Status   | Keterangan                      |
+-------------------------------------------+----------+---------------------------------+
| CSRF Protection                           | Excellent| Double-submit + Sec-Fetch-Site  |
| Password Hashing                          | Excellent| bcrypt + timing-safe comparison |
| Trusted Types                             | Excellent| toTrustedHTML() digunakan betul |
| XSS Prevention                            | Excellent| Tiada innerHTML/eval            |
| TypeScript Strict Mode                    | Excellent| strict + exactOptional + more   |
| Code Splitting                            | Excellent| React.lazy + Vite manual chunks |
| React Query Cache                         | Excellent| Device-aware cache timing       |
| Safe URL Handling                         | Good     | Protocol validation             |
| Helmet/Security Headers                   | Good     | HSTS, CSP, noSniff, frameguard  |
| Structured Logging                        | Good     | Pino logger konsisten           |
| Test Coverage                             | Good     | 269 fail ujian, CI coverage gate|
| Input Validation                          | Good     | Zod schemas pada API contracts  |
| Cookie Security                           | Good     | HttpOnly, SameSite, Secure      |
| Rate Limiting                             | Good     | express-rate-limit pelbagai tier|
| Bundle Budgets                            | Good     | Enforced dalam CI               |
| Body Size Limits                          | Good     | Differentiated per endpoint     |
| Error Boundaries                          | Good     | Route-level error boundary      |
| Timer/Event Cleanup                       | Good     | Proper add/remove patterns      |
| Debouncing                                | Good     | Search input debounced          |
| Dark Mode                                 | Good     | Full theme system               |
| Responsive Design                         | Good     | 480+ breakpoint instances       |
| Form Validation                           | Good     | React Hook Form + Zod           |
| Memoization                               | Good     | 726 useMemo instances           |
| DB Pool Monitoring                        | Good     | Pool pressure detection         |
| Reduced Motion                            | Good     | prefers-reduced-motion support  |
| Backup Streaming                          | Fixed    | Cursor-based pagination         |
| SQL LIKE Escaping                         | Fixed    | sql-like-utils.ts               |
| Rollup PKs                                | Fixed    | Composite primary keys          |
| N+1 Day Insert                            | Fixed    | Batch via sql.join              |
| 100dvh Viewport (index.css)               | Fixed    | @supports fallback pattern      |
| Receipt Logging                           | Fixed    | All catch blocks now log        |
| Radix UI Focus                            | Good     | Auto focus management dialogs   |
| Schema Governance                         | Good     | Verified dalam CI               |
| Repo Hygiene                              | Good     | Automated verification CI       |
| .env.example Secrets                      | Fixed    | GENERATE_ME placeholders        |
| Backup Encryption Key Guidance            | Fixed    | Generate instructions + warning |
| TypeScript Strict Options                 | Fixed    | exactOptional + noUnused AKTIF  |
| @types Packages                           | Fixed    | react-window + recharts added   |
+-------------------------------------------+----------+---------------------------------+


================================================================================
  BAHAGIAN 10: KEUTAMAAN PEMBETULAN (KEMASKINI)
================================================================================

Nota pembacaan:
  - Senarai ini mengekalkan susunan keutamaan audit asal.
  - Item bertanda [DIPERBAIKI] atau [MATERIALLY CLOSED] bukan lagi blocker kod
    aktif untuk repo semasa.
  - [MATERIALLY CLOSED] biasanya bermaksud kod, test, dan local rollout helper
    sudah siap; baki kerja hanyalah rollout lintas-environment atau migration
    besar yang dirancang berasingan.

P0 — SEGERA (Minggu Ini)
  1. WebSocket CSRF vulnerability (#1)
  2. 2FA secret fallback (#2)
  3. [DIPERBAIKI] .env.example default secrets (#3, #4) ✅
  4. WebSocket connection limit (#8)
  5. [BAHARU] Rate limit Map leak — daftarkan sweep interval (#56)
  6. [BAHARU] WebSocket reconnect race condition (#57)
  7. [BAHARU] Shadow opacity 0% — UI depth hilang sepenuhnya (#58)
  8. [BAHARU] 13 timestamp tanpa .notNull() (#59)

P1 — SEBELUM PRODUCTION (2 Minggu)
  9.  Command injection validation (#9)
  10. File upload MIME detection (#10)
  11. Path traversal check (#11)
  12. Login rate limit fix (#12)
  13. CI security scanning (#14, #15)
  14. Token storage migration (#17)
  15. useEffect cleanup (#18)
  16. [BAHARU] Timestamps tanpa timezone (#60)
  17. [BAHARU] IP spoofing rate limit (#61)
  18. [BAHARU] Heartbeat ws.readyState check (#62)
  19. [BAHARU] Touch targets minimum 44px (#64)
  20. [BAHARU] Hardcoded colors -> CSS variables (#65)
  21. [BAHARU] PII logger redaction (#68)
  22. [AUDIT 3] Backdrop filter performance — tambah will-change (#96)

P2 — PENAMBAHBAIKAN BERTERUSAN (Bulan Ini)
  23. React key anti-pattern (#5, #7)
  24. Type safety improvements (#6, #35)
  25. [DIPERBAIKI] TypeScript strictness options (#34) ✅
  26. Pagination limits (#25)
  27. Form loading states (#38)
  28. Mobile viewport (#32)
  29. Missing tests dalam CI (#37)
  30. [MATERIALLY CLOSED] PII encryption at rest (#70)
  31. [BAHARU] Missing FK onUpdate cascade (#71)
  32. [BAHARU] Missing indexes pada kolum status (#72)
  33. [MATERIALLY CLOSED] Amount data type standardization (#73)
  34. [BAHARU] JSON parse/stringify size limits (#75)
  35. [BAHARU] Z-index centralization (#76)
  36. [AUDIT 3] Unmounted state update + missing .catch() (#91, #92, #93)
  37. [AUDIT 3] Event listener cleanup (#94)
  38. [AUDIT 3] Missing :focus-visible pada Home cards (#95)
  39. [AUDIT 3] Content-visibility CLS risk (#97)
  40. [AUDIT 3] Auth text contrast ratio (#98)

P3 — NICE TO HAVE
  41. Error format standardization (#42)
  42. Documentation improvements (#46, #51)
  43. Config improvements (#39, #52-55)
  44. [DIPERBAIKI] Missing @types packages (#40) ✅
  45. [BAHARU] FloatingAI panel responsive fix (#78)
  46. [BAHARU] Nav pill font size (#79)
  47. [BAHARU] Error boundary focus management (#81)
  48. [BAHARU] Line height standardization (#85)
  49. [BAHARU] Backup restore chunking (#88)
  50. [AUDIT 3] AI search timeout buffer (#90)
  51. [AUDIT 3] Query stale time tuning (#99)
  52. [AUDIT 3] Receipt zoom CSS duplication (#100)
  53. [AUDIT 3] Missing reduced-motion welcome-pop (#101)
  54. [AUDIT 3] Safe area inset consistency (#102)


================================================================================
  BAHAGIAN 11: STATISTIK CODEBASE
================================================================================

Jumlah fail sumber (*.ts, *.tsx):          ~711+ fail
Jumlah fail ujian (*.test.ts, *.test.tsx): 269 fail
Jumlah baris kod:                          ~166,843 baris
Fail terbesar:
  - collection.routes.integration.test.ts  (3,100 baris)
  - auth.routes.integration.test.ts        (1,756 baris)
  - collection-daily-record.service.test.ts(1,542 baris)
  - permission-matrix.integration.test.ts  (1,208 baris)

Fail sumber terbesar:
  - schema-postgres.ts                     (898 baris)
  - Viewer.tsx                             (839 baris)
  - sidebar.tsx                            (727 baris, generated)
  - collection-record-mutation-operations  (725 baris)

Stack Teknologi:
  Frontend:  React 18.3.1, TypeScript 5.6.3, Tailwind CSS 3.4, Radix UI,
             TanStack Query 5, Wouter 3.3, React Hook Form 7, Zod 3.24
  Backend:   Node.js 24+, Express 4.21, Drizzle ORM 0.45, Pino 10 logger
  Database:  PostgreSQL (pg 8.16)
  Build:     Vite 6.4, esbuild 0.25
  CI/CD:     GitHub Actions
  Testing:   Node.js test runner, Supertest, c8 coverage, Playwright
  Security:  Helmet 8, express-rate-limit 8, bcrypt 6, jsonwebtoken 9

Jumlah Audit:
  Audit 1 (2026-04-07): 55 isu dikesan
  Audit 2 (2026-04-08): +34 isu baharu = 89 jumlah
  Audit 3 (2026-04-09): +13 isu baharu, 4 diperbaiki = 110 isu aktif
  Diperbaiki keseluruhan: 4 isu (#3, #4, #34, #40)


================================================================================
  KESIMPULAN
================================================================================

Codebase Sumbangan Query Rahmah (SQR) adalah BERKUALITI TINGGI secara
keseluruhan dengan seni bina yang matang dan amalan keselamatan yang kukuh.

Audit menyeluruh kedua (2026-04-08) menambah 34 penemuan baharu kepada
55 isu asal, menjadikan jumlah 89 isu keseluruhan.

Audit menyeluruh ketiga (2026-04-09) mengesahkan 4 isu telah DIPERBAIKI
dan menambah 13 penemuan baharu, menjadikan jumlah 110 isu aktif.

Isu yang telah DIPERBAIKI sejak audit lepas:
  * .env.example secrets — kini guna GENERATE_ME placeholders
  * Backup encryption key guidance — kini ada arahan lengkap
  * TypeScript strict options — exactOptionalPropertyTypes AKTIF
  * Missing @types packages — react-window + recharts ditambah

Penemuan paling kritikal baharu (Audit 3):
  * Unmounted state update risk — boleh crash komponen
  * Event listener accumulation — potensi memory leak
  * Missing :focus-visible — aksesibiliti keyboard terjejas
  * Backdrop filter tanpa will-change — performance issue
  * Content-visibility CLS — layout shift pada landing page
  * Contrast ratio rendah — aksesibiliti visual terjejas

Penemuan kritikal terdahulu yang masih aktif:
  * Rate limit Map leak - boleh menyebabkan kehabisan memori (DoS)
  * WebSocket reconnect race condition - sambungan yatim
  * Shadow CSS opacity 0% - semua kesan visual depth hilang
  * 13 timestamp tanpa notNull - integriti data terancam
  * Semua timestamp tanpa timezone - risiko data inconsistency

Kemaskini status pasca pembetulan (2026-04-09):
  * #70 PII encryption at rest kini materially closed dalam kod semasa.
    Local rollout juga sudah bersih; baki tinggal rollout lintas-environment.
  * #73 amount standardization kini materially closed pada boundary code.
    Baki hanya migration schema literal jika mahu satu datatype DB sahaja.

14 isu CRITICAL memerlukan tindakan segera.
26 isu HIGH perlu ditangani sebelum production.
Baki 70 isu (MEDIUM + LOW) boleh ditangani secara beransur-ansur.

Skor kesihatan keseluruhan: 7.9 / 10
(Naik sedikit dari 7.8 kerana pembetulan .env.example, TypeScript strict,
 dan @types packages. Masih tertakluk kepada isu kritikal yang belum
 diperbaiki.)

Disediakan oleh: AI Full-Stack Engineer Audit
Tarikh Asal: 2026-04-07
Tarikh Kemaskini Kedua: 2026-04-08
Tarikh Kemaskini Ketiga: 2026-04-09

================================================================================
  TAMAT LAPORAN AUDIT
================================================================================

