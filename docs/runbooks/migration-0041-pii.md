# Migration 0041 PII Rollout Runbook

This runbook covers collection PII encrypted shadow-column rollout and
retirement checks.

## Pre-Flight

- Confirm `COLLECTION_PII_ENCRYPTION_KEY` is configured outside local
  development.
- Confirm backup encryption keys are available.
- Run `npm run collection:pii-status`.
- Run `npm run collection:rollout-readiness`.
- Verify a recent encrypted backup can be restored in staging.

## Rollout

1. Run database migrations.
2. Deploy the app version that dual-writes encrypted PII shadow columns.
3. Run `npm run collection:pii-status` and confirm rewrite counts are trending
   down.
4. Run the appropriate re-encryption or plaintext-redaction script for the
   selected field set.
5. Re-run status checks until plaintext/redactable counts are zero for the
   target fields.

## Retirement

Only set `COLLECTION_PII_RETIRED_FIELDS` after the relevant verification script
passes. For sensitive fields, use:

```bash
npm run collection:verify-pii-sensitive-retirement
```

For full retirement, use:

```bash
npm run collection:verify-pii-full-retirement
```

### Mandatory Live-Database Evidence

CI and an empty test database cannot prove that production plaintext has been
retired. Before each production rollout that adds or keeps retired fields, run
the checks from the deployed application directory with the target production
database environment loaded:

```bash
npm run collection:pii-status -- --json
npm run collection:verify-pii-sensitive-retirement
```

When `COLLECTION_PII_RETIRED_FIELDS` is non-empty, also run the exact-field
gate used by startup and release readiness:

```bash
npm run collection:verify-pii-retired-fields
```

Record the timestamp, deployed commit, selected field list, and zero-count
result in the private deployment evidence log. The report contains aggregate
counts only; do not copy record values, encryption payloads, or keys into a
ticket. A non-zero plaintext, redactable, or rewrite count is a hard stop: keep
the field out of `COLLECTION_PII_RETIRED_FIELDS`, complete the documented dry
run/apply workflow, then repeat all live checks. Do not bypass the startup
retirement guard.

The full-retirement command is required only when all supported PII fields are
being retired. A passing sensitive-field gate must not be recorded as proof of
full retirement.

## Rollback

- Clear `COLLECTION_PII_RETIRED_FIELDS`.
- Keep previous PII encryption keys available during the compatibility window.
- Restore from backup only if migration or rewrite jobs corrupted data.
