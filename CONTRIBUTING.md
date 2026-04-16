# Contributing

Thanks for helping improve SQR. This repository optimizes for production safety first, so the best contributions are small, reviewable, and backed by validation.

## Workflow

1. Make the smallest change that closes the problem safely.
2. Reuse existing patterns before adding new abstractions.
3. Avoid breaking API routes, auth flows, and database contracts.
4. Add or update focused tests when behavior changes.
5. Regenerate docs or contract outputs when the source of truth changes.

## Local validation

Run the checks that match your change scope. For most application changes, this is the minimum bar:

```bash
npm run lint
npm run typecheck
npm run test:client
npm run test:scripts
npm run build
```

Useful targeted commands:

```bash
npm run docs:api
npm run verify:api-docs
npm run verify:repo-hygiene
npm run verify:dependency-supply-chain
```

## Security and supply chain

- Never commit `.env` or environment-specific secrets.
- Do not log tokens, cookies, connection strings, or raw backup payloads.
- Keep vendored dependencies documented. `xlsx` is intentionally vendored; if it changes, update `docs/DEPENDENCY_SUPPLY_CHAIN.md` in the same PR.

## TypeScript tooling note

`tsconfig.json` intentionally keeps `skipLibCheck: true` for now.

We rechecked the stricter path with:

```bash
npx tsc --noEmit --skipLibCheck false
```

That currently fails on upstream third-party declaration issues, including:

- Drizzle cross-driver declarations that pull optional drivers such as `mysql2` and `gel`
- Drizzle declaration incompatibilities across unused drivers
- duplicate CSS module declarations between local `style-modules.d.ts` and `vite/client.d.ts`

Keep `skipLibCheck` enabled until those dependency-level issues are removed or isolated safely.

## API contracts

Stable client-facing response schemas live in `shared/api-contracts.ts`.

If you change one of those schemas or a documented public response:

1. update the route/client usage
2. run `npm run docs:api`
3. keep `docs/API_CONTRACTS.md` in sync

## Tests and reviewability

- Prefer focused unit or integration coverage over broad rewrites.
- Keep migrations, schema changes, and bootstrap fixes explicit.
- If a fix is too invasive for one PR, ship the highest-value safe subset and document the remaining follow-up clearly.
