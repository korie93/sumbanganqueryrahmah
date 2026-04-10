================================================================================
  LAPORAN AUDIT PENUH SISTEM — SUMBANGAN QUERY RAHMAH (SQR)
  Tarikh Audit Asal: 2026-04-07
  Tarikh Kemaskini Kedua: 2026-04-08 (Audit Menyeluruh Kedua)
  Tarikh Kemaskini Ketiga: 2026-04-09 (Audit Menyeluruh Ketiga)
  Tarikh Kemaskini Keempat: 09/04/2026 (Audit Menyeluruh Keempat)
  Tarikh Kemaskini Kelima: 10/04/2026 (Audit Susulan Kelima)
  Tarikh Kemaskini Keenam: 10/04/2026 (Audit Menyeluruh Keenam)
  Kaedah: Pemeriksaan kod statik keseluruhan
          (backend, frontend, UI/UX, layout, CSS, database, WebSocket, memori)
  Mod: Audit statik asal + penjejakan status pasca pembetulan
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

Audit ketiga (2026-04-09) pada asalnya mengesahkan beberapa pembetulan
dan menambah penemuan baharu merangkumi:
  - 4 isu yang ketika itu telah DIPERBAIKI (#3, #4, #34, #40)
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

Audit keempat (09/04/2026) merupakan audit menyeluruh merangkumi backend,
frontend, UI/UX, layout, CSS, dependencies, dan infrastructure. Penemuan utama:

  PENILAIAN KESELURUHAN: TIADA ISU KRITIKAL DITEMUI.
  Sistem sudah production-ready dengan amalan keselamatan tahap enterprise.

  Status keseluruhan setiap kawasan:
    - Backend Security:        ✅ Sangat Baik (Risiko Rendah)
    - Backend Architecture:    ✅ Baik (Risiko Rendah)
    - Frontend React:          ✅ Baik (Risiko Rendah-Sederhana)
    - Memory Management:       ✅ Sangat Baik (Risiko Rendah)
    - CSS/Layout:              ✅ Baik (Risiko Rendah)
    - UI/UX:                   ✅ Baik (Risiko Rendah)
    - Testing:                 ✅ Baik (85%+ coverage, 312 test files)
    - CI/CD:                   ✅ Sangat Baik (7 verification gates)
    - Dokumentasi:             ✅ Sangat Baik (23 dokumen teknikal)
    - Dependencies:            ✅ Baik (0 npm audit vulnerabilities)

  Isu tahap TINGGI yang ditemui (bukan kritikal):
    H1. Key rendering tidak stabil dalam SingleImportPanel.tsx (baris 193)
        — key list render bergantung pada nilai sel data, bukan ID stabil
        >>> STATUS: ✅ DIPERBAIKI (Kemaskini susulan, 2026-04-10)
            Preview import kini menggunakan preview-row key stabil
            berasaskan object identity, bukan gabungan nilai sel.
    H2. Coverage rendah pada Imports API — branch coverage hanya 21.73%
        >>> STATUS: ✅ DIPERBAIKI (Kemaskini susulan, 2026-04-10)
            Suite imports API kini meliputi branch penting untuk invalid
            cursor, missing importId, timeout analysis, 404 rename/delete,
            dan kegagalan multipart upload. Targeted coverage imports API
            kini naik kepada 88.13% branch secara keseluruhan
            (controller imports: 84.61% branch).
    H3. Error boundary untuk lazy routes — ada page dengan Suspense tanpa
        ErrorBoundary khusus
        >>> STATUS: ✅ DIPERBAIKI (Kemaskini susulan, 2026-04-10)
            Authenticated entry route, System Monitor section routes, dan
            Collection Report sub-routes kini dibalut AppRouteErrorBoundary
            khusus supaya kegagalan lazy import tidak menjatuhkan seluruh shell.

  Isu tahap SEDERHANA:
    M1. Prop drilling berlebihan dalam Monitor.tsx (75+ props)
        >>> STATUS: ✅ DIPERBAIKI (Kemaskini susulan, 2026-04-10)
            Wiring monitor page kini dipindah ke MonitorPageProvider dan
            page-section wrappers khusus, jadi Monitor.tsx tinggal shell
            komposisi tanpa menyalurkan puluhan prop mentah ke setiap seksyen.
    M2. Tiada landscape orientation handling dalam CSS
        >>> STATUS: ✅ DIPERBAIKI (Kemaskini susulan, 2026-04-10)
            Mobile landscape rules kini ditambah untuk public-auth shell,
            login shell, dan operational app shell supaya padding, alignment,
            card density, dan safe-area spacing lebih stabil pada viewport
            telefon yang rendah tetapi lebar.
    M3. Breakpoint tidak konsisten (640px, 767px, 768px, 1023px, 1024px)
        >>> STATUS: ✅ DIPERBAIKI (Kemaskini susulan, 2026-04-10)
            Kontrak viewport kini dipusatkan dalam client/src/lib/responsive.ts,
            consumer viewport JavaScript utama diseragamkan kepada helper/query
            shared yang sama, dan verify:client-breakpoint-contract mengunci
            set breakpoint CSS 640/767/768/1023/1024 supaya tidak drift semula.
    M4. Spacing system tidak lengkap — hanya satu token (--spacing: 0.25rem)
        >>> STATUS: ✅ DIPERBAIKI (Kemaskini susulan, 2026-04-10)
            Theme tokens kini mempunyai spacing scale lengkap berasaskan
            --spacing, Tailwind spacing diselaraskan kepada token tersebut,
            shell CSS utama mula menggunakan var(--spacing-*), dan
            verify:design-token-spacing mengunci kontrak spacing supaya
            token theme/Tailwind/layout tidak regress semula.
    M5. Komponen besar perlu decomposition (Monitor 426, Analysis 363,
        Dashboard 333, ViewerContent 331 baris)
        >>> STATUS: ✅ DIPERBAIKI (Kemaskini susulan, 2026-04-10)
            Monitor, Analysis, Dashboard, dan ViewerContent kini
            dipecahkan kepada sub-komponen khusus (header/section/grid)
            supaya fail utama kekal sebagai shell komposisi yang mudah
            diselenggara.
    M6. CSS hsl(from ...) browser compatibility belum disahkan
        >>> STATUS: ✅ DIPERBAIKI (Kemaskini susulan, 2026-04-10)
            Border theme tokens kini menggunakan nilai HSL eksplisit yang
            browser-safe untuk light/dark mode tanpa relative color syntax,
            dan verify:design-token-color-compatibility mengunci kontrak ini
            dalam script/test/release gates.

  Isu tahap RENDAH:
    L1. WebSocket message typing tidak enforced (AutoLogout.tsx baris 302)
        >>> STATUS: ✅ DIPERBAIKI (Kemaskini susulan, 2026-04-10)
            AutoLogout kini menggunakan parser/union type khusus untuk
            mesej WebSocket (`logout`, `kicked`, `banned`,
            `maintenance_update`, `settings_updated`) supaya akses payload
            tidak lagi bergantung pada JSON mentah tanpa typing.
    L2. localStorage tanpa try-catch (Maintenance.tsx, Settings.tsx)
        >>> STATUS: ✅ DIPERBAIKI (Kemaskini susulan, 2026-04-10)
            Semua akses localStorage mentah dalam client/src kini dialih
            kepada browser-storage safety helpers, dan
            verify:browser-storage-safety menghalang penggunaan
            localStorage.getItem/setItem/removeItem secara langsung.
    L3. DOM query tanpa caching (floating-ai-dom-utils.ts)
        >>> STATUS: ✅ DIPERBAIKI (Kemaskini susulan, 2026-04-10)
            Floating AI DOM obstacle query kini dikongsi semula dalam
            setiap animation frame antara observer sync dan layout sync,
            jadi selector scan untuk avoid/dialog tidak lagi diulang pada
            laluan kemaskini yang sama.
    L4. Error logging terhad di route files (hanya 10 explicit statements)
        >>> STATUS: ✅ DIPERBAIKI (Kemaskini susulan, 2026-04-10)
            Helper routeHandler/logRouteHandlerError kini melog ralat route
            secara konsisten bersama metadata request, sementara global
            error handler mengelak duplicate logging untuk ralat yang sudah
            direkodkan di lapisan route.
    L5. Tiada predictive data prefetching
        >>> STATUS: ✅ DIPERBAIKI (Kemaskini susulan, 2026-04-10)
            Navigasi utama kini memanaskan lazy bundles dan query kritikal
            secara predictive melalui hover/focus prefetch serta idle
            background prefetch untuk dashboard, settings backup, dan
            modul System Monitor yang paling berkemungkinan dibuka seterusnya.
    L6. allowImportingTsExtensions: true bukan standard (client/tsconfig.json)
        >>> STATUS: ✅ DIPERBAIKI (Kemaskini susulan, 2026-04-10)
            client/tsconfig.json kini kembali kepada konfigurasi bundler
            standard tanpa allowImportingTsExtensions, dan
            verify:client-tsconfig-contract mengunci kontrak ini serta
            menghalang import .ts/.tsx specifiers dalam client source.

  Amalan terbaik yang sudah dilaksanakan:
    ✅ 389 AbortController instances dengan proper cleanup
    ✅ 90 lazy-loaded components dengan strategic preloading
    ✅ SQL injection protection (Drizzle ORM parameterized queries)
    ✅ CSRF protection (double-submit + Sec-Fetch-Site + Origin validation)
    ✅ JWT authentication dengan secret rotation
    ✅ Rate limiting multi-scope (login, search, admin, destructive)
    ✅ Input validation (Zod schemas + length limits)
    ✅ Helmet security headers
    ✅ WebSocket auth + connection limits (5/user) + heartbeat (30s)
    ✅ 100svh/100dvh dengan @supports fallback
    ✅ Safe area insets untuk notched devices
    ✅ Z-index system berpusat (CSS variables)
    ✅ Dark mode penuh (CSS tokens + Tailwind)
    ✅ Animasi GPU-accelerated (transform/opacity sahaja)
    ✅ prefers-reduced-motion support
    ✅ Low-spec device optimization (.low-spec class)
    ✅ Touch targets ≥44x44px
    ✅ Print styles dilaksanakan
    ✅ 46+ color tokens (light + dark)
    ✅ Shadow scale system (2xs → 2xl)
    ✅ Enterprise-grade CI pipeline (CodeQL, bundle budgets, schema governance)
    ✅ 0 npm audit vulnerabilities
    ✅ Deployment configs sedia (nginx, pm2, systemd)

  Cadangan tindakan mengikut keutamaan:
    SEGERA:
      1. [DIPERBAIKI] Perbaiki key rendering dalam SingleImportPanel.tsx — gunakan ID stabil
      2. [DIPERBAIKI] Tambah error boundaries pada semua lazy-loaded routes
      3. [DIPERBAIKI] Tambah test coverage untuk imports API (terutama branch coverage)
    JANGKA PENDEK (2-3 Sprint):
      4. [DIPERBAIKI] Refactor Monitor page — kurangkan prop drilling dengan context providers
      5. [DIPERBAIKI] Seragamkan responsive breakpoints
      6. [DIPERBAIKI] Wujudkan spacing scale tokens yang lengkap
      7. [DIPERBAIKI] Pecahkan komponen besar (>300 baris) kepada sub-components
      8. [DIPERBAIKI] Wrap semua localStorage operations dengan try-catch
    JANGKA PANJANG:
      9. [DIPERBAIKI] Tambah troubleshooting section dalam README
      10. [DIPERBAIKI] Tambah landscape orientation styles
      11. [DIPERBAIKI] Verify hsl(from ...) browser compatibility
      12. [DIPERBAIKI] Tambah predictive data prefetching
      13. [DIPERBAIKI] Dokumenkan CSS architecture dan component styling guide

Snapshot audit asal (2026-04-09): 110 penemuan gabungan mengikut kiraan
laporan ketika audit dilakukan.
Status item bernombor dalam dokumen ini:
  - 102 item: ✅ DIPERBAIKI
  - 0 item: MATERIALLY CLOSED
  - 0 item: tanpa STATUS
Audit susulan 10/04/2026 menambah 13 penemuan tidak bernombor:
  - 15 item: ✅ DIPERBAIKI (H1, H2, H3, M1, M2, M3, M4, M5, M6, L1, L2, L3, L4, L5, L6)
  - 0 item: TERBUKA

Audit keenam 10/04/2026 (Audit Menyeluruh Keenam) menambah 15 penemuan
baharu yang BELUM diperbaiki dan disusun sebagai senarai tindakan Codex.
  - 3 item TINGGI, 9 item SEDERHANA, 3 item RENDAH
  - Semua disenaraikan dalam BAHAGIAN 12 di bawah.
  - Setiap item termasuk fail, baris, penerangan, dan arahan pembetulan
    yang boleh digunakan terus oleh Codex/AI agent.

Nota: angka snapshot audit asal dikekalkan sebagai rekod sejarah. Untuk
      keadaan repo semasa, rujuk penanda STATUS pada setiap item dan
      blok audit susulan di ringkasan eksekutif.

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
| JUMLAH SNAPSHOT AUDIT ASAL    |    14    |  26  |   48   | 22  |  110   |
| Diperbaiki pada audit ke-3    |     0    |   0  |    2   |  2  |    4   |
+-------------------------------+----------+------+--------+-----+--------+

Nota: jadual di atas ialah agihan snapshot audit asal. Status repo semasa
ditentukan melalui penanda STATUS pada setiap item, bukan melalui jadual ini.


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
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Query-string session token kini ditolak, dan handshake browser
        lintas-origin turut ditolak melalui semakan origin/host/proto.

#2  Unsafe Session Secret Fallback untuk 2FA
    Fail: server/config/security.ts (baris 16-27)
    Isu:  getTwoFactorDecryptionSecrets() guna sessionSecret sebagai
          fallback untuk 2FA decryption. Jika session secret bocor,
          2FA encryption juga terjejas.
    Cadangan: Guna dedicated TWO_FACTOR_ENCRYPTION_KEY sahaja,
              jangan fallback ke session secret.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        2FA kini hanya menerima dedicated TWO_FACTOR_ENCRYPTION_KEY
        tanpa fallback ke session secret.

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
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Senarai dinamik utama kini menggunakan ID stabil, termasuk
        AI chat, viewer filters, analysis tables, dan result cards.
        Baki penggunaan index yang masih wujud hanyalah placeholder
        loading statik tanpa state pengguna.

#6  Unsafe 'as any' pada Parsing Import Data
    Fail: client/src/pages/import/parsing.ts (baris 122-124)
    Isu:  null as any dan akses property tanpa type guard pada data
          Excel yang tidak divalidasi. Data luar yang tidak dipercayai
          dicast terus tanpa semakan.
    Cadangan: Guna Zod schema atau type guard yang betul.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Parsing import kini tidak lagi bergantung pada as any untuk
        laluan ini, dan matrix Excel dinormalisasi sebelum row
        diproses.

#7  AIChat Message Key Tidak Stabil
    Fail: client/src/components/AIChat.tsx (baris 78)
    Isu:  key={`${msg.timestamp}-${idx}`} — gabungan timestamp+index
          tidak unik. Jika mesej tiba out-of-order, React boleh reuse
          DOM dengan salah.
    Cadangan: Guna msg.id yang unik.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        AI chat kini merender mesej dengan msg.id yang dinormalisasi
        secara konsisten pada append path.

#8  WebSocket Tiada Had Sambungan Per Pengguna
    Fail: server/ws/runtime-manager.ts (baris 22-47)
    Isu:  Satu pengguna boleh buat sambungan WebSocket tanpa had
          -> kehabisan memori (DoS).
    Cadangan: Tambah MAX_CONNECTIONS_PER_USER = 5.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Runtime WebSocket kini menghadkan maksimum 5 sambungan aktif
        bagi setiap pengguna.

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
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Sweep interval 30s, grace 10s, had bucket maksimum, dan cleanup
        shutdown kini sudah dilaksanakan.

#57 [BAHARU] WebSocket Race Condition Semasa Reconnect
    Fail: server/ws/runtime-manager.ts (baris 281-291)
    Isu:  Apabila pengguna reconnect, sambungan lama ditutup ws.close()
          SEBELUM sambungan baru didaftarkan dalam connectedClients.set().
          Jika close handler berjalan secara sinkron, ia menetapkan
          cleanedUp = true, menyebabkan sambungan baru TIDAK PERNAH
          didaftarkan tetapi masih aktif — sambungan yatim dalam memori.
    Cadangan: Daftarkan sambungan baru dalam Map SEBELUM menutup
              sambungan lama.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Sambungan baru kini didaftarkan dahulu sebelum sambungan lama
        ditutup, mengelakkan socket yatim dalam memori.

#58 [BAHARU] Shadow CSS Tidak Kelihatan (Opacity 0%)
    Fail: client/src/theme-tokens.css (baris 50-57 & 134-141)
    Isu:  SEMUA shadow token ditetapkan dengan opacity / 0 — bermakna
          tiada bayangan kelihatan di mana-mana dalam UI. Kad, butang,
          dan kesan kedalaman semuanya hilang.
          Contoh: --shadow-sm: 0px 2px 0px 0px hsl(217 91% 60% / 0);
    Cadangan: Tetapkan nilai opacity yang betul (cth. 0.08, 0.12, 0.15).
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Shadow tokens light/dark kini menggunakan opacity yang nampak
        dan konsisten.

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
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Kolum timestamp yang mempunyai .defaultNow() kini sudah
        dipadankan dengan .notNull().

#60 [BAHARU] Semua Timestamp Tanpa Timezone
    Fail: Semua fail schema-postgres-*.ts
    Isu:  Semua kolum timestamp menggunakan timestamp("...") tanpa
          .withTimezone(true). Dalam persekitaran multi-timezone atau
          deployment cloud, data boleh ditafsirkan secara berbeza.
    Cadangan: Tambah .withTimezone(true) pada semua timestamp
              untuk memastikan konsistensi UTC.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Schema PostgreSQL kini menggunakan timestamp dengan timezone
        melalui helper utcTimestamp().

#61 [BAHARU] IP Spoofing dalam Rate Limiting
    Fail: server/middleware/rate-limit.ts (baris 46)
    Isu:  Rate limiter bergantung sepenuhnya pada req.ip tanpa
          pengesahan tambahan. Jika trust proxy tidak dikonfigurasi
          dengan betul, penyerang boleh mengelak rate limiting dengan
          menghantar header X-Forwarded-For palsu.
    Cadangan: Tambah pengesahan trust proxy yang ketat dan pertimbangkan
              fingerprinting tambahan (User-Agent, Accept-Language).
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Express trust proxy kini dikonfigurasi secara eksplisit,
        adaptive protection mengabaikan spoofed X-Forwarded-For apabila
        trust proxy tidak aktif, dan auth rate limit fingerprint kini
        turut menggabungkan direct peer address serta client hints.


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
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Scanner config kini ditapis lebih ketat: bare command mesti
        benar-benar resolve di PATH, args wajib ada placeholder fail
        yang sah, config invalid fail sebagai controlled security error,
        dan target file mesti wujud sebelum spawn dijalankan.

#10 File Upload MIME Type Spoofing
    Fail: server/routes/collection-receipt-file-type-utils.ts
    Isu:  Validasi extension hanya semak .startsWith("image/") untuk
          MIME type. MIME type dikawal oleh attacker dan boleh dipalsukan.
    Cadangan: Detect jenis fail sebenar dari file buffer menggunakan
              library 'file-type'.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Upload receipt kini menggunakan signature/file-buffer detection,
        bukan percaya MIME type atau extension yang dihantar klien.

#11 Path Traversal dalam Frontend Static Files
    Fail: server/internal/frontend-static.ts (baris 52-53)
    Isu:  path.resolve(cwd, relPath) tanpa pengesahan bahawa relPath
          tidak keluar dari cwd. Client boleh request ../../etc/passwd.
    Cadangan: Tambah semakan path containment menggunakan
              isPathInsideDirectory().
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Laluan static frontend kini disemak dengan containment guard
        sebelum dibenarkan mengakses fail di bawah working directory.

#12 Login Rate Limit Boleh Dielak
    Fail: server/middleware/rate-limit.ts (baris 90)
    Isu:  Login rate limiter guna req.body?.username dalam key.
          Attacker boleh bypass dengan tukar username sambil serang
          IP yang sama.
    Cadangan: Tambah IP sebagai rate limit key utama.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Login kini dibatasi oleh fingerprint IP/client utama terlebih
        dahulu, dengan username-specific limiter sebagai lapisan kedua.

#13 CI/CD — Hardcoded Credentials
    Fail: .github/workflows/ci.yml (baris 126, 134, 137)
    Isu:  SESSION_SECRET: ci-session-secret (lemah)
          PG_PASSWORD: postgres (default password)
          SEED_SUPERUSER_PASSWORD: Password123! (lemah)
    Cadangan: Guna GitHub Secrets atau generate secara dinamik.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Nilai CI kini dijana per-run menggunakan github.run_id dan
        github.run_attempt, bukan lagi secret/demo password statik.

#14 CI/CD — Tiada Security Scanning
    Fail: .github/workflows/ci.yml
    Isu:  Tiada SAST, dependency scanning, atau secret scanning
          dalam pipeline. Vulnerable packages boleh masuk tanpa dikesan.
    Cadangan: Tambah CodeQL atau Trivy scanning.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Workflow CodeQL kini wujud dan berjalan berjadual serta pada
        push/pull_request untuk JavaScript/TypeScript.

#15 Tiada npm audit dalam CI
    Fail: .github/workflows/ci.yml
    Isu:  Script npm run audit:dependencies wujud tapi tidak dipanggil
          dalam CI. 4 moderate vulnerabilities telah dikesan (esbuild
          via drizzle-kit).
    Cadangan: Tambah step npm run audit:dependencies dalam CI.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        CI build-and-test dan smoke-ui kini sama-sama menjalankan
        npm run audit:dependencies sebelum build/test utama.

#16 PM2 Config Tanpa User/Group Specification
    Fail: deploy/pm2/ecosystem.config.cjs.example
    Isu:  Tiada OS user specification. Process mungkin berjalan sebagai
          root.
    Cadangan: Tambah user: "www-data", uid, gid.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Contoh PM2 kini menetapkan user/uid/gid kepada www-data.

#17 Token Storage dalam localStorage (Masih Ada Legacy)
    Fail: client/src/lib/auth-session.ts (baris 41-44, 60-61)
    Isu:  Migrasi dari localStorage ke sessionStorage masih dalam proses.
          Legacy localStorage access masih wujud. Token dalam localStorage
          terdedah kepada XSS.
    Cadangan: Selesaikan migrasi sepenuhnya. Pertimbangkan HttpOnly cookies.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Auth session kini fokus pada cookie + sessionStorage. Legacy
        localStorage access telah dipisahkan kepada cleanup helper sahaja.

#18 Missing useEffect Cleanup (Memory Leak)
    Fail: client/src/components/useAIChatTypingAction.ts (baris 46)
    Isu:  useEffect cipta setInterval tanpa cleanup function. Memory
          leak pada setiap re-render atau unmount.
    Cadangan: Tambah return cleanup dalam useEffect.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Cleanup AI chat runtime kini diurus secara defensif pada hook
        runtime refs, termasuk abort request, interval, retry timer,
        slow-notice timer, dan reset processing state ketika unmount.

#19 AI Chat Error State Tidak Konsisten
    Fail: client/src/components/useAIChatState.ts (baris 130-200)
    Isu:  executeSearch guna fetch dengan abort controller tapi error
          handling tidak konsisten. Jika network gagal mid-stream,
          error state mungkin tidak dikemaskini.
    Cadangan: Pastikan semua error path set error state dan kemaskini UI.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Error path AI chat kini menggunakan controlled request error,
        fallback mesej yang konsisten untuk JSON rosak/non-OK payload,
        dan reset processing state yang dipusatkan supaya UI tidak
        tertinggal dalam state separa-proses.

#20 Typing Indicator Tiada Accessibility Label
    Fail: client/src/components/AIChat.tsx (baris 89-93)
    Isu:  Typing indicator dots tiada aria-label. Pengguna screen
          reader tidak tahu apa ini.
    Cadangan: Tambah aria-label="AI sedang berfikir".
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Typing indicator kini menggunakan role="status" dan
        aria-label="AI sedang berfikir".

--- Penemuan Baharu Audit 2 (#62 - #68) ---

#62 [BAHARU] Heartbeat WebSocket: Race Condition
    Fail: server/ws/runtime-manager.ts (baris 135-154)
    Isu:  Heartbeat check menggunakan WeakSet aliveSockets. Jika socket
          bertukar ke status CONNECTING antara semakan dan terminate(),
          socket yang masih sah boleh ditamatkan. Tiada semakan
          ws.readyState sebelum terminate().
    Cadangan: Tambah if (ws.readyState === WebSocket.OPEN) sebelum
              terminate().
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Heartbeat kini menyemak readyState sebelum terminate() dan
        regression test turut melindungi path CONNECTING/close cleanup.

#63 [BAHARU] Backup Export: Memori untuk Payload Besar
    Fail: server/repositories/backups-payload-utils.ts (baris 117-289)
    Isu:  Walaupun streaming pagination telah dilaksanakan (baik),
          setiap halaman masih di-JSON.stringify dalam memori. Password
          hashes dan data sensitif ditulis ke fail temp dalam plaintext.
    Cadangan: Set memory limits, monitor backup export memory usage,
              encrypt sensitive fields sebelum tulis ke disk.
    >>> STATUS: ✅ DIPERBAIKI (Kemaskini semula, 2026-04-10)
        Temp payload kini diencrypt di disk, row/payload limits serta
        memory observability telah ditambah, storage backup dipecah kepada
        chunk table, dan export path kini distream tanpa membina semula
        satu backupDataJson penuh di memory. Restore kini juga memblok
        payload melebihi BACKUP_MAX_PAYLOAD_BYTES sebelum parser dataset
        berjalan, dan export/restore menggunakan metadata payloadBytes
        sebagai preflight supaya backup oversize boleh ditolak sebelum
        chunk payload dibaca penuh. Kemaskini 2026-04-10 menutup baki
        restore/full-parse hotspot dengan bacaan backup_payload_chunks
        berperingkat dari DB serta streamed decryption untuk payload v2,
        jadi export/restore tidak lagi preload semua row chunk serentak.

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
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Button primitives dan control utama yang disentuh audit kini
        mematuhi minimum 44x44px pada mobile.

#65 [BAHARU] 54+ Warna Hardcoded dalam CSS
    Fail: FloatingAI.module.css, PublicAuthLayout.css,
          PublicAuthControls.css, styles/ai.css
    Isu:  54+ nilai warna RGBA/HSL hardcoded dijumpai berbanding
          menggunakan CSS variable dari sistem tema. Menyukarkan
          penyelenggaraan dan penukaran tema/dark mode.
          Contoh: rgba(2, 6, 23, 0.72), rgba(59, 130, 246, 0.7)
    Cadangan: Gantikan dengan CSS variables dari theme-tokens.css.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Fail CSS utama yang disebut audit telah dipindahkan kepada
        theme tokens dan tidak lagi bergantung pada palette hardcoded.

#66 [BAHARU] LIKE Pattern: Perlu Ujian Komprehensif
    Fail: server/repositories/search.repository.ts (baris 86-126)
    Isu:  Walaupun escapeLikePattern() telah dilaksanakan, tiada ujian
          unit yang komprehensif untuk mengesahkan terhadap semua variasi
          input LIKE injection (%, _, \, dsb).
    Cadangan: Tambah ujian unit untuk pelbagai kes LIKE injection.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Ujian LIKE injection kini meliputi %, _, \\ , quote literal,
        input kosong, dan mode contains/startsWith/endsWith.

#67 [BAHARU] Tiada Cleanup Path Lengkap untuk WebSocket Maps
    Fail: server/ws/runtime-manager.ts (baris 224-302)
    Isu:  Beberapa path error memanggil cleanupSocket() tanpa
          membersihkan kedua-dua connectedClients DAN socketUserKeys
          Maps secara eksplisit. Entry boleh terkumpul.
    Cadangan: Pastikan semua path cleanup membersihkan kedua-dua Maps.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Runtime manager kini membersihkan connectedClients dan
        socketUserKeys secara konsisten, termasuk path close/error dan
        shutdown server.

#68 [BAHARU] Logger Tidak Redact Semua PII
    Fail: server/lib/logger.ts (baris 8-25)
    Isu:  Logger redacts password, token, email, tetapi TIDAK redact:
            - phone / customerphone (data peribadi sensitif)
            - customername (PII dalam collection records)
            - staffname (PII)
            - amount (sensitif dalam konteks tertentu)
    Cadangan: Tambah pattern PII yang lebih komprehensif ke REDACT_KEYS.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Redaction logger kini menormalkan key name dan menutup variasi
        camelCase, snake_case, kebab-case, dotted keys, serta blind-index PII.


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
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Header idempotency kini dihadkan kepada 512 aksara, JSON
        fingerprint divalidasi, dan parse cache kecil digunakan supaya
        request berulang tidak mengulang JSON.parse secara sia-sia.

#22 Missing NOT NULL Constraints pada Collection Fields
    Fail: shared/schema-postgres-collection.ts
    Isu:  Beberapa field kritikal nullable walaupun ada default values.
    Cadangan: Tambah .notNull() pada field yang wajib.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Field collection yang mempunyai default dan memang wajib kini
        telah dilindungi dengan .notNull(). Field yang kekal nullable
        adalah laluan yang memang disengajakan seperti PII retirement
        compatibility, receipt metadata opsional, atau data OCR opsional.

#23 Tab Visibility Cache Tiada Eviction
    Fail: server/auth/guards.ts (baris 75-87)
    Isu:  Cache tiada had saiz dan tiada TTL enforcement. Dengan banyak
          pengguna, cache membesar tanpa kawalan (memory leak).
    Cadangan: Implement LRU cache dengan MAX_CACHE_SIZE = 100
              dan TTL 5 minit.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Cache tab visibility kini mempunyai TTL 5 minit dan had saiz
        100 entri dengan refresh LRU ringkas.

#24 Missing Cascade Delete pada Foreign Keys
    Fail: server/internal/collection-bootstrap-record-schema.ts
    Isu:  Record yatim tidak dibersihkan apabila parent dipadam.
    Cadangan: Tambah ON DELETE CASCADE.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Bootstrap schema kini menambah foreign key dengan ON DELETE
        CASCADE dan ON UPDATE CASCADE pada laluan receipt/relationship
        yang audit asal sebut.

#25 Pagination Tiada Had Maximum
    Fail: shared/api-contracts.ts
    Isu:  Pagination schema tiada limit maximum. Client boleh request
          limit=999999999 -> DoS.
    Cadangan: Tambah z.number().max(1000).
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Contract pagination kini menggunakan max(1000) pada limit/pageSize.

#26 Readline Stream Error Tidak Ditangani
    Fail: server/services/import-upload-csv-utils.ts (baris 80-115)
    Isu:  for await (const rawLine of lineReader) boleh throw
          unhandled error jika lineReader.close() gagal.
    Cadangan: Tambah lineReader.on("error", ...).
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        CSV parser kini menangkap error daripada input stream DAN
        readline interface, dengan cleanup defensif semasa close/destroy
        dan regression tests untuk kedua-dua path.

#27 WebSocket Session Auth Silent Catch
    Fail: server/ws/session-auth.ts (baris 20-22)
    Isu:  JWT validation error ditelan tanpa logging. Attacker boleh
          probe untuk valid activity IDs tanpa dikesan.
    Cadangan: Log suspicious JWT validation failures.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Kegagalan verifikasi token WebSocket kini dilog melalui
        logger.warn dengan error name/message.

#28 CORS Missing Access-Control-Allow-Credentials
    Fail: server/http/cors.ts (baris 101-129)
    Isu:  Tiada Access-Control-Allow-Credentials header, tiada
          Access-Control-Max-Age (preflight caching).
    Cadangan: Tambah headers yang hilang.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        CORS kini menghantar Access-Control-Allow-Credentials dan
        Access-Control-Max-Age untuk origin yang dibenarkan.

#29 Missing Source Map Config untuk Staging
    Fail: vite.config.ts (baris 35)
    Isu:  sourcemap: false global. Tiada config berbeza untuk staging
          vs production.
    Cadangan: Tambah environment-aware source maps.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Vite kini mengaktifkan sourcemap secara environment-aware
        melalui VITE_ENABLE_SOURCEMAPS/DEPLOY_ENV/APP_ENV=staging.

#30 Chunk Size Warning Limit Terlalu Tinggi
    Fail: vite.config.ts (baris 36)
    Isu:  chunkSizeWarningLimit: 1200 (1200 KB) — default ialah 500 KB.
    Cadangan: Kurangkan kepada 600 KB dan optimumkan chunk splitting.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        chunkSizeWarningLimit kini 600 KB dan chunk splitting manual
        telah dioptimumkan untuk framework/query/charts/pdf/excel/capture.

#31 Nginx Config Tiada HTTPS/SSL
    Fail: deploy/nginx/sqr.conf.example
    Isu:  Tiada HTTPS configuration, tiada security headers dari Nginx,
          tiada rate limiting di peringkat Nginx.
    Cadangan: Tambah SSL config dan security headers.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        deploy/nginx/sqr.conf.example kini ada redirect HTTP -> HTTPS,
        SSL/TLS config, HSTS, security headers, rate limiting untuk
        login/API, dan connection limiting untuk API/WS/app traffic.

#32 100vh vs 100dvh pada Mobile
    Fail: Pelbagai — AIConversationCard.tsx, BackupList.tsx, dll.
    Isu:  100vh tidak mengambil kira UI browser mobile. Menyebabkan
          overflow dan kandungan tersembunyi.
    Cadangan: Guna 100dvh dengan @supports fallback.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Scan semasa pada client/src tiada lagi penggunaan 100vh mentah.
        Viewport mobile kini menggunakan 100svh/100dvh dengan @supports
        fallback dan safe-area aware layouts pada dialog/panel utama.

#33 console.error dalam Production Code
    Fail: useActivityFeedState.ts, useAuditLogsDataState.ts, 10+ fail lain
    Isu:  console.error boleh dedahkan maklumat sensitif dan cipta
          log noise.
    Cadangan: Guna error tracking service atau buang log tak kritikal.
    >>> STATUS: ✅ DIPERBAIKI (Audit 3, 2026-04-09)
        Logging client kini dipusatkan di client-logger.ts dan hanya aktif
        dalam DEV atau apabila VITE_CLIENT_DEBUG=1. Log mentah yang sensitif
        telah dibuang atau diganti dengan laluan logging terkawal.

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
    >>> STATUS: ✅ DIPERBAIKI (Kemaskini semula, 2026-04-10)
        Semakan sintaks semasa pada server/client/shared .ts/.tsx tidak lagi
        menemukan penggunaan type any, as any, @ts-ignore, atau
        @ts-expect-error.
        Padanan perkataan "any" yang masih wujud dalam scan luas kini hanya
        datang daripada mesej UI/log dan komen naratif, bukan typing code.
        Repo hygiene check kini juga menolak regresi baharu untuk as any,
        @ts-ignore, @ts-expect-error, dan explicit any patterns dalam fail
        TypeScript yang ditrack git, jadi pembaikan ini dikunci dalam CI.
        Kemaskini 2026-04-10: harness
        server/services/tests/backup-operations.service.test.ts kini
        dibersihkan daripada as any pada service injection dan success-body
        assertions; baki debt mengecil lagi kepada test doubles lama lain.
        Kemaskini 2026-04-10 (sambungan): server/services/tests/
        audit-log-operations.service.test.ts juga kini typed melalui
        constructor contracts tanpa as any.
        Kemaskini 2026-04-10 (cache tests): client cache tests untuk
        collection summary, month dialog, dan records query kini guna
        helper row typed minimum tanpa as any.
        Kemaskini 2026-04-10 (state/cache tests): backup-state-utils.test.ts
        dan collection-daily-cache.test.ts juga kini typed tanpa as any.
        Kemaskini 2026-04-10 (receipt/token tests): receipt-preview-utils
        dan collection-daily-hooks-utils kini guna helper typed minimum
        tanpa as any; auth-account-token-utils pula kini menerima dan
        menormalisasi timestamp string secara typed, lalu test util itu
        juga dibersihkan tanpa as any.
        Kemaskini 2026-04-10 (AI search tests): ai-search-compute-utils.test.ts
        kini guna storage mocks, semantic rows, branch lookup doubles,
        dan payload assertions yang typed tanpa as any; ini menutup lagi
        satu slice server test yang sebelum ini masih longgar.
        Kemaskini 2026-04-10 (managed account tests): auth-account-managed-
        operations.test.ts kini memakai superuser/managed-user fixtures serta
        storage mocks yang typed penuh tanpa as any, sambil kekal lulus
        pada targeted test, typecheck, dan build.
        Kemaskini 2026-04-10 (receipt multipart typing): MultipartCollectionPayload
        kini memodelkan uploadedReceipts sebagai input longgar sebenar, dan
        collection-record-mutation-helpers.test.ts dibersihkan daripada as any
        sambil kekal lulus pada targeted test, typecheck, dan build.
        Kemaskini 2026-04-10 (service test cleanup lanjutan): collection-daily-
        record.service.test.ts, auth-account.service.test.ts, ai-chat-utils.test.ts,
        ai-chat.service.test.ts, collection-nickname.service.test.ts, dan
        backup-operations-integrity-utils.test.ts kini juga typed tanpa as any
        pada harness utama, dan repo kekal lulus pada targeted tests, typecheck,
        serta build.
        Kemaskini 2026-04-10 (ws/internal cleanup): runtime-manager.test.ts,
        settings-bootstrap-utils.test.ts, core-schema-bootstrap-utils.test.ts,
        runtime-monitor-sync-state.test.ts, runtime-monitor-circuit-runtime.test.ts,
        dan idle-session-sweeper.test.ts kini juga dibersihkan daripada as any.
        Kemaskini 2026-04-10 (collection repository typing): collection-
        repository-mappers.ts, collection-record-query-utils.ts,
        collection-record-read-utils.ts, collection-admin-assignment-utils.ts,
        backupMetadata.ts, dan backups-repository-types.ts kini juga
        dipindahkan kepada unknown-based row typing tanpa explicit any,
        sambil kekal lulus pada targeted tests dan typecheck.
        Kemaskini 2026-04-10 (final typing pass): collection-daily-
        repository-utils.ts, collection-repository-admin-operations.ts,
        activity-repository-shared.ts, auth-managed-user-read-utils.ts,
        collection-record-mutation-repository-utils.ts, imports.repository.ts,
        bootstrap/internal helpers, db-pool-monitor.ts, auth.routes.integration
        test stubs, schema-postgres.ts, serta xlsx export typings kini turut
        dibersihkan. Repo kekal lulus pada targeted tests, typecheck, dan build.
        Scan luas terkini untuk server/client/shared kini hanya memadankan
        perkataan "any" dalam string mesej atau komen, bukan sebagai typing.

#36 Missing Test Coverage Reporting dalam CI
    Fail: .github/workflows/ci.yml (baris 68-98)
    Isu:  Coverage job muat naik artifacts tapi tiada badge/status
          check integration. Tiada kegagalan jika coverage menurun.
    Cadangan: Integrate dengan Codecov atau serupa.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Coverage gate kini enforced dalam CI, artifact kekal dimuat
        naik, dan ringkasan coverage diterbitkan ke GitHub Actions summary.

#37 Missing Test Suites dalam CI
    Fail: .github/workflows/ci.yml
    Isu:  test:repositories, test:ws, test:intelligence wujud tapi
          tidak dipanggil dalam CI.
    Cadangan: Tambah test steps yang hilang.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        CI kini memanggil test:repositories, test:ws, dan
        test:intelligence dalam build-and-test workflow.

#38 Missing Form Loading States
    Fail: useLoginPageState.ts dan form lain
    Isu:  Form tiada loading state semasa submission. Pengguna mungkin
          klik submit berkali-kali.
    Cadangan: Tambah isLoading state dan disabled={isLoading} pada butang.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Login dan public auth forms kini mempunyai loading/disabled
        state serta guard terhadap duplicate submit.

#39 Drizzle Config Tiada DATABASE_URL Support
    Fail: drizzle.config.ts (baris 13-19)
    Isu:  Hanya terima parameter individu (host/port/user/password),
          tiada sokongan untuk DATABASE_URL connection string.
    Cadangan: Tambah sokongan DATABASE_URL.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        drizzle.config.ts kini menyokong DATABASE_URL dan hanya fallback
        ke PG_HOST/PG_PORT/PG_USER/PG_PASSWORD/PG_DATABASE bila perlu.

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
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        CSRF middleware kini melog semua laluan penolakan, menolak
        request tanpa signal yang sah, dan memadankan origin/referrer
        secara lebih ketat melalui normalized allowed origins.

#70 [BAHARU] PII Disimpan Tanpa Enkripsi
    Fail: shared/schema-postgres-collection.ts (baris 18-70)
    Isu:  Collection records menyimpan unencrypted:
            - Nama pelanggan (customerName)
            - Nombor IC (icNumber)
            - Nombor telefon (customerPhone)
            - Nombor akaun (accountNumber)
    Cadangan: Encrypt PII sensitif di peringkat aplikasi atau database.
              Tambah audit logging untuk akses PII.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-10)
        Shadow encrypted fields, blind-index search, protected read
        paths, startup guards, backup/export safeguards, env validation,
        retirement tooling, dan release/smoke rollout contracts kini
        dipagari oleh verify:collection-pii-rollout-contract.

#71 [BAHARU] Missing onUpdate cascade pada Settings FK
    Fail: shared/schema-postgres-settings.ts (baris 22, 38)
    Isu:  systemSettings.categoryId dan settingOptions.settingId
          ada onDelete: "cascade" sahaja, TIADA onUpdate: "cascade".
          Jika parent record dikemaskini, child records tidak dikemaskini.
    Cadangan: Tambah onUpdate: "cascade".
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Settings foreign keys kini menggunakan onDelete: "cascade" dan
        onUpdate: "cascade" pada relationships category dan option.

#72 [BAHARU] Missing Indexes pada Kolum Status
    Fail: shared/schema-postgres-collection.ts (baris 38-70)
    Isu:  Kolum yang kerap ditapis tiada index:
            - receiptValidationStatus (dalam collectionRecords)
            - extractionStatus (dalam collectionRecordReceipts)
            - receiptDate (dalam collectionRecordReceipts)
    Cadangan: Cipta index pada kolum status dan tarikh.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Schema collection kini mempunyai index pada
        receipt_validation_status, extraction_status, dan partial index
        pada receipt_date yang tidak NULL.

#73 [BAHARU] Campuran Data Type untuk Amount
    Fail: shared/schema-postgres-collection.ts (baris 26-83)
    Isu:  Campuran numeric(14,2) (Ringgit) dan bigint (mungkin sen):
            - collectionRecords.amount = numeric(14, 2)
            - collectionRecords.receiptTotalAmount = bigint
            - collectionRecordReceipts.receiptAmount = bigint
          Risiko ralat pengiraan jika unit tidak konsisten.
    Cadangan: Standardkan - guna numeric(14,2) secara konsisten atau
              dokumentasikan unit bigint dengan jelas.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-10)
        Boundary amount kini bukan sekadar didokumenkan, malah
        dipagari oleh verify:collection-amount-contract pada schema
        Drizzle, bootstrap SQL, mapper repository, backup payload,
        server/client API types, dan release/smoke gates.

