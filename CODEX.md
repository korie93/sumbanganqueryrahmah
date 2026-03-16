# CODEX.md

## Codex Execution Guide

This repository supports automated improvements using Codex (GPT‑5.x).

### Responsibilities

Codex should: - Identify security issues - Improve architecture -
Generate safe refactor patches - Improve logging and error handling -
Add tests - Add CI/CD pipelines

### Priority Fix Order

1.  Remove `.env` from repository
2.  Standardize database to PostgreSQL
3.  Refactor backend architecture
4.  Add global error handler
5.  Implement structured logging
6.  Add rate limiting
7.  Add AI fallback logic
8.  Add test infrastructure
9.  Add CI/CD
10. Audit dependencies

### Expected Codex Outputs

-   Pull request patches
-   Dependency cleanup
-   Security fixes
-   Test scaffolding
-   CI pipeline setup
