# Sumbangan Query Rahmah (SQR)

Sumbangan Query Rahmah is a contribution management platform for tracking donations, processing queries, and managing community support initiatives.

## Client User Manual

Untuk manual penggunaan client yang lengkap (split ikut role `superuser`, `admin`, `user`), rujuk:
- [README_CLIENT_MANUAL.md](./README_CLIENT_MANUAL.md)

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL (via Drizzle ORM)
- **Authentication:** JSON Web Tokens (JWT, HS256) with bcrypt passwords
- **AI Integration:** Ollama (llama3 / nomic-embed-text)
- **Real-time:** WebSocket (ws)

## Prerequisites

- **Node.js** >= 24 (see `.nvmrc` or `engines` field in `package.json`)
- **PostgreSQL** database (local or remote)
- Optional: **Ollama** running locally for AI search features
- If you enable AI embeddings / semantic search: **pgvector** must be available in PostgreSQL (`CREATE EXTENSION IF NOT EXISTS vector;`)

## Setup Instructions

1. **Clone and install:**
   ```bash
   git clone https://github.com/korie93/sumbanganqueryrahmah.git
   cd sumbanganqueryrahmah
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and fill in your PostgreSQL credentials and session secret.
   See [.env.example](./.env.example) for all available options.

3. **Run database migrations:**
   ```bash
   npm run db:migrate
   ```
   If your PostgreSQL host does not already expose `pgvector`, enable it before
   relying on embedding-backed AI search. The reviewed migration attempts
   `CREATE EXTENSION IF NOT EXISTS vector`, but some managed hosts require a
   manual enable step first.

4. **Development mode:**
   ```bash
   npm run dev
   ```

5. **Production build and start:**
   ```bash
   npm run build
   npm start
   ```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (alias for `dev:server`) |
| `npm run dev:server` | Start development server with hot reload |
| `npm run build` | Build client and server bundles |
| `npm start` | Start the built production server |
| `npm run db:generate -- --name <migration_name>` | Generate a reviewed Drizzle SQL migration |
| `npm run db:migrate` | Apply Drizzle migrations through the repo migration wrapper |
| `npm run db:migrate:cli` | Run the raw Drizzle CLI migrate command for debugging |
| `npm run verify:db-schema-governance` | Verify every discovered table is classified under the repo DB governance manifest |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run test:e2e:smoke` | Run Playwright-backed browser smoke coverage against a running server |
| `npm run test:e2e:ci-local` | Build, boot a local server, then run the CI-style Playwright smoke sequence |
| `npm test` | Run all test suites |
| `npm run test:contracts` | Run shared frontend/backend API contract checks for critical endpoints |
| `npm run test:coverage` | Generate c8 coverage reports for the full main automated test suite |
| `npm run test:coverage:gate` | Enforce CI coverage thresholds (lines >= 70, branches >= 60) for the hardened API contract boundary suite |
| `npm run smoke:preflight` | Validate smoke prerequisites and bootstrap assumptions |
| `npm run smoke:ui` | Run UI smoke coverage against a running server |
| `npm run smoke:ci-local` | Build + run local CI-style smoke sequence with artifacts |
| `npm run verify:bundle-budgets` | Enforce reviewed client chunk-size budgets for heavy bundles |
| `npm run dr:drill` | Execute backup disaster-recovery drill (create/export/checksum/optional restore) |
| `npm run release:verify:local` | Run final local release gate (tests + smoke + backup drill) |
| `npm run monitor:stale-conflicts` | Snapshot stale-conflict/429 runtime monitor signals |

## Troubleshooting

- `502 Bad Gateway` selepas `git pull`, `npm run build`, atau `pm2 restart`: semak `pm2 logs sqr --lines 100` dahulu. Jika app crash semasa bootstrap, restart semula dengan `pm2 restart sqr --update-env` supaya perubahan `.env` dimuatkan sekali.
- `BACKUP_ENCRYPTION_KEY_ID 'primary' is configured but no matching key exists`: pastikan konfigurasi `.env` konsisten. Jika anda guna `BACKUP_ENCRYPTION_KEY_ID=primary`, tetapkan sama ada `BACKUP_ENCRYPTION_KEY=...` untuk satu kunci aktif atau `BACKUP_ENCRYPTION_KEYS=primary:...` untuk format key rotation.
- App crash semasa startup kerana `TWO_FACTOR_ENCRYPTION_KEY` atau `COLLECTION_PII_ENCRYPTION_KEY` kosong: itu kini tingkah laku yang disengajakan dalam production-like mode. Isi kedua-dua secret tersebut dengan nilai rawak yang berbeza, kemudian restart dengan `pm2 restart sqr --update-env`.
- Perubahan `.env` tidak berkesan dalam PM2 atau Termux: edit `.env`, kemudian jalankan `pm2 restart sqr --update-env`. Untuk setup yang kekal selepas reboot, ikut [docs/TERMUX_PM2_DEPLOYMENT.md](./docs/TERMUX_PM2_DEPLOYMENT.md).
- Ralat CSP seperti `Executing inline script violates 'script-src 'self''`: biasanya build lama atau `index.html` lama masih diserve oleh proxy/cache. Jalankan `npm run build`, restart app, dan kosongkan cache reverse proxy/CDN jika berkenaan.
- `/favicon.ico` atau aset statik lain gagal dimuatkan: pastikan build client wujud dalam `dist-local/public` selepas `npm run build`, kemudian semak log startup untuk mesej `Serving frontend static assets`.