#74 [BAHARU] imports.isDeleted Tiada .notNull()
    Fail: shared/schema-postgres-core.ts (baris 110)
    Isu:  .default(false) tanpa .notNull() — boleh jadi NULL secara
          tidak sengaja.
    Cadangan: Tambah .notNull().
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        shared/schema-postgres-core.ts kini mendefinisikan imports.isDeleted
        sebagai .default(false).notNull(), dan migration/bootstrap turut
        memaksa kolum sedia ada kepada NOT NULL.

#75 [BAHARU] JSON.stringify/parse Tanpa Had Saiz
    Fail: server/ws/runtime-manager.ts (baris 114-132),
          server/services/ai-search-query-row-utils.ts (baris 95-104)
    Isu:  WebSocket broadcast: JSON.stringify(payload) tanpa had saiz
          boleh block event loop untuk payload besar.
          AI search: JSON.parse(row.jsonDataJsonb) tanpa had saiz
          per-row boleh block event loop jika row mengandungi JSON 10MB+.
    Cadangan: Tambah pengesahan saiz payload sebelum stringify/parse.
              Pertimbangkan Worker thread untuk payload besar.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        WebSocket runtime kini mengehadkan saiz message dan bufferedAmount,
        manakala AI search row parsing mengehadkan saiz jsonDataJsonb
        sebelum JSON.parse dijalankan.

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
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Layer aplikasi kini menggunakan token berpusat seperti
        --z-floating-ai-*, --z-sticky-*, --z-sidebar-*, dan
        --z-public-auth-main untuk stacking order utama.

