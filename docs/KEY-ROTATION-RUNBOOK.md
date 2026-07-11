# SQR Key Rotation Runbook

This is the operator-facing checklist for rotating SQR cryptographic keys. Keep
real key material only in the deployment secret store or a restricted server
environment file. Do not paste secrets into Git, tickets, chat, CI logs, shell
history, screenshots, or incident notes.

For detailed implementation notes and longer background, see
[SECRET_ROTATION.md](SECRET_ROTATION.md).

## Overview

SQR uses separate keys for session signing, audit log integrity, 2FA secret
encryption, collection PII encryption, and backup encryption. Rotate one key
family at a time unless this is an active compromise response.

Before every planned rotation:

1. Assign one rotation owner and one reviewer.
2. Confirm the target environment and affected key family.
3. Generate replacement key material on a trusted operator machine or in the
   secret manager.
4. Stage the new value in the deployment secret store.
5. If the rotation will deploy or restart application workers on a deployment
   server, verify the checkout first:

   ```bash
   BRANCH="${SQR_DEPLOY_BRANCH:-main}"
   bash scripts/verify-server-checkout.sh "$BRANCH"
   ```

   Do not continue if the checkout is on the wrong branch, has local changes,
   cannot fetch origin, or differs from `origin/$BRANCH`.
6. Keep old values only in the supported previous-key fields or secure cold
   storage, and only for the documented compatibility window.
7. Record the rotation date, next due date, operator, reviewer, and verification
   output in the operations rotation register. Do not record key values.

## Key Inventory

| Key | Env variable | Rotation frequency | Compatibility path | Impact if compromised |
| --- | --- | --- | --- | --- |
| Session signing | `SESSION_SECRET` | 90 days, or immediately on compromise | `SESSION_SECRET_PREVIOUS` during planned rotation | Active sessions and device/session fingerprints must be treated as untrusted. |
| Previous session signing | `SESSION_SECRET_PREVIOUS` | Retire after the session TTL compatibility window | Comma-separated old session secrets | Sessions signed by removed keys fail verification. |
| Audit HMAC | `SQR_AUDIT_HMAC_KEY` | Annual, or immediately on compromise | No runtime previous-key env; preserve the old key only for offline audit verification | New audit entries can no longer be trusted if the key was exposed. |
| 2FA encryption | `TWO_FACTOR_ENCRYPTION_KEY` | 180 days, or immediately on compromise | `TWO_FACTOR_ENCRYPTION_KEY_PREVIOUS` during manual rotation | Stored TOTP secrets may require re-enrollment or controlled re-encryption. |
| Collection PII encryption | `COLLECTION_PII_ENCRYPTION_KEY` | Annual, or within 24 hours of suspected exposure | `COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS` during rewrite window | PII shadow columns and encrypted backup payloads may require re-encryption or controlled restore. |
| Backup encryption | `BACKUP_ENCRYPTION_KEY`, `BACKUP_ENCRYPTION_KEYS`, `BACKUP_ENCRYPTION_KEY_ID` | Annual, or immediately on compromise | Keep old key IDs in `BACKUP_ENCRYPTION_KEYS` until all dependent backups expire | Backups encrypted with removed keys cannot be restored. |

## Generate Key Material

Use a trusted operator machine or secret manager generator:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Use a distinct value per key family and per environment. Do not reuse
`SESSION_SECRET` as the 2FA, PII, audit HMAC, or backup encryption key.

## Rotation Schedule

The source of truth for last-rotated and next-due dates is the operations
rotation register, not this Git-tracked file. This keeps operational dates
accurate without creating noisy commits or exposing incident timing.

| Key family | Target cadence | Register fields required |
| --- | --- | --- |
| Session signing | Every 90 days | environment, rotation owner, reviewer, deployed version, login/logout verification |
| 2FA encryption | Every 180 days | environment, affected users, verification user, support notice status |
| Collection PII encryption | Every 365 days | environment, `collection:pii-status` output, re-encryption command output, restore-test result |
| Backup encryption | Every 365 days | environment, active key ID, previous key IDs retained, new backup restore test, old backup restore test |
| Audit HMAC | Every 365 days | environment, rotation boundary timestamp, offline verification key location, audit reviewer |

## SESSION_SECRET Rotation

Use this path for a zero-downtime planned rotation.

1. Generate a new session secret with at least 32 bytes of entropy.
2. Move the current `SESSION_SECRET` value into `SESSION_SECRET_PREVIOUS`.
3. Set `SESSION_SECRET` to the generated value.
4. Deploy or restart every application worker in the same maintenance window.
5. Verify:

```bash
npm run smoke:preflight
npm run smoke:local
```

6. Validate login, logout, a CSRF-protected mutation, and a WebSocket-protected
   page in the target environment.