## Project Structure

```text
sumbanganqueryrahmah/
|-- client/           # React + TypeScript frontend (Vite)
|-- server/           # Express + TypeScript backend
|   |-- controllers/  # Request/response logic
|   |-- services/     # Business logic
|   |-- repositories/ # Database query layer
|   |-- middleware/   # Express middleware
|   |-- routes/       # API route definitions
|   |-- config/       # Runtime configuration
|   |-- utils/        # Shared utility functions
|   `-- db/           # Database connection setup
|-- shared/           # Types and schemas shared between client and server
|-- drizzle/          # Drizzle ORM migration files
|-- scripts/          # Build, CI, and maintenance scripts
`-- docs/             # Additional documentation
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a detailed architecture overview.

## Features

- Role-based access control (superuser, admin, user)
- Collection record management with receipt uploads
- Staff nickname assignment and admin group management
- AI-powered search with Ollama integration
- Real-time WebSocket notifications
- Comprehensive analytics and reporting
- Account activation and password reset via email

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture overview
- [docs/DATABASE_MIGRATIONS.md](./docs/DATABASE_MIGRATIONS.md) - Drizzle and legacy migration workflow
- [scripts/db-schema-governance.manifest.mjs](./scripts/db-schema-governance.manifest.mjs) - Table-by-table schema ownership and migration governance manifest
- [docs/QA_FINAL_CHECKLIST.md](./docs/QA_FINAL_CHECKLIST.md) - Final QA and smoke gate checklist
- [docs/TESTING_STRATEGY.md](./docs/TESTING_STRATEGY.md) - Current automated test layers, Playwright smoke coverage, and bundle budget gates
- [docs/OBSERVABILITY.md](./docs/OBSERVABILITY.md) - Current logging, health, telemetry, and runtime monitoring model
- [docs/GO_LIVE_LAUNCH_CHECKLIST.md](./docs/GO_LIVE_LAUNCH_CHECKLIST.md) - Final go-live launch gate checklist
- [docs/PRODUCTION_PROMOTION_PLAYBOOK.md](./docs/PRODUCTION_PROMOTION_PLAYBOOK.md) - Staging soak, canary, monitor, and rollback playbook
- [docs/HETZNER_PRODUCTION_DEPLOYMENT.md](./docs/HETZNER_PRODUCTION_DEPLOYMENT.md) - Practical single-VPS production deployment guide for Hetzner, Nginx, PM2, PostgreSQL, and HTTPS
- [docs/KEYBOARD_SHORTCUTS.md](./docs/KEYBOARD_SHORTCUTS.md) - Current documented keyboard shortcuts that exist in the client today
- [docs/SMTP_SECRET_INCIDENT_RESPONSE.md](./docs/SMTP_SECRET_INCIDENT_RESPONSE.md) - Secret rotation and git-history cleanup guide for exposed SMTP credentials
- [docs/RELEASE_HARDENING_SUMMARY.md](./docs/RELEASE_HARDENING_SUMMARY.md) - Current build hardening summary and controlled rollout checklist
- [docs/GO_NO_GO_RELEASE_TEMPLATE.md](./docs/GO_NO_GO_RELEASE_TEMPLATE.md) - Fill-in template for final rollout decision during the release window
- [docs/DISASTER_RECOVERY_DRILL.md](./docs/DISASTER_RECOVERY_DRILL.md) - Backup and restore drill guide
- [docs/CSS_ARCHITECTURE.md](./docs/CSS_ARCHITECTURE.md) - CSS layering, token usage, and component styling decision guide
- [docs/TERMUX_PM2_DEPLOYMENT.md](./docs/TERMUX_PM2_DEPLOYMENT.md) - Termux/PM2 deployment, environment persistence, and reboot workflow
- [README_CLIENT_MANUAL.md](./README_CLIENT_MANUAL.md) - Client user manual

## License

This project is licensed under the MIT License.
