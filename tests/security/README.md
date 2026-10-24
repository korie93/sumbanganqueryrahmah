# Security audit regressions

This directory began as test-only additions from the Cloudflare security-audit
review of `117523395a9cd94f9014c121fac9ded465e0f019`. The original audit did not
change application behavior. Subsequent repairs address four confirmed findings;
their current behavior and compatibility limits are described in
[Account, AI and Viewer security boundaries](../../docs/security-boundary-repairs.md).

## Status

**Historical audit follow-up, executed on 2026-10-24 against the audited revision.** The six normal files passed
64 assertions in a dedicated WSL2 Ubuntu sandbox. The three excluded pending
fixtures each failed their desired denial assertion. Additional external fixtures
tested real PostgreSQL/service/guard transitions and bounded HTTP/indexing/resume
behavior. See the external audit report below for individual results and limits.
These failures are historical evidence, not a claim that all three fixtures still
fail after the repairs.

The four current repairs cover recovery links after recipient correction, session
admission after credential changes, private AI conversations bound to immutable
account IDs, and Viewer reads after import deletion. AI ownership does not fall
back to usernames; legacy username-owned history deliberately returns 404. Viewer
lifecycle checks are enforced in final SQL queries. The pending Viewer wrapper now
imports the real, gated PostgreSQL regression instead of requiring a service-only
precheck. See [pending fixture status](pending/README.md) for the distinction.

The canonical disposable PostgreSQL regression command for the four repairs is:

```sh
npm run test:auth:postgres
```

Use a prepared sandbox as described below, with the runner's disposable cluster
confined to its assigned scratch space. The command does not replace those outer
controls. The canonical PostgreSQL launcher uses the platform's default WAL
segment size (normally 16 MiB), so its outer per-file cap must accommodate that;
the 8 MiB example below applies to the lightweight audit suite. The recorded
strict audit run instead used a separate disposable wrapper with 1 MiB WAL
segments. Its regression coverage and legacy compatibility policy are documented
in the linked repair document; historical audit counts do not describe a rerun of
the repaired tree. Receipt-hash authority, detached indexing cancellation and
import-resume behavior remain unresolved audit leads outside this repair scope.

The historical follow-up used Linux Node 24.22.1 and an offline TypeScript ESM
loader, using locally installed dependencies. It did **not** run
`npm run test:security:audit` through npm/tsx: the installed esbuild binary is
Windows-specific. Sandbox enforcement included
mandatory bubblewrap namespaces, isolated loopback, an empty safe environment,
read-only source/toolchain, bounded scratch, cgroup/rlimit caps and descriptor-safe
artifact retention. A cleaned environment or script named `isolated` alone is
insufficient. No all-flows certification or coverage percentage is claimed.

## Run only inside a prepared sandbox

Use the existing, locally available Node 24 toolchain and installed dependencies;
do not install packages or fetch a browser/image/dependency as part of the run.
The outer sandbox must enforce all of the following before running the command:

- No external network or host/shared service sockets. The HTTP tests need only
  an isolated loopback namespace; they bind `127.0.0.1` on ephemeral ports.
- Read-only reviewed source and toolchain, with all writes limited to one assigned
  scratch area. Do not expose real `.env`, keys, uploads, browser profiles, host home,
  production artifacts, or other agents' directories. A disposable copy can omit them.
- Empty environment populated with explicit safe values. Use scratch-local home,
  temporary/cache directories, `NODE_ENV=test`, a synthetic 48+ character
  `SESSION_SECRET`, `PUBLIC_APP_URL=http://127.0.0.1:5000`,
  `CORS_ALLOWED_ORIGINS=http://127.0.0.1:5000`, and an unreachable disposable DB
  configuration (`PG_HOST=127.0.0.1`, `PG_PORT=1`, `PG_USER=sqr_audit`,
  `PG_PASSWORD=audit-fixture-only`, `PG_DATABASE=sqr_audit`). Disable dotenv file
  loading with `DOTENV_CONFIG_PATH` pointing to a nonexistent scratch path. Do not
  inherit `NODE_OPTIONS`, production DB/Redis/SMTP/model settings or ambient secrets.
- Explicit low limits, for example one CPU, 768 MiB memory, 64 processes, 8 MiB
  maximum output file, 256 MiB scratch, and 120 seconds for the entire process tree.
  Increase only after reviewing a concrete fixture requirement.

Inside that already-provisioned sandbox:

```sh
npm run test:security:audit
```

This command does **not** create or certify a sandbox, build the app, start the real
runtime, connect to a database, or run migrations. Runtime imports still evaluate
configuration; keep the environment and filesystem controls above in place.
Do not treat the historical offline-loader run as validation of a required CI
setup; validate that setup in a prepared local or CI sandbox first. Run the
existing `test:security` and the suites in
`flow-matrix.json` separately under equivalent controls, with disposable services
only when explicitly needed.

## Test boundaries

| File | What it checks | What it does not establish |
| --- | --- | --- |
| `identity-boundaries.test.ts` | Strict identity claim shape, blocked account lifecycle, manageable roles, chosen-password policy | JWT signatures, authoritative DB state, token consumption, session races |
| `browser-input-boundaries.test.ts` | URL scheme/origin rejection, blob origin restriction, CSV formula neutralization | Actual DOM/browser/CSP, PDF renderer behavior |
| `path-boundaries.test.ts` | Lexical namespace and uploads-root confinement | Symlink/TOCTOU behavior or real filesystem ACLs |
| `route-denial-boundaries.test.ts` | Actual registration of Search/AI/backup/receipt aliases stops before sinks when an injected gate denies | Correctness of the injected auth/role/tab implementation or per-object scope |
| `http-provenance-boundaries.test.ts` | Combined actual CORS/CSRF middleware rejects synthetic invalid cookie mutations | Browser cookie transport or actual reverse-proxy topology |
| `flow-matrix.test.ts` | Unique workflow IDs, existing safe test references and explicit runtime gaps | Execution or adequacy of the referenced tests |

`flow-matrix.json` maps 16 workflow families to existing and new tests and explicitly
records gaps. It is an inventory, not a test runner or a security verdict. Pending
regressions, if present in `pending/`, are deliberately excluded from the default
glob; their expected denial assertions must be run explicitly and must not be
converted into passing tests by asserting insecure behavior.
Its `executionStatus` is the original plan snapshot, checked by the inventory test;
the scoped follow-up results are tracked in the external runtime report separately.

## Audit skill and reports

Cloudflare's [security-audit-skill](https://github.com/cloudflare/security-audit-skill)
was installed locally at revision `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8`.
For another machine, use the skill-installer with repository
`cloudflare/security-audit-skill`, path `skills/security-audit`, and that exact ref.
Read `SKILL.md` and applicable companions before use. Reports stay outside this
repository by default; do not publish unvalidated exploit leads, secrets or private
runtime artifacts into a public repository.

The current audit report directory is
`C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/run-1`.
Its run metadata and coverage ledger are the continuation record. Findings require
independent review; unresolved leads have no security severity. The runtime report
is `RUNTIME_VALIDATION.md` in that directory. Raw bounded runtime evidence stays in
the dedicated Linux audit output under `/opt/sqr-audit`; Windows reports are
parent-authored readable summaries. The original audit did not fix production
source; the subsequent four-finding repairs are documented separately above.