#77 [BAHARU] Animasi Box-Shadow Menyebabkan Repaint
    Fail: client/src/components/FloatingAI.module.css (baris 69-73)
    Isu:  @keyframes pulseRing menggunakan animasi box-shadow yang
          menyebabkan browser repaint. Tidak seoptimum transform.
    Cadangan: Gantikan box-shadow animation dengan transform: scale()
              dan opacity.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        FloatingAI kini menggunakan pulseOutline berasaskan transform
        dan opacity, bukan animasi box-shadow.

#78 [BAHARU] FloatingAI Panel Melebihi Skrin iPhone
    Fail: client/src/components/FloatingAI.module.css (baris 20)
    Isu:  Panel width: 380px melebihi skrin iPhone 375px.
          Pada skrin kecil, panel boleh terkeluar dari viewport.
    Cadangan: Tambah responsive rule:
              @media (max-width: 375px) {
                width: calc(100vw - 2rem);
              }
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Panel FloatingAI kini clamp kepada viewport melalui min/max/width
        berasaskan calc(100vw - edge-gap), jadi tidak lagi terkeluar
        pada skrin kecil.

#79 [BAHARU] Nav Pill Font Size Terlalu Kecil
    Fail: client/src/components/Navbar.css (baris 37)
    Isu:  .nav-pill guna font-size: 0.85rem (13.6px) — di bawah
          minimum 14px yang disyorkan untuk teks body pada mobile.
    Cadangan: Naikkan kepada minimum 0.875rem (14px).
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Navbar pills kini menggunakan 0.875rem (14px).

