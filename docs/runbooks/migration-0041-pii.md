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

## Rollback

- Clear `COLLECTION_PII_RETIRED_FIELDS`.
- Keep previous PII encryption keys available during the compatibility window.
- Restore from backup only if migration or rewrite jobs corrupted data.
