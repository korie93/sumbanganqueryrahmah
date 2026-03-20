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

3. **Development mode:**
   ```bash
   npm run dev:server
   ```

4. **Production build and start:**
   ```bash
   npm run build
   npm start
   ```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev:server` | Start development server with hot reload |
| `npm run build` | Build client and server bundles |
| `npm start` | Start the built production server |
| `npm run db:generate -- --name <migration_name>` | Generate a reviewed Drizzle SQL migration |
| `npm run db:migrate` | Apply Drizzle migrations through the repo migration wrapper |
| `npm run db:migrate:cli` | Run the raw Drizzle CLI migrate command for debugging |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run typecheck` | Run TypeScript type checking |
| `npm test` | Run all test suites |

## Features

- Role-based access control (superuser, admin, user)
- Collection record management with receipt uploads
- Staff nickname assignment and admin group management
- AI-powered search with Ollama integration
- Real-time WebSocket notifications
- Comprehensive analytics and reporting
- Account activation and password reset via email

## Documentation

- [docs/DATABASE_MIGRATIONS.md](./docs/DATABASE_MIGRATIONS.md) - Drizzle and legacy migration workflow

- [ARCHITECTURE.md](./ARCHITECTURE.md) — System architecture overview
- [docs/](./docs/) — Additional documentation
- [README_CLIENT_MANUAL.md](./README_CLIENT_MANUAL.md) — Client user manual

## License

This project is licensed under the MIT License.
