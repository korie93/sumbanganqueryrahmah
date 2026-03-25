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
| `npm test` | Run all test suites |
| `npm run smoke:preflight` | Validate smoke prerequisites and bootstrap assumptions |
| `npm run smoke:ui` | Run UI smoke coverage against a running server |
| `npm run smoke:ci-local` | Build + run local CI-style smoke sequence with artifacts |
| `npm run dr:drill` | Execute backup disaster-recovery drill (create/export/checksum/optional restore) |
| `npm run release:verify:local` | Run final local release gate (tests + smoke + backup drill) |
| `npm run monitor:stale-conflicts` | Snapshot stale-conflict/429 runtime monitor signals |

## Project Structure

```
sumbanganqueryrahmah/
├── client/          # React + TypeScript frontend (Vite)
├── server/          # Express + TypeScript backend
│   ├── controllers/ # Request/response logic
│   ├── services/    # Business logic
│   ├── repositories/# Database query layer
│   ├── middleware/  # Express middleware
│   ├── routes/      # API route definitions
│   ├── config/      # Runtime configuration
│   ├── utils/       # Shared utility functions
│   └── db/          # Database connection setup
├── shared/          # Types and schemas shared between client and server
├── drizzle/         # Drizzle ORM migration files
├── scripts/         # Build, CI, and maintenance scripts
└── docs/            # Additional documentation
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
- [docs/GO_LIVE_LAUNCH_CHECKLIST.md](./docs/GO_LIVE_LAUNCH_CHECKLIST.md) - Final go-live launch gate checklist
- [docs/PRODUCTION_PROMOTION_PLAYBOOK.md](./docs/PRODUCTION_PROMOTION_PLAYBOOK.md) - Staging soak, canary, monitor, and rollback playbook
- [docs/DISASTER_RECOVERY_DRILL.md](./docs/DISASTER_RECOVERY_DRILL.md) - Backup and restore drill guide
- [README_CLIENT_MANUAL.md](./README_CLIENT_MANUAL.md) - Client user manual

## License

This project is licensed under the MIT License.
