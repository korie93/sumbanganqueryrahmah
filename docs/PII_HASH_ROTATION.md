# PII Hash Rotation Runbook

<!-- AUDIT-FIX [L4]: operational runbook for rotating keyed PII hash material without exposing plaintext. -->

This runbook covers rotating keyed hash material used for PII lookup/shadow columns. Keep plaintext PII out of logs, migration output, and support tickets throughout the process.

## Preconditions

- Confirm a recent encrypted backup exists and has passed restore validation.
- Confirm the new hash secret is stored in the production secret manager.
- Confirm application nodes can read both current and previous hash secrets during the rotation window.
- Schedule the rotation during a low-traffic maintenance window if a full backfill is required.

## Rotation Steps

1. Add the new hash secret as the primary secret.
2. Move the old primary secret into the previous-secret list.
3. Deploy application code/config so reads can match records hashed with either secret.
4. Run the rehash/backfill job in batches. Use primary-key ranges or cursor pagination; do not scan everything in one transaction.
5. Monitor DB pool pressure, job latency, and error counts during each batch.
6. Verify lookups using non-PII synthetic fixtures and sampled hashed-record counts.
7. Remove the old secret from the previous-secret list only after every affected row has been rehashed and the maximum cache/session TTL has elapsed.

## Rollback

- If verification fails before old-secret removal, restore the previous config with the old primary and keep the new secret in the previous-secret list.
- If the backfill wrote incorrect hashes, stop traffic, restore from the validated backup, and rerun the rotation with a smaller batch size.

## Safety Rules

- Never print plaintext PII, old hash values, or new hash values in logs.
- Never run rotation scripts from a developer workstation against production.
- Prefer idempotent batch markers so an interrupted rotation can resume safely.
- Keep old secrets only for the minimum verified overlap window.