#80 [BAHARU] Accent Color Contrast Ratio Rendah
    Fail: client/src/theme-tokens.css (baris 33)
    Isu:  Accent color 214 25% 92% pada background 210 20% 98%
          memberikan contrast ratio ~1.1:1 — SANGAT RENDAH.
          Tidak memenuhi standard WCAG AA (minimum 4.5:1 untuk teks).
    Cadangan: Turunkan lightness accent color untuk kontras yang lebih
              baik, atau gunakan untuk elemen non-kritikal sahaja.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Accent/light surfaces telah digelapkan, dan regression test
        design-token-contrast kini memastikan accent surfaces kekal
        berbeza secara visual daripada parent background.


================================================================================
  BAHAGIAN 4: ISU LOW — CADANGAN PENAMBAHBAIKAN
================================================================================

--- Audit Asal (#41 - #55) ---

#41 Unsafe res: any dalam Error Handler
    Fail: server/routes/collection/collection-route-handler-factories.ts
          (baris 29)
    Isu:  res ditaip sebagai any, melangkau keselamatan jenis Express.
    Cadangan: Guna Response dari Express.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Collection route handler factories kini menggunakan Response
        daripada Express, bukan res: any.

#42 Error Response Format Tidak Konsisten
    Fail: server/routes/collection-receipt.service.ts (baris 125-135)
    Isu:  Error responses kadang ada error.code, kadang hanya message.
    Cadangan: Standardkan format error response.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Collection receipt service kini memulangkan format seragam:
        { ok: false, message, error: { message, code? } }.

#43 WebSocket Broadcast Silent Catch
    Fail: server/ws/runtime-manager.ts (baris 40-46)
    Isu:  WebSocket send errors ditelan tanpa logging.
    Cadangan: Log error sebelum delete.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Runtime broadcast kini melog kegagalan send, mengehadkan saiz
        mesej, dan mengendalikan bufferedAmount/backpressure dengan jelas.

#44 JSON Deep Clone untuk Idempotency
    Fail: server/routes/collection/collection-route-handler-factories.ts
          (baris 73-78)
    Isu:  JSON.parse(JSON.stringify(payload)) untuk setiap request —
          O(n) dan membazir.
    Cadangan: Guna deterministic hash.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Laluan idempotency collection kini menggunakan fingerprint/cache
        yang lebih cekap dan tidak lagi deep-clone payload melalui JSON.

#45 Oversized File — cluster-local.ts (505 baris)
    Fail: server/cluster-local.ts
    Cadangan: Pecah kepada cluster-lifecycle-manager.ts,
              cluster-scaling-engine.ts, cluster-worker-pool.ts.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        cluster-local.ts kini menjadi entrypoint nipis, dan logic
        orchestration master telah dipecahkan ke modul dalaman cluster.

#46 Missing Secret Rotation Documentation
    Fail: server/config/security.ts
    Cadangan: Dokumentasi prosedur rotasi SESSION_SECRET dan
              TWO_FACTOR_ENCRYPTION_KEY.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Runbook rotasi rahsia kini didokumenkan dengan jelas dalam
        docs/SECRET_ROTATION.md.

#47 Permission Matrix Test Guna 50+ 'as any'
    Fail: server/routes/tests/permission-matrix.integration.test.ts
    Cadangan: Cipta test doubles yang betul.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        permission-matrix.integration.test.ts kini menggunakan typed
        harness/test doubles tanpa timbunan 'as any' yang audit asal sebut.

#48 Missing Error Messages pada Form Fields
    Fail: Login form dan form lain
    Cadangan: Tambah validasi peringkat field dengan mesej ralat.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Login, forgot/reset/activate/change password dan public auth
        forms kini mempunyai field-level errors serta aria attributes.

#49 Missing 404 Page
    Fail: App routing
    Cadangan: Tambah catch-all route
              <Route path="*" element={<NotFoundPage />} />
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        App kini mempunyai not-found routing dan halaman 404 yang jelas.

#50 Missing Pagination Loading Indicator
    Cadangan: Tambah loading indicator pada kawalan pagination.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        AppPaginationBar kini menyokong loading state, aria-busy,
        disabled controls, dan copy "Updating …" semasa refresh.

#51 .gitignore Missing Patterns
    Isu:  Hilang *.sql, *.dump, pgdata/, .idea/, *.swp.
    Cadangan: Tambah pattern yang hilang.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        .gitignore kini merangkumi *.sql, *.dump, pgdata/, .idea/,
        *.swp, serta perlindungan .env yang lebih lengkap.

#52 Dark Mode Config Kurang Explicit
    Fail: tailwind.config.ts (baris 4)
    Cadangan: Tukar darkMode: ["class"] -> darkMode: ["selector", ".dark"].
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Tailwind kini menggunakan darkMode: ["selector", ".dark"].

#53 Status Colors Hardcoded
    Fail: tailwind.config.ts (baris 79-82)
    Cadangan: Guna CSS variables untuk konsistensi.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Tailwind status colors kini datang daripada CSS variables
        --status-online/away/busy/offline.

#54 framer-motion Chunk Referenced Tapi Tiada dalam Dependencies
    Fail: vite.config.ts (baris 89)
    Cadangan: Buang jika tidak digunakan, atau tambah dependency.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        vite.config.ts tidak lagi mempunyai manual chunk framer-motion
        yang tidak sepadan dengan dependencies semasa.

#55 Dependency Overrides Tanpa Komen
    Fail: package.json (baris 146-151)
    Cadangan: Tambah komen menjelaskan CVE yang dimaksudkan.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Rasional dependency overrides kini didokumenkan dalam
        docs/DEPENDENCY_SUPPLY_CHAIN.md dan disegerakkan dengan audit gate.

--- Penemuan Baharu Audit 2 (#81 - #89) ---

#81 [BAHARU] Error Boundary Tiada Focus Management
    Fail: client/src/app/AppRouteErrorBoundary.tsx
    Isu:  Selepas error dipaparkan, tiada focus management ke
          container mesej error. Pengguna screen reader mungkin
          tidak sedar ada error berlaku.
    Cadangan: Tambah useEffect untuk focus container error.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        AppRouteErrorBoundary kini memfokuskan container error apabila
        state error dipaparkan.

#82 [BAHARU] localStorage Tiada Quota Management
    Fail: client/src/components/useTheme.ts,
          client/src/app/useSingleTabSession.ts
    Isu:  localStorage digunakan tanpa pengurusan kuota storan.
          Tiada cleanup untuk data sesi lama.
    Cadangan: Tambah semakan kuota dan pembersihan automatik.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Browser storage kini menggunakan helper quota-safe dengan
        cleanup dan fallback untuk useTheme serta single-tab session.

#83 [BAHARU] Print Stylesheet Hardcoded Colors
    Fail: client/src/index.css (baris 18-19)
    Isu:  Print styles guna #fff dan #000 hardcoded berbanding
          CSS variables.
    Cadangan: Guna hsl(var(--background)) dan hsl(var(--foreground)).
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Print stylesheet kini menggunakan token --print-background dan
        --print-foreground berasaskan theme variables.

#84 [BAHARU] Hardcoded Focus Colors dalam Auth CSS
    Fail: client/src/pages/auth/PublicAuthLayout.css (baris 92),
          PublicAuthControls.css
    Isu:  Focus rings guna rgb(255 255 255 / 0.25) hardcoded
          berbanding --ring CSS variable.
    Cadangan: Guna hsl(var(--ring) / 0.3).
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Public auth controls kini menggunakan token focus ring seperti
        --public-auth-focus-ring, --public-auth-primary-ring, dan
        --public-auth-input-focus.

#85 [BAHARU] Line Height Tidak Konsisten
    Fail: Pelbagai fail CSS
    Isu:  7 nilai line-height berbeza dijumpai: 1.2, 1.35, 1.45, 1.5,
          1.6, 1.75, 2.0. Terlalu banyak variasi.
    Cadangan: Standardkan kepada 3-4 nilai sahaja:
              --line-height-tight: 1.2 (headers)
              --line-height-normal: 1.5 (body)
              --line-height-loose: 1.75 (descriptions)
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Line-height utama kini dipusatkan pada --line-height-tight,
        --line-height-normal, dan --line-height-loose.

#86 [BAHARU] Overflow Hidden pada Body Menyekat Shadow/Tooltip
    Fail: client/src/theme-tokens.css (baris 182)
    Isu:  overflow-x: hidden pada body boleh memotong shadow effects,
          tooltips, dan popovers yang melangkaui container bounds.
    Cadangan: Guna overflow-x: clip (CSS Level 4) atau pastikan
              elemen overflow menggunakan portal.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Body kini menggunakan overflow-x: clip.

#87 [BAHARU] Silent WebSocket clearNicknameSession
    Fail: server/ws/runtime-manager.ts (baris 92)
    Isu:  clearNicknameSession() catch block menelan semua error:
          .catch(() => undefined) — tanpa logging.
    Cadangan: Tukar kepada .catch(err => logger.debug(...)).
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        clearNicknameSession kini log warning apabila cleanup gagal.

#88 [BAHARU] Backup Restore: Temp Table Tanpa Chunking
    Fail: server/repositories/backups-restore-collection-datasets-utils.ts
          (baris 146-154)
    Isu:  Bulk INSERT ke temp table menggunakan sql.join() tanpa
          chunking. Jika rows sangat besar (1M+ records), SQL string
          boleh menjadi 100+ MB dalam memori.
    Cadangan: Pecahkan INSERT kepada batch 10,000 records.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Restore temp-table insert kini dipecah kepada sub-batch
        RESTORE_INSERT_BATCH_SIZE untuk mengawal saiz SQL string.

#89 [BAHARU] Idempotency Fingerprint JSON Parse Per-Request
    Fail: server/routes/collection/collection-route-handler-factories.ts
          (baris 76-88)
    Isu:  JSON.parse() dipanggil untuk setiap request (max 512 bytes).
          Pada 1000 req/s, ini 1000 JSON parses per saat.
    Cadangan: Pertimbangkan LRU cache untuk hasil parsing, atau
              guna regex validation yang lebih ringan.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Validation cache untuk x-idempotency-fingerprint kini digunakan
        supaya fingerprint berulang tidak diparse semula setiap request.

--- Penemuan Baharu Audit 3 (#90 - #102) ---

#90 [BAHARU] AI Search Timeout Buffer Terlalu Ketat
    Fail: server/services/ai-search.service.ts (baris 108)
    Isu:  Pengiraan timeout AI search hanya menyisakan 1200ms buffer
          untuk pemprosesan selepas configured timeout. Jika Ollama
          response lambat, request mungkin timeout sebelum respons
          diproses sepenuhnya.
    Cadangan: Semak logic timeout dan tambah buffer jika timeout
              sering dicapai dalam production.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        AI search runtime kini meninggalkan buffer pasca-pemprosesan
        yang lebih longgar melalui resolveAiSearchRequestTimeoutMs().

#91 [BAHARU] Missing AbortController dalam useCollectionRecordsData
    Fail: client/src/pages/collection-records/useCollectionRecordsData.ts
          (baris 69-80)
    Isu:  loadNicknames() promise tidak dibatalkan apabila komponen
          unmount. Jika network request lambat, ia masih resolve dan
          cuba kemaskini state yang sudah unmounted.
    Cadangan: Tambah AbortController sokongan pada loadNicknames()
              atau wrap .then() dengan mounted check.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        useCollectionRecordsData kini membatalkan request async melalui
        AbortController.

#92 [BAHARU] Promise Chain Tanpa .catch() dalam useCollectionRecordsData
    Fail: client/src/pages/collection-records/useCollectionRecordsData.ts
          (baris 69)
    Isu:  loadNicknames().then(...) tiada .catch() handler. Jika
          promise ditolak, ia menjadi unhandled rejection.
    Cadangan: Tambah error handling:
              void loadNicknames()
                .then((options) => { /* ... */ })
                .catch((error) => console.error("Gagal load nicknames:", error));
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Promise chain kini mempunyai error handling yang jelas.

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
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        useCollectionRecordsData kini mengelak state update selepas
        unmount melalui mounted/abort guards.

#94 [BAHARU] Event Listener Accumulation dalam useFloatingAILayoutState
    Fail: client/src/components/useFloatingAILayoutState.ts
    Isu:  Pelbagai listener (focusin, focusout, resize, scroll)
          didaftarkan tanpa pengesahan cleanup sebelumnya. Jika
          effect re-run tanpa complete cleanup, listener boleh
          terkumpul dan menyebabkan memory leak.
    Cadangan: Simpan listener references dalam refs dan pastikan
              cleanup berlaku tanpa mengira keadaan.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        useFloatingAILayoutState kini membersihkan listener, observer,
        dan sync hooks dengan lebih defensif.

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
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Home cards kini mempunyai focus-visible outline yang jelas.

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
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        will-change kini ditambah pada permukaan blur/animasi utama di
        Login dan Navbar untuk mengurangkan first-frame jank.

#97 [BAHARU] Content-Visibility CLS Risk pada Landing Page
    Fail: client/src/pages/Landing.css (baris 184-207)
    Isu:  .landing-deferred-section guna content-visibility: auto
          dengan contain-intrinsic-size tetapi nilai adalah anggaran
          kasar (auto 720px, 980px, 680px). Jika kandungan sebenar
          jauh lebih besar, akan menyebabkan Cumulative Layout Shift.
    Cadangan: Kira saiz intrinsik sebenar atau guna JavaScript
              ResizeObserver untuk capture actual heights.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Landing deferred sections tidak lagi bergantung pada
        content-visibility dan contain-intrinsic-size anggaran kasar.

#98 [BAHARU] Contrast Ratio Rendah untuk Public Auth Text
    Fail: client/src/theme-tokens.css (baris 68-70)
    Isu:  --public-auth-text-soft: hsl(0 0% 100% / 0.75) (75% opacity
          putih) pada latar belakang gradient gelap mungkin gagal
          memenuhi WCAG AA contrast requirements. Bermasalah pada
          monitor dengan kalibrasi lebih cerah.
    Cadangan: Uji contrast ratios dengan warna latar sebenar.
              Pertimbangkan hsl(0 0% 100% / 0.85) atau opacity
              lebih tinggi untuk teks body.
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Public auth text tokens telah ditingkatkan kepada opacity yang
        lebih selamat, dan regression test contrast kini mengesahkan
        pasangan text/surface public-auth memenuhi WCAG AA.

#99 [BAHARU] Query Stale Time Terlalu Agresif
    Fail: client/src/lib/queryClient.ts (baris 18-19)
    Isu:  Stale time hanya 10-30 saat. High-frequency queries mungkin
          menyebabkan refetch berlebihan dan beban rangkaian tambahan.
    Cadangan: Laraskan berdasarkan keperluan data freshness:
              - Senarai pengguna/roles: 60-120 saat (jarang berubah)
              - Analytics: 30 saat (kadar perubahan sederhana)
              - Aktiviti langsung: 5-10 saat (kerap berubah)
    >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
        Query client kini membezakan staleTime mengikut keluarga query:
        live, analytics, static, dan default.

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
     >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
         Receipt preview kini menggunakan satu kelas CSS asas dengan
         custom property --receipt-preview-zoom, dan nilai zoom
         disalurkan terus dari util/dialog tanpa 26 selector berulang.

#101 [BAHARU] Missing prefers-reduced-motion untuk Welcome Animation
     Fail: client/src/pages/Home.css (baris 1-24)
     Isu:  .welcome-pop animation tiada @media (prefers-reduced-motion)
           rule. Pengguna dengan gangguan vestibular akan mengalami
           animasi pop yang berpotensi mengganggu.
     Cadangan: Tambah:
               @media (prefers-reduced-motion: reduce) {
                 .welcome-pop { animation: none !important; }
               }
     >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
         Welcome animation kini menghormati prefers-reduced-motion.

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
     >>> STATUS: ✅ DIPERBAIKI (Pasca pembetulan, 2026-04-09)
         Safe area inset kini dipusatkan sebagai token dan digunakan
         secara konsisten pada FloatingAI dan Viewer footer/mobile
         surfaces utama.


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
     - Rejection paths kini dilog dengan reason yang jelas.
     STATUS: BAIK

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
     STATUS: BAIK

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
     - Temp table restore inserts kini dibatch.
     ISU: Restore masih ada unbounded Set<string> untuk record IDs.

A.9) Input Validation
     - Zod schema validation dengan error details.
     - String length limits (max 2048 chars default).
     - Integer clamping, date parsing, list parsing.
     STATUS: BAIK

A.10) Logging
     - Pino structured logging — tiada console.log dalam production.
     - Sensitive field redaction untuk password, token, email.
     - Redaction untuk medan PII sensitif telah ditambah.
     STATUS: BAIK


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
     - WebSocket session auth (session-auth.ts:20-22) (#27)
     - safeSelectRows hides "relation not exist" errors
     CADANGAN: Tambah logging pada semua.


C) DATABASE
-----------

C.1) Schema
     - Drizzle ORM dengan PostgreSQL.
     - Rollup tables sudah ada composite PKs (DIPERBAIKI).
     - N+1 day insert sudah dibatch via sql.join (DIPERBAIKI).
     ISU: Missing cascade deletes yang masih berbaki (#24)
     STATUS: BAIK (status/date indexes utama kini telah ditambah)
     CATATAN: Boundary amount kini dipagari oleh governance check
              automatik supaya unit MYR vs cents kekal konsisten.

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
     - Focus management kini hadir apabila error dipaparkan.
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

B.3) Color Contrast
     - Foreground/background: ~15:1 contrast (WCAG AAA)
     - Muted foreground: ~8.2:1 contrast (WCAG AAA)
     - Accent surfaces dan public auth text telah dikemas dengan
       regression tests tambahan.
     STATUS: BAIK