7. Keep `SESSION_SECRET_PREVIOUS` only for the intended session TTL
   compatibility window.
8. Remove the old value from `SESSION_SECRET_PREVIOUS`, restart all workers, and
   re-run the verification checks.

Emergency rotation for suspected compromise:

1. Generate a new `SESSION_SECRET`.
2. Set `SESSION_SECRET_PREVIOUS=` empty.
3. Deploy or restart immediately.
4. Expect all active sessions to be rejected and users to log in again.
5. Review auth logs for unusual activity before and after the rotation boundary.

Rollback:

- If the new secret was staged incorrectly and the old value is not
  compromised, restore the old `SESSION_SECRET` or add it to
  `SESSION_SECRET_PREVIOUS`, restart all workers, then verify login/logout.
- If the old value is compromised, do not roll back to it.

## RS256 Session JWT Migration

Production signs new session JWTs with RS256 and rejects legacy HS256 tokens by
default. For a planned migration only, set
`SESSION_JWT_LEGACY_HS256_VERIFY_UNTIL` to an ISO 8601 timestamp with timezone.
The deadline must be no more than seven days after startup and should normally
match one existing session TTL.

1. Install the matching `SESSION_JWT_PRIVATE_KEY` and `SESSION_JWT_PUBLIC_KEY`.
2. Set a short `SESSION_JWT_LEGACY_HS256_VERIFY_UNTIL` deadline only if active
   HS256 sessions must drain without an immediate logout.
3. Restart every worker and confirm the migration warning contains the expected
   deadline but no token or key material.
4. After the deadline, remove the variable and restart all workers.
5. Verify login, refresh, logout, and WebSocket reconnection. Legacy HS256
   attempts should increment the rejection metric rather than authenticate.

Emergency response: leave the deadline blank, rotate compromised session
secrets, and expect existing HS256 sessions to require login again.

## TWO_FACTOR_ENCRYPTION_KEY Rotation

This is not a pure zero-downtime data rewrite. The runtime can decrypt with
`TWO_FACTOR_ENCRYPTION_KEY_PREVIOUS` during a manual compatibility window, but
this repository does not currently include a dedicated bulk 2FA re-encryption
script. Do not reference or run an untested migration script for this key.

Planned rotation:

1. Announce the maintenance/support window for users with 2FA enabled.
2. Generate a new `TWO_FACTOR_ENCRYPTION_KEY`.
3. Move the current key into `TWO_FACTOR_ENCRYPTION_KEY_PREVIOUS`.
4. Set the generated value as `TWO_FACTOR_ENCRYPTION_KEY`.
5. Deploy or restart every application worker.
6. Verify login with an already-enrolled 2FA user.
7. Verify a new 2FA setup and confirmation flow.
8. Monitor failed 2FA verification and support requests.
9. Remove old values from `TWO_FACTOR_ENCRYPTION_KEY_PREVIOUS` only after the
   compatibility or re-enrollment window is complete.

Emergency rotation:

- If the old 2FA encryption key may be compromised, clear
  `TWO_FACTOR_ENCRYPTION_KEY_PREVIOUS`, deploy immediately, and require affected
  users to re-enroll 2FA from a trusted session.

Rollback:

- If the old key is not compromised and legitimate users cannot verify 2FA,
  restore the old key as active or keep it in
  `TWO_FACTOR_ENCRYPTION_KEY_PREVIOUS`, restart all workers, and verify login
  with an enrolled 2FA account.

## COLLECTION_PII_ENCRYPTION_KEY Rotation

Collection PII rotation requires a controlled rewrite window and verification.
Use the existing scripts; do not invent a one-off rotation script.

Planned rotation:

1. Confirm a recent database backup exists and is restore-tested in staging.
2. Generate a new `COLLECTION_PII_ENCRYPTION_KEY`.
3. Move the current key into `COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS`.
4. Set the generated value as `COLLECTION_PII_ENCRYPTION_KEY`.
5. Deploy or restart every application worker.
6. Measure the current state:

```bash
npm run collection:pii-status
npm run collection:rollout-readiness
```

7. Re-encrypt encrypted shadow columns with the active key:

```bash
npm run collection:reencrypt-pii
npm run collection:reencrypt-pii -- --apply
```

8. For staged sensitive-field rollout, use the narrower commands first:

```bash
npm run collection:reencrypt-sensitive-pii
npm run collection:reencrypt-sensitive-pii -- --apply
npm run collection:verify-pii-sensitive-retirement
```

9. Re-run:

```bash
npm run collection:pii-status
```

10. Verify collection create, edit, list, summary, backup export, and backup
    restore flows.
11. Keep `COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS` only while older encrypted
    rows and backups are being rewritten or phased out.
12. Remove the old value from `COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS`, restart
    all workers, and verify again.

