# Secret Leak Incident Response

Use this playbook when any production, staging or CI secret may have appeared in
logs, commits, screenshots, support tickets, chat, artifacts, browser devtools,
or shell history. Treat uncertainty as exposure until proven otherwise.

## Detection Signals

- `.env`, `.env.*`, database URLs or API keys appear in `git log`, PR diffs,
  CI artifacts, terminal recordings, screenshots or paste buffers.
- Logs contain `PG_PASSWORD`, SMTP credentials, JWT/session secrets,
  encryption keys, provider API keys, Redis URLs with passwords, backup keys, or
  raw bearer tokens.
- `npm run verify:repo-hygiene` or secret scanning reports a high-confidence
  token.
- An external provider reports unusual authentication, mail, AI, Redis or
  database usage.

## First 15 Minutes

1. Stop sharing the exposed artifact. Restrict the ticket, log bundle, chat or
   branch while the response is active.
2. Identify the secret type and environment: production, staging, CI, local or
   backup-only.
3. Revoke or disable the exposed credential at the source provider when
   possible.
4. Generate a replacement from a trusted operator machine or secret manager.
5. Update the deployment secret store. Do not paste the new value into Git,
   chat, issue trackers or CI logs.
6. Restart all SQR app workers that depend on the secret.
7. Verify the affected feature: login, 2FA, database, SMTP, backup restore,
   AI/search provider or Redis-backed runtime state.

## Rotation Procedures

Use `docs/SECRET_ROTATION.md` for detailed planned and emergency rotation
steps. Minimum emergency handling:

- `SESSION_SECRET`: generate a new value, clear `SESSION_SECRET_PREVIOUS` if
  compromise is suspected, restart all app processes, expect all users to log in
  again.
- `TWO_FACTOR_ENCRYPTION_KEY`: rotate with
  `TWO_FACTOR_ENCRYPTION_KEY_PREVIOUS` only if the old key is not compromised;
  otherwise plan user re-enrollment or controlled recovery.
- `COLLECTION_PII_ENCRYPTION_KEY`: rotate immediately and assess historical
  encrypted rows/backups that may require the old key.
- `BACKUP_ENCRYPTION_KEY` or `BACKUP_ENCRYPTION_KEYS`: add a new active key ID,
  keep uncompromised old keys only until backups expire, and restore-test.
- `PG_PASSWORD`: rotate in PostgreSQL or the managed database console, update
  app secrets, restart workers, and confirm migrations and health checks.
- SMTP credentials: follow `docs/SMTP_SECRET_INCIDENT_RESPONSE.md`.
- Provider API keys: create a new key, deploy it, verify the feature, then
  revoke the old key.
- Redis URLs/passwords: rotate credentials, restart all workers, and verify rate
  limit, 2FA replay and session revocation sharing.

## Git History Containment

If the secret was committed:

1. Revoke it first.
2. Rewrite history with an approved tool such as `git filter-repo`.
3. Force-push cleaned branches and tags only after coordination.
4. Close or refresh stale forks and branches that still contain the old commit.
5. Re-run secret scanning across all refs.

Never rely on deleting the current file alone. Old commits, CI caches and forks
can still expose the value.

## Validation Commands

If validation or recovery runs on a deployment server before rebuilding,
migrating, or restarting workers, verify the checkout first:

```bash
BRANCH="${SQR_DEPLOY_BRANCH:-main}"
bash scripts/verify-server-checkout.sh "$BRANCH"
```

Stop the incident rollout if this gate fails because a wrong branch, local
changes, fetch failure, or drift from `origin/$BRANCH` can turn a secret
rotation into an unintended code or migration deploy.

Run the relevant subset after containment:

```bash
npm run verify:repo-hygiene
npm run verify:secrets
npm run typecheck
npm run test:auth
npm run test:http
npm run build
```

For database or migration-impacting incidents, also run:

```bash
npm run db:migrate
npm run smoke:preflight
```

## Escalation Matrix

| Role | Owns | When to involve |
| --- | --- | --- |
| Incident commander | Timeline, decisions, communication | Immediately for production or CI exposure. |
| App maintainer | SQR config, deploy, tests | Any app secret or runtime credential. |
| Database owner | PostgreSQL users, passwords, audit logs | `PG_PASSWORD`, `DATABASE_URL`, suspicious DB access. |
| Mail/provider admin | SMTP/API key revocation | SMTP, AI/provider or third-party API key leaks. |
| Security reviewer | History rewrite and postmortem | Any committed secret or public exposure. |

## Post-Incident Review

- What was exposed, where, and for how long?
- Which systems could use the secret?
- Was the old value revoked, not just rotated in SQR?
- Were all app processes restarted?
- Did any logs or artifacts capture the replacement value?
- Which guardrail failed: `.gitignore`, docs, secret scan, review, CI or
  deployment process?
- What test, runbook or CI step prevents recurrence?