B.4) Responsive Design
     - 480+ responsive breakpoint instances (sm:, md:, lg:, xl:).
     STATUS: BAIK (viewport mobile kini guna 100svh/100dvh patterns)
     ISU: Form loading states (#38)

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
     - Shadow tokens dan warna audit utama telah dipusatkan ke theme
       variables.
     STATUS: BAIK

C.3) Z-Index Management
     - Layer aplikasi utama kini menggunakan z-index tokens berpusat.
     STATUS: BAIK

C.4) Mobile Viewport
     - 100dvh with @supports fallback dalam index.css (BAIK).
     STATUS: BAIK (fallback 100svh/100dvh telah diseragamkan)

C.5) Typography
     - System fonts sahaja (tiada web fonts — elak CLS).
     - Nav pill minimum 14px dan line-height kini dipusatkan melalui
       token utama.
     STATUS: BAIK

C.6) Touch Targets
     ISU: Button sizes di bawah 44px minimum (#64)

C.7) Animations
     - prefers-reduced-motion properly implemented.
     - Kebanyakan animasi guna transform (BAIK).
     STATUS: BAIK

C.8) Print Styles
     - Print palette kini menggunakan print tokens.
     STATUS: BAIK


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
    - Override rationale kini didokumenkan dalam DEPENDENCY_SUPPLY_CHAIN.md.
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
    STATUS: BAIK (template Nginx production kini ada HTTPS/security/rate limits)
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
     - Runtime broadcast kini mengehadkan message size dan bufferedAmount.
     - Broadcast failures kini turut dilog dengan jelas.
     STATUS: BAIK