Emergency rotation:

- If the old key may be compromised, clear
  `COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS`, deploy immediately, and treat
  encrypted-only data that still depends on the old key as inaccessible until it
  can be handled in a controlled recovery environment.

Rollback:

- If the old key is not compromised and reads fail after deployment, restore it
  as active or keep it in `COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS`, restart all
  workers, and re-run `npm run collection:pii-status`.

## BACKUP_ENCRYPTION_KEY Rotation

Prefer the key-ring form for rotation:

```text
BACKUP_ENCRYPTION_KEYS=primary:<base64-key>,previous:<base64-key>
BACKUP_ENCRYPTION_KEY_ID=primary
```

Planned rotation:

1. Generate a new 32-byte backup encryption key.
2. Add it to `BACKUP_ENCRYPTION_KEYS` with a new key ID.
3. Keep old key IDs in `BACKUP_ENCRYPTION_KEYS` while any backup encrypted with
   those keys is still inside the retention window.
4. Set `BACKUP_ENCRYPTION_KEY_ID` to the new key ID.
5. Deploy or restart every application worker.
6. Create a new backup.
7. Restore-test the new backup.
8. Restore-test at least one older backup encrypted with the previous key ID.
9. Store any retired keys needed for cold backup recovery in the approved
   secure vault, with owner and expiry recorded in the rotation register.
10. Remove old key IDs only after dependent backups have expired or have been
    re-encrypted by an approved process.

Emergency rotation:

- If a backup key may be compromised, create a new key ID immediately, keep
  uncompromised old keys only as long as required for restore, and review backup
  access logs for unauthorized reads.

Rollback:

- Keep old key IDs in `BACKUP_ENCRYPTION_KEYS` instead of reverting the active
  key ID unless the new key cannot create or restore backups.

## SQR_AUDIT_HMAC_KEY Rotation

`SQR_AUDIT_HMAC_KEY` protects tamper-evident audit entries. There is no runtime
previous-key environment variable for this key, so rotation creates a
verification boundary.

Planned rotation:

1. Export or snapshot audit verification metadata before rotation.
2. Generate a new `SQR_AUDIT_HMAC_KEY`.
3. Store the old key in the approved offline vault for historical audit
   verification only.
4. Update the deployment secret store with the new key.
5. Deploy or restart every application worker.
6. Verify that new audit entries are produced and can be verified with the new
   key.
7. Record the rotation boundary timestamp and old-key vault reference in the
   rotation register.

Emergency rotation:

- If the old audit HMAC key may be compromised, rotate immediately, preserve the
  old key only if legal/audit requirements demand historical verification, and
  mark the affected time range for security review.

Rollback:

- Do not roll back to a compromised audit HMAC key. If the new key was staged
  incorrectly, deploy another newly generated key and record the failed
  boundary.

## Emergency Rotation Checklist

Use this when any key may be exposed, leaked to logs, committed, copied into a
ticket, or retrieved by an unauthorized party.

1. Identify the key family and environment.
2. Stop new exposure first: disable leaked CI variables, restrict server access,
   or revoke provider credentials as applicable.
3. Generate replacement key material.
4. Apply the emergency path for the affected key family.
5. Restart all workers that consume the key.
6. Verify the affected feature.
7. Run repository and dependency safety checks where applicable:

```bash
npm run verify:repo-hygiene
npm run verify:secrets
npm run audit:dependencies
```

8. Review audit, auth, backup, and operational logs around the suspected
   exposure window.
9. Open an incident record using `docs/INCIDENT_RESPONSE_SECRET_LEAK.md`.
10. Record the new rotation boundary in the operations rotation register.

## Verification Matrix

| Key family | Required verification |
| --- | --- |
| Session signing | Login, logout, CSRF-protected mutation, session rejection after emergency rotation |
| 2FA encryption | Existing enrolled user login, new enrollment, failed-code lockout behavior |
| Collection PII encryption | `collection:pii-status`, re-encryption dry run, apply output, collection CRUD, backup export and restore |
| Backup encryption | New backup restore, previous-key backup restore, missing-key failure path |
| Audit HMAC | New audit entry written, verification boundary recorded, old key stored only for offline historical verification |

## Related Documents

- [SECRET_ROTATION.md](SECRET_ROTATION.md)
- [INCIDENT_RESPONSE_SECRET_LEAK.md](INCIDENT_RESPONSE_SECRET_LEAK.md)
- [SMTP_SECRET_INCIDENT_RESPONSE.md](SMTP_SECRET_INCIDENT_RESPONSE.md)
- [DISASTER_RECOVERY_DRILL.md](DISASTER_RECOVERY_DRILL.md)
- [GO_LIVE_LAUNCH_CHECKLIST.md](GO_LIVE_LAUNCH_CHECKLIST.md)
