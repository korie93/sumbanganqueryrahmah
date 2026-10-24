# Account, AI and Viewer security boundaries

These repairs follow the bounded local security audit of revision
`117523395a9cd94f9014c121fac9ded465e0f019`. The audit reports and synthetic runtime
evidence are kept outside the repository. This document describes production
behavior and regression coverage, not a complete security certification.

## Recovery recipient changes

A real normalized email change locks the account and cancels unused activation
and reset links in the same transaction. Tokenless requests awaiting approval
remain intact. Formatting the same normalized address does not cancel links.

Activation/reset issuance carries the recipient snapshot chosen by the server.
The repository compares it with the locked account before issuing a link or
replacing existing links. A stale or missing recipient fails closed. Issuance,
email correction and recovery consumption use the same account-row lock; SMTP
remains outside the transaction. This also prevents delayed delivery/preparation
from reviving authority for a former recipient.

## Session admission

Password login captures a credential digest from the exact account snapshot whose
password passed verification. Failed-attempt cleanup cannot replace that proof
with a newer password or authenticator state. Before creating the authenticated
activity, the repository locks the account and checks that proof, current account
eligibility, identity, role and required factor. Existing MFA expiration and
credential checks continue to apply. Internal maintenance activity creation is
separate from the authenticated-session helper, which requires verified proof.

## Private AI conversations

Conversation access uses the authenticated backend account ID. The existing
`created_by` text field stores new ownership keys as `account:<internal-user-id>`;
the current username remains audit metadata. Renaming an account or assigning its
old username to another account cannot transfer its conversations. Elevated roles
have no ownership override.

The service rejects a foreign or missing conversation before reading history,
generating a summary or calling the model. Final SQL reads and inserts repeat the
ownership predicate. Foreign and missing selectors both return 404; absent trusted
account identity returns 401. Client-supplied owner fields are ignored.

**Legacy compatibility:** conversations stored with a username-only `created_by`
have no trustworthy immutable owner binding. They remain stored but return 404.
There is no automatic backfill that could assign private history to a reused
username. New conversations work normally. Restoring access to legacy history
requires a separately reviewed, explicit account-to-conversation mapping.

## Viewer lifecycle

Direct row queries, count fallbacks, column names and cursor pagination require an
active parent import at query time. Single-import repository readers apply the
same predicate. Direct Viewer reads use the primary database so replication lag
cannot revive a just-deleted import. Tombstoned child rows can remain retained,
but these ordinary readers return no content, headers or counts. Active shared
imports retain their existing visibility; no uploader-only policy is introduced.

## Regression coverage

The normal service, repository and route suites include ownership denials, current
owner success, trusted identity handling and credential-proof propagation.
`npm run test:auth:postgres` also runs disposable PostgreSQL regressions for:

- Recovery issuance/correction/redemption ordering, atomic rollback, both link
  families, tokenless requests, stale recipient rejection and fresh recovery.
- Password admission before/after recovery, actual row-lock waiting, account and
  MFA state changes, and factor expiration while waiting for a lock.
- Owner-scoped AI reads/writes, empty history, renamed owners, username reuse and
  unchanged legacy rows.
- Deleted-import rows, counts, headers, deep-offset fallback and old cursors,
  including active-import positive controls.

Run those commands only in a disposable development/CI database environment.
The audit's stricter no-network/read-only/cgroup sandbox remains required for its
security validation workflow. No database schema migration is required by these
repairs. The receipt-hash, indexing cancellation and import-resume audit leads are
outside this four-finding repair scope.

## Local verification on 2026-10-24

The repaired tree passed 114 focused service/repository/route tests, 42 actual
disposable PostgreSQL tests and 64 audit regression tests, with no failures or
skips. Backend/shared lint passed. Backend and shared TypeScript passed with the
project's compiler options and a backend/shared root-file scope. These checks used the installed Linux Node
24 toolchain and an offline TypeScript loader inside the enforced audit sandbox.
They did not run the canonical npm/tsx launcher or the full application build.

The full frontend-plus-backend TypeScript attempt exhausted its 1.5 GiB JavaScript
heap and is not reported as passing. Frontend code was unchanged by these repairs.
Full CI and production behavior were not verified in this local follow-up.