B) MEMORY MANAGEMENT

B.1) Rate Limit State
     STATUS: BAIK

B.2) Tab Visibility Cache
     ISU: Map tanpa TTL enforcement atau had saiz (#23)

B.3) Backup Restore
     ISU: Unbounded Set<string> untuk collection record IDs

B.4) Payload Processing
     STATUS: BAIK (had saiz kini digunakan pada payload runtime/AI)


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
| Test Coverage                             | Good     | 312+ fail ujian, CI coverage gate|
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
  1. [DIPERBAIKI] WebSocket CSRF vulnerability (#1)
  2. [DIPERBAIKI] 2FA secret fallback (#2)
  3. [DIPERBAIKI] .env.example default secrets (#3, #4) ✅
  4. [DIPERBAIKI] WebSocket connection limit (#8)
  5. [DIPERBAIKI] Rate limit Map leak — daftarkan sweep interval (#56)
  6. [DIPERBAIKI] WebSocket reconnect race condition (#57)
  7. [DIPERBAIKI] Shadow opacity 0% — UI depth hilang sepenuhnya (#58)
  8. [DIPERBAIKI] 13 timestamp tanpa .notNull() (#59)

P1 — SEBELUM PRODUCTION (2 Minggu)
  9.  [DIPERBAIKI] Command injection validation (#9)
  10. [DIPERBAIKI] File upload MIME detection (#10)
  11. [DIPERBAIKI] Path traversal check (#11)
  12. [DIPERBAIKI] Login rate limit fix (#12)
  13. [DIPERBAIKI] CI security scanning (#14, #15)
  14. [DIPERBAIKI] Token storage migration (#17)
  15. [DIPERBAIKI] useEffect cleanup (#18)
  16. [DIPERBAIKI] Timestamps tanpa timezone (#60)
  17. [DIPERBAIKI] IP spoofing rate limit (#61)
  18. [DIPERBAIKI] Heartbeat ws.readyState check (#62)
  19. [DIPERBAIKI] Touch targets minimum 44px (#64)
  20. [DIPERBAIKI] Hardcoded colors -> CSS variables (#65)
  21. [DIPERBAIKI] PII logger redaction (#68)
  22. [DIPERBAIKI] Backdrop filter performance — tambah will-change (#96)

P2 — PENAMBAHBAIKAN BERTERUSAN (Bulan Ini)
  23. [DIPERBAIKI] React key anti-pattern (#5, #7)
  24. [DIPERBAIKI] Type safety improvements (#6, #35)
  25. [DIPERBAIKI] TypeScript strictness options (#34) ✅
  26. [DIPERBAIKI] Pagination limits (#25)
  27. [DIPERBAIKI] Form loading states (#38)
  28. [DIPERBAIKI] Mobile viewport (#32)
  29. [DIPERBAIKI] Missing tests dalam CI (#37)
  30. [DIPERBAIKI] PII encryption at rest (#70)
  31. [DIPERBAIKI] Missing FK onUpdate cascade (#71)
  32. [DIPERBAIKI] Missing indexes pada kolum status (#72)
  33. [DIPERBAIKI] Amount data type standardization (#73)
  34. [DIPERBAIKI] JSON parse/stringify size limits (#75)
  35. [DIPERBAIKI] Z-index centralization (#76)
  36. [DIPERBAIKI] Unmounted state update + missing .catch() (#91, #92, #93)
  37. [DIPERBAIKI] Event listener cleanup (#94)
  38. [DIPERBAIKI] Missing :focus-visible pada Home cards (#95)
  39. [DIPERBAIKI] Content-visibility CLS risk (#97)
  40. [DIPERBAIKI] Auth text contrast ratio (#98)

P3 — NICE TO HAVE
  41. [DIPERBAIKI] Error format standardization (#42)
  42. [DIPERBAIKI] Documentation improvements (#46, #51)
  43. [DIPERBAIKI] Config improvements (#39, #52-55)
  44. [DIPERBAIKI] Missing @types packages (#40) ✅
  45. [DIPERBAIKI] FloatingAI panel responsive fix (#78)
  46. [DIPERBAIKI] Nav pill font size (#79)
  47. [DIPERBAIKI] Error boundary focus management (#81)
  48. [DIPERBAIKI] Line height standardization (#85)
  49. [DIPERBAIKI] Backup restore chunking (#88)
  50. [DIPERBAIKI] AI search timeout buffer (#90)
  51. [DIPERBAIKI] Query stale time tuning (#99)
  52. [DIPERBAIKI] Receipt zoom CSS duplication (#100)
  53. [DIPERBAIKI] Missing reduced-motion welcome-pop (#101)
  54. [DIPERBAIKI] Safe area inset consistency (#102)


================================================================================
  BAHAGIAN 11: STATISTIK CODEBASE
================================================================================

Jumlah fail sumber (*.ts, *.tsx):          ~711+ fail
Jumlah fail ujian (*.test.ts, *.test.tsx): 312+ fail
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
  Audit susulan 5 (2026-04-10): +13 penemuan ringkas tidak bernombor
  Audit 6 (2026-04-10): +15 penemuan baharu (N1-N15), tersusun untuk Codex
  Status item bernombor (#1-#102): 102 item DIPERBAIKI, 0 item terbuka.
  Status audit susulan (H1-L6): 15 item DIPERBAIKI, 0 item terbuka.
  Status audit keenam (N1-N15): 0 item DIPERBAIKI, 15 item TERBUKA.
  Nota: angka audit di atas ialah snapshot sejarah. Pembetulan pasca audit
        tambahan dirujuk melalui penanda STATUS pada item berkaitan.


================================================================================
  BAHAGIAN 12: ISU BAHARU AUDIT KEENAM — SENARAI TINDAKAN CODEX
  Tarikh: 10/04/2026
  Tujuan: Senarai tersusun untuk disalin terus kepada Codex/AI agent
================================================================================

Nota penggunaan:
  Setiap item di bawah adalah arahan kendiri yang boleh disalin terus ke
  Codex sebagai prompt. Salin item satu per satu atau ikut keutamaan.
  Format: [ID] Tajuk — Keterangan — Fail & baris — Arahan pembetulan.

----------------------------------------------------------------------
  KEUTAMAAN TINGGI (Perlu diperbaiki segera)
----------------------------------------------------------------------

N1  [TINGGI] Z-Index Conflict: Floating AI & Modal Sama Nilai
    Fail:  client/src/theme-tokens.css
    Isu:   --z-floating-ai-overlay: 60 dan --z-modal-content: 60
           berkongsi nilai yang sama. Jika AI floating panel terbuka
           dan modal dialog muncul serentak, kedua-duanya bertindih
           tanpa susunan yang jelas. UI rosak.
    >>> ARAHAN CODEX:
        Buka client/src/theme-tokens.css, cari --z-floating-ai-overlay.
        Tukar nilainya kepada 55 supaya modal (60) sentiasa di atas
        floating AI. Ini adalah cadangan utama kerana modal dialog
        biasanya memerlukan fokus pengguna dan perlu menghalang semua
        elemen lain termasuk floating AI.
        Pastikan --z-modal-content kekal 60.
    >>> STATUS: ⬜ BELUM DIPERBAIKI

N2  [TINGGI] Activity Logs Tanpa Virtualization — Prestasi Lambat
    Fail:  client/src/pages/activity/ActivityMobileLogsList.tsx (baris 60)
           client/src/pages/activity/ActivityDesktopLogsTable.tsx (baris 29)
    Isu:   Kedua-dua senarai aktiviti render SEMUA item melalui .map()
           tanpa virtualization. Jika ada 500+ log entry, DOM menjadi
           sangat berat dan skrol menjadi laggy.
           Viewer sudah guna react-window (ViewerVirtualizedTable.tsx)
           tetapi activity lists tidak.
    >>> ARAHAN CODEX:
        1. Import FixedSizeList dari react-window (sudah ada dalam deps).
        2. Dalam ActivityMobileLogsList.tsx, ganti activities.map() dengan
           FixedSizeList yang render setiap item melalui row renderer.
        3. Dalam ActivityDesktopLogsTable.tsx, buat perkara yang sama.
        4. Refer ViewerVirtualizedTable.tsx sebagai contoh pattern.
        5. Pastikan empty state dan loading state tetap berfungsi.
    >>> STATUS: ⬜ BELUM DIPERBAIKI

N3  [TINGGI] Maintenance.tsx Polling Tanpa Visibility Check
    Fail:  client/src/pages/Maintenance.tsx (baris 82)
    Isu:   setInterval(load, 15_000) berjalan terus walaupun pengguna
           sudah berpindah ke tab lain. Membazir CPU, bateri, dan
           network bandwidth pada peranti mudah alih.
    >>> ARAHAN CODEX:
        Buka client/src/pages/Maintenance.tsx. Dalam useEffect yang ada
        setInterval, tambah document.visibilitychange listener:
          - Apabila document.hidden === true, clearInterval poll.
          - Apabila document.hidden === false, jalankan load() serta merta
            dan mulakan semula setInterval.
          - Pastikan cleanup function dalam useEffect membersihkan
            KEDUA-DUA interval DAN visibilitychange listener.
    >>> STATUS: ⬜ BELUM DIPERBAIKI

----------------------------------------------------------------------
  KEUTAMAAN SEDERHANA (Perlu diperbaiki dalam 2-4 minggu)
----------------------------------------------------------------------

N4  [SEDERHANA] Idempotency Cache LRU Hanya Buang Satu Entry
    Fail:  server/routes/collection/collection-route-handler-factories.ts
           (baris 28-100)
    Isu:   idempotencyFingerprintValidationCache Map mempunyai had 256
           entry, tetapi apabila had dicapai, hanya SATU entry dibuang
           per insertion. Selain itu, setiap cache hit delete+re-insert
           untuk kekalkan insertion order (LRU). Pada beban tinggi, ini
           menyebabkan Map thrashing yang tidak perlu.
    >>> ARAHAN CODEX:
        1. Apabila had dicapai, buang 10% entry tertua sekaligus
           (bukan satu per satu):
             const excess = cache.size - limit + Math.floor(limit * 0.1);
             const iter = cache.keys();
             for (let i = 0; i < excess; i++) cache.delete(iter.next().value);
        2. Pada cache hit, hanya delete+re-insert jika entry masih valid.
           Jika sudah expired, buang sahaja.
    >>> STATUS: ⬜ BELUM DIPERBAIKI

N5  [SEDERHANA] Tab Visibility Cache Delete+Re-insert Setiap Akses
    Fail:  server/auth/guards.ts (baris 78-91)
    Isu:   tabVisibilityCache delete+re-insert pada SETIAP akses untuk
           kekalkan Map insertion order sebagai LRU. Walaupun had saiz
           100 entry munasabah, pattern ini mencipta unnecessary churn
           pada Map internals.
    >>> ARAHAN CODEX:
        Guna cachedAt timestamp untuk determine LRU position tanpa
        delete+re-insert. Apabila eviction diperlukan, scan Map untuk
        entry dengan cachedAt paling lama dan buang entry itu.
        Alternatif: pertimbangkan package lru-cache jika dependency
        baharu dibenarkan.
    >>> STATUS: ⬜ BELUM DIPERBAIKI

N6  [SEDERHANA] Silent chmod Catch dalam Backup Payload
    Fail:  server/repositories/backups-payload-utils.ts (baris 250)
    Isu:   await fs.chmod(tempDirPath, 0o700).catch(() => {}) menelan
           SEMUA error tanpa logging. Jika permission gagal ditetapkan,
           tiada visibility — backup temp directory mungkin terdedah.
    >>> ARAHAN CODEX:
        Tukar .catch(() => {}) kepada:
          .catch((error) => {
            logger.warn({ err: error, tempDirPath },
              "Failed to set backup temp directory permissions");
          })
        Import logger dari server/lib/logger.ts jika belum ada.
    >>> STATUS: ⬜ BELUM DIPERBAIKI

N7  [SEDERHANA] Multipart Route void fail(error) Fire-and-Forget
    Fail:  server/routes/collection/collection-multipart-receipt-route.ts
           (baris 85)
    Isu:   parser.once("error") menggunakan void fail(error) yang
           fire-and-forget. Jika fail() cleanup gagal (contoh: disk
           penuh semasa cleanup temp files), error hilang senyap.
    >>> ARAHAN CODEX:
        Tukar void fail(error) kepada:
          fail(error).catch((cleanupErr) => {
            logger.error({ err: cleanupErr, originalError: error },
              "Multipart cleanup failed after parser error");
          });
    >>> STATUS: ⬜ BELUM DIPERBAIKI

N8  [SEDERHANA] Color Contrast Mungkin Tidak Memenuhi WCAG AA
    Fail:  client/src/theme-tokens.css (baris 29, baris ~384)
    Isu:   --muted-foreground: 215 18% 38% pada background 210 20% 98%
           memberikan contrast ratio ~5.2:1 (LULUS AA untuk teks besar
           tetapi perlu disahkan untuk teks kecil). Dalam dark mode,
           --destructive: 0 62% 30% mungkin terlalu gelap pada
           background gelap.
    >>> ARAHAN CODEX:
        1. Gunakan tool contrast checker untuk verify:
           - --muted-foreground vs --background (light mode)
           - --destructive vs --background (dark mode)
        2. Jika contrast < 4.5:1 untuk teks normal:
           - Light: Tukar --muted-foreground ke 215 18% 35% (lebih gelap)
           - Dark: Tukar --destructive ke 0 62% 40% (lebih cerah)
        3. Tambah regression test jika design-token-color-compatibility
           belum cover contrast pasangan ini.
    >>> STATUS: ⬜ BELUM DIPERBAIKI

N9  [SEDERHANA] Dialog Close Button Tiada aria-label
    Fail:  client/src/components/ui/dialog.tsx (baris 47)
    Isu:   Close button hanya ada <span className="sr-only">Close</span>
           tetapi tiada aria-label pada button element sendiri.
           Sesetengah screen reader mungkin tidak membaca sr-only span
           dalam konteks button.
    >>> ARAHAN CODEX:
        Tambah aria-label="Close" pada DialogPrimitive.Close:
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute right-4 top-4 ...">
    >>> STATUS: ⬜ BELUM DIPERBAIKI

N10 [SEDERHANA] MonitorPageSections.tsx Terlalu Besar (485 baris)
    Fail:  client/src/pages/monitor/MonitorPageSections.tsx (485 baris)
    Isu:   Fail ini melebihi 400 baris dan mengandungi banyak
           section components yang boleh dipecahkan. Maintenance lebih
           sukar apabila semua sections dalam satu fail.
    >>> ARAHAN CODEX:
        Pecahkan MonitorPageSections.tsx kepada fail berasingan:
          - MonitorAlertSection.tsx
          - MonitorMetricsSection.tsx (jika belum wujud)
          - MonitorSystemSection.tsx
          - MonitorDatabaseSection.tsx
        MonitorPageSections.tsx kekal sebagai barrel export yang
        import dan re-export semua sections. Pastikan lazy() imports
        tetap berfungsi.
    >>> STATUS: ⬜ BELUM DIPERBAIKI

N11 [SEDERHANA] 40 Direct process.env Access Dalam Server Code
    Fail:  Pelbagai fail dalam server/ (40 instances)
    Isu:   Walaupun ada Zod-validated runtime-env-schema.ts, masih ada
           40 akses langsung process.env.* yang tersebar dalam server
           code (contoh: process.env.AI_DEBUG, process.env.DEBUG_LOGS).
           Ini bypass validation dan boleh gagal senyap jika env var
           tiada.
    >>> ARAHAN CODEX:
        1. Audit semua process.env.* dalam server/ (bukan test):
             grep -rn "process\.env\." server/ --include="*.ts" |
               grep -v test | grep -v node_modules
        2. Untuk setiap occurrence, pindahkan ke:
           - server/config/runtime-env-schema.ts (tambah ke Zod schema)
           - ATAU server/config/ module yang import schema
        3. Ganti process.env.AI_DEBUG === "1" dengan
           runtimeConfig.ai.debugEnabled (contoh).
        4. Pastikan semua tests masih lulus selepas perubahan.
    >>> STATUS: ⬜ BELUM DIPERBAIKI

N12 [SEDERHANA] Checkbox Touch Target Terlalu Kecil (16px)
    Fail:  client/src/components/ui/checkbox.tsx (baris 14)
    Isu:   Checkbox menggunakan h-4 w-4 (16x16px), jauh di bawah
           minimum 44x44px untuk mobile. Walaupun label biasanya
           memperbesar hit area, checkbox sahaja tanpa label masih
           boleh disentuh secara langsung.
    >>> ARAHAN CODEX:
        Tambah wrapper padding untuk memperbesar hit area TANPA
        mengubah visual checkbox:
          <CheckboxPrimitive.Root
            className="peer h-4 w-4 ... touch-target"
            ...
          />
        Dalam index.css atau komponen, tambah:
          .touch-target {
            position: relative;
          }
          .touch-target::before {
            content: "";
            position: absolute;
            inset: -14px;  /* 16px + 14px*2 = 44px */
            border-radius: inherit;
          }
        Atau guna Tailwind: tambah p-3.5 pada parent label.
    >>> STATUS: ⬜ BELUM DIPERBAIKI

----------------------------------------------------------------------
  KEUTAMAAN RENDAH (Penambahbaikan berkualiti)
----------------------------------------------------------------------

N13 [RENDAH] console.warn Dalam Client Production Code
    Fail:  client/src/app/useAuthenticatedAppState.ts (baris 115)
           client/src/app/useAppShellState.ts (baris 91)
    Isu:   2 instances console.warn() masih wujud. Client-logger.ts
           sudah ada — semua client logging patut guna wrapper itu.
    >>> ARAHAN CODEX:
        Ganti console.warn(message, error) dengan:
          import { logClientWarning } from "@/lib/client-logger";
          logClientWarning(message, error);
        Jika logClientWarning belum wujud dalam client-logger.ts,
        tambah wrapper ringkas yang hanya log bila DEV atau
        VITE_CLIENT_DEBUG=1.
    >>> STATUS: ⬜ BELUM DIPERBAIKI

N14 [RENDAH] ARCHITECTURE.md Hanya 107 Baris — Perlu Dilengkapkan
    Fail:  ARCHITECTURE.md (107 baris)
    Isu:   Dokumentasi architecture terlalu ringkas. Tiada:
           - Diagram aliran API (request flow)
           - Penerangan database schema
           - Penerangan authentication flow
           - Penerangan WebSocket lifecycle
    >>> ARAHAN CODEX:
        Tambah bahagian berikut ke ARCHITECTURE.md:
        1. ## Request Flow
           routes → controllers → services → repositories → database
           Dengan penerangan ringkas setiap lapisan.
        2. ## Database Schema
           Penerangan jadual utama dan hubungan.
        3. ## Authentication Flow
           Login → JWT → Session Cookie → Token Rotation.
        4. ## WebSocket Architecture
           Connection → Auth → Heartbeat → Broadcast → Cleanup.
        5. ## CI/CD Pipeline
           Penerangan workflow dan gates.
        Sasaran: 250-300 baris minimum.
    >>> STATUS: ⬜ BELUM DIPERBAIKI

N15 [RENDAH] Input Height h-9 Tiada Mobile Override
    Fail:  client/src/components/ui/input.tsx (baris 12)
    Isu:   Input menggunakan h-9 (36px) secara global. Pada mobile,
           minimum 44px disyorkan untuk touch target. Button sudah ada
           min-h-11 pada mobile tetapi input tidak.
    >>> ARAHAN CODEX:
        Tukar className input daripada:
          "flex h-9 w-full ..."
        kepada:
          "flex min-h-11 w-full sm:min-h-9 ..."
        Ini memastikan input 44px pada mobile dan 36px pada desktop.
        Pastikan semua form layouts masih alignment selepas perubahan.
    >>> STATUS: ⬜ BELUM DIPERBAIKI


================================================================================
  RINGKASAN SENARAI CODEX (Audit Keenam)
================================================================================

+-----+------+------------------------------------------+------------------------+
| ID  | Tahap| Tajuk Ringkas                            | Fail Utama             |
+-----+------+------------------------------------------+------------------------+
| N1  | 🔴  | Z-index floating AI = modal conflict     | theme-tokens.css       |
| N2  | 🔴  | Activity lists tanpa virtualization       | ActivityMobile/Desktop |
| N3  | 🔴  | Maintenance polling tanpa visibility      | Maintenance.tsx         |
| N4  | 🟡  | Idempotency cache LRU satu entry         | collection-route-*.ts   |
| N5  | 🟡  | Tab visibility cache churn               | guards.ts              |
| N6  | 🟡  | Silent chmod catch                       | backups-payload-*.ts    |
| N7  | 🟡  | Multipart void fail fire-and-forget      | collection-multipart-*  |
| N8  | 🟡  | Color contrast WCAG AA                   | theme-tokens.css       |
| N9  | 🟡  | Dialog close tiada aria-label            | dialog.tsx             |
| N10 | 🟡  | MonitorPageSections 485 baris            | MonitorPageSections.tsx |
| N11 | 🟡  | 40 direct process.env access             | Pelbagai server/       |
| N12 | 🟡  | Checkbox 16px touch target               | checkbox.tsx           |
| N13 | 🟢  | console.warn dalam client production     | useAuth*AppState.ts    |
| N14 | 🟢  | ARCHITECTURE.md terlalu ringkas          | ARCHITECTURE.md        |
| N15 | 🟢  | Input h-9 tanpa mobile override          | input.tsx              |
+-----+------+------------------------------------------+------------------------+

Kunci: 🔴 TINGGI   🟡 SEDERHANA   🟢 RENDAH

Cara guna dengan Codex:
  1. Salin blok N1 hingga N3 (TINGGI) dahulu sebagai prompt Codex.
  2. Selepas siap, salin N4 hingga N12 (SEDERHANA).
  3. Akhir sekali, N13 hingga N15 (RENDAH).
  4. Setiap item boleh dijadikan satu prompt berasingan atau digabung
     mengikut fail/kategori.

Contoh prompt Codex:
  "Fix issue N1 in readme.txt — Z-index conflict between floating AI
   overlay and modal content in client/src/theme-tokens.css. Change
   --z-floating-ai-overlay from 60 to 55."


================================================================================
  KESIMPULAN (Dikemaskini 10/04/2026 — Audit Keenam)
================================================================================

Codebase Sumbangan Query Rahmah (SQR) adalah BERKUALITI TINGGI secara
keseluruhan dengan seni bina yang matang dan amalan keselamatan yang kukuh.

Sejarah audit:
  Audit 1 (07/04/2026): 55 isu asal dikesan
  Audit 2 (08/04/2026): +34 isu baharu = 89 jumlah
  Audit 3 (09/04/2026): +13 isu baharu, 4 diperbaiki = 102 item
  Audit 4 (09/04/2026): Audit menyeluruh, tiada isu kritikal
  Audit 5 (10/04/2026): +15 penemuan susulan (H1-L6)
  Audit 6 (10/04/2026): +15 penemuan baharu (N1-N15) — BAHAGIAN 12

Status semua item audit:
  * #1-#102 (audit asal):     102/102 DIPERBAIKI ✅
  * H1-L6 (audit susulan):    15/15  DIPERBAIKI ✅
  * N1-N15 (audit keenam):    0/15   BELUM DIPERBAIKI ⬜
  * JUMLAH TERBUKA:           15 item (lihat BAHAGIAN 12)

Isu terbuka mengikut keutamaan:
  🔴 TINGGI (3):    N1 Z-index conflict, N2 Virtualization, N3 Polling
  🟡 SEDERHANA (9): N4-N12 (cache, error handling, accessibility, touch)
  🟢 RENDAH (3):    N13-N15 (logging, docs, input height)

Skor kesihatan: 9.0 / 10
  Semua 102+15 isu terdahulu sudah DIPERBAIKI. 15 isu baharu adalah
  penambahbaikan kualiti, bukan blocker production.

Disediakan oleh: AI Full-Stack Engineer Audit
Tarikh Asal: 2026-04-07
Tarikh Kemaskini Kedua: 2026-04-08
Tarikh Kemaskini Ketiga: 2026-04-09
Tarikh Kemaskini Keempat: 09/04/2026
Tarikh Kemaskini Kelima: 10/04/2026
Tarikh Kemaskini Keenam: 10/04/2026

================================================================================
  TAMAT LAPORAN AUDIT
================================================================================

