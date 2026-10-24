# Historical and pending security invariants

These three source-authored regressions **failed their denial assertions** against
the original audited revision in the 2026-10-24 isolated WSL follow-up. That result
is preserved as historical evidence; it does not describe the current repaired
tree. The fixtures remain intentionally outside the normal
`*.test.ts` suite and required CI. They assert desired safe behavior, never that
insecure behavior should continue. See the external runtime report for evidence
and the separate PostgreSQL/service fixtures that strengthen two observations.

Use only the sandbox and synthetic configuration described in the parent README:

```sh
node --import tsx --test --test-concurrency=1 tests/security/pending/*.regression.ts
```

That is the explicit pending-fixture command for an already compatible prepared toolchain. The audit
used an offline TypeScript loader because local esbuild is Windows-specific; it
did not claim the above command passed. The Viewer wrapper now imports a real
PostgreSQL test and skips without the disposable-cluster gate. Do not set that gate
manually or point it at an existing database. See the parent README for exact
limits.

Current repair behavior, immutable AI ownership, intentional legacy-history 404s,
and regression coverage are documented in
[Account, AI and Viewer security boundaries](../../../docs/security-boundary-repairs.md).
For the four repaired boundaries, use the canonical disposable-cluster runner
inside the prepared sandbox:

```sh
npm run test:auth:postgres
```

- `receipt-server-hash`: unresolved; the trusted upload digest must win over
  caller metadata. Its desired safe assertion remains intact.
- `ai-conversation-owner`: repaired using the authenticated backend account ID.
  The updated fixture checks service-side denial before history reads/writes;
  final PostgreSQL reads/inserts and HTTP identity forwarding have separate
  regressions. Username changes or reuse cannot transfer new conversations, and
  legacy username-owned history fails closed.
- `viewer-tombstone`: repaired at the final SQL boundary. The wrapper imports
  `server/repositories/tests/viewer-import-lifecycle.postgres.test.ts`, which
  exercises retained rows, counts, headers and old cursors against a disposable
  database. A service-only precheck is not required by the repaired invariant.

The receipt and AI service fixtures use synthetic inputs without real receipts,
users, mail or models. The Viewer regression requires the runner's disposable
PostgreSQL cluster. Runtime imports still require the controlled test environment;
the pending glob alone does not validate every repaired boundary.

The original Viewer unit catch masked its failed row assertion. The historical
external PostgreSQL observation records concrete rows and headers instead; that
evidence is retained separately from the current database-backed regression.
Recovery-recipient and session-admission repairs also have dedicated transaction
and race regressions under `test:auth:postgres`.

Receipt-hash authority, detached indexing cancellation and import-resume behavior
remain three unresolved audit leads outside the four-finding repair scope. Their
historical evidence is not a claim of remediation or a new severity assessment.
