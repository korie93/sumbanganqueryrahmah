
# AGENTS.md

## Autonomous Development Guidelines for AI Agents

This repository supports autonomous improvements by AI coding agents such as:

- Codex (GPT-5.x)
- Cursor agents
- Claude Code
- automated CI assistants

Agents may analyze the repository and propose improvements through incremental pull requests.
Agents must follow the rules defined in this document.

---

# Primary Objectives

Improve the repository in the following areas:

1. Security
2. Architecture
3. Reliability
4. Testing
5. Performance
6. Developer Experience

Agents should prioritize production stability over stylistic changes.

---

# Project Stack

Frontend:
- React
- TypeScript
- modular component architecture
- AI chat components
- WebSockets

Backend:
- Node.js
- Express
- Drizzle ORM
- REST APIs
- PostgreSQL (target database)

Infrastructure:
- GitHub
- CI/CD
- containerized deployment (future goal)

---

# Critical Security Rules

## Never Commit Secrets

Files that must never be committed:

.env
.env.local
.env.production
.env.development

Ensure `.gitignore` contains:

.env
.env.*

Repository must include:

.env.example

Example:

DATABASE_URL=
JWT_SECRET=
SMTP_USER=
SMTP_PASS=
OPENAI_API_KEY=

---

# Database Standardization

The project previously used mixed database systems.

Standardize to:

PostgreSQL

Remove:

better-sqlite3

Example Drizzle configuration:

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";

const { Pool } = pkg;

export const db = drizzle(
  new Pool({
    connectionString: process.env.DATABASE_URL
  })
);
```

---

# Backend Architecture Rules

Target structure:

server
 ├ controllers
 ├ services
 ├ repositories
 ├ middleware
 ├ routes
 ├ config
 ├ utils
 └ db

Request flow:

routes → controllers → services → repositories → database

Responsibilities:

routes: define endpoints  
controllers: request/response logic  
services: business logic  
repositories: database queries

---

# Error Handling

Ensure global Express error handler:

```ts
app.use((err, req, res, next) => {
  console.error(err)

  res.status(err.status || 500).json({
    message: err.message || "Internal Server Error"
  })
})
```

---

# Logging

Use structured logging with **pino**.

Install:

npm install pino

Example:

```ts
import pino from "pino"

export const logger = pino({
  level: "info"
})
```

---

# Rate Limiting

Use express-rate-limit globally.

```ts
import rateLimit from "express-rate-limit"

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
  })
)
```

---

# AI Reliability

AI services may fail due to:

- API outages
- rate limits
- timeouts

Example fallback:

```ts
async function callAI(prompt) {
  try {
    return await aiClient(prompt)
  } catch (err) {
    return fallbackSearch(prompt)
  }
}
```

---

# Testing Requirements

Recommended stack:

vitest  
supertest

Create:

tests/

Example:

```ts
import request from "supertest"

test("login endpoint", async () => {
  const res = await request(app)
    .post("/api/login")
    .send({
      user: "test",
      password: "123"
    })

  expect(res.status).toBe(200)
})
```

Target coverage:

70%+

---

# CI/CD

Add GitHub Actions pipeline:

.github/workflows/ci.yml

Example:

```yaml
name: CI

on: [push]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3
      - run: npm install
      - run: npm run build
      - run: npm test
```

---

# Dependency Audit

Audit large dependencies such as:

html2canvas  
jspdf  
xlsx  
recharts  
framer-motion  
react-window

Check for:

- unused dependencies
- bundle size impact
- duplicate functionality

---

# Cross Platform Scripts

Avoid OS-specific scripts like:

INSTALL.bat  
START.bat

Prefer:

npm run start  
npm run build  
npm run dev

---

# Documentation Layout

Recommended:

README.md  
docs/  
architecture.md  
deployment.md  
api.md

---

# Safe Refactor Policy

Agents must:

- avoid breaking APIs
- produce small pull requests
- add tests with features
- document architecture changes

Preferred changes:

- security fixes
- dependency cleanup
- architecture refactor
- logging improvements
- CI improvements

---

# Execution Priority

1. Remove .env
2. Standardize database
3. Refactor backend architecture
4. Add error handling
5. Implement logging
6. Apply rate limiting
7. Improve AI reliability
8. Add tests
9. Add CI/CD
10. Dependency audit

---

# Expected Agent Outputs

Agents may generate:

- pull request patches
- architecture refactors
- security improvements
- dependency cleanup
- test scaffolding
- CI pipelines

All changes must remain safe and production-ready.
