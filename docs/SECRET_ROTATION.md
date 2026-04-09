# Secret Rotation Runbook

Use this runbook when rotating production secrets for SQR. Keep real values in
the deployment secret store only. Do not paste secrets into tickets, commits,
chat logs, CI logs, or screenshots.

## Scope

This covers:

- `SESSION_SECRET`
- `SESSION_SECRET_PREVIOUS`
- `TWO_FACTOR_ENCRYPTION_KEY`
- `COLLECTION_PII_ENCRYPTION_KEY`
- `COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS`
- `BACKUP_ENCRYPTION_KEY`
- `BACKUP_ENCRYPTION_KEYS`
- `BACKUP_ENCRYPTION_KEY_ID`
- SMTP credentials
- external API keys such as AI/provider credentials

## Generate New Secrets

Use one of these commands on a trusted operator machine:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Store the generated value in the production secret manager or private server
environment file only.

## `SESSION_SECRET`

`SESSION_SECRET` signs session JWTs. New sessions are always signed with the
active `SESSION_SECRET`. Existing sessions can remain valid during a planned
rotation window through `SESSION_SECRET_PREVIOUS`.

### Planned Rotation

1. Generate a new `SESSION_SECRET`.
2. Move the current `SESSION_SECRET` into `SESSION_SECRET_PREVIOUS`.
3. Set the generated value as the new `SESSION_SECRET`.
4. Deploy or restart all app processes together.
5. Verify login, logout, WebSocket connection, and protected API access.
6. Keep `SESSION_SECRET_PREVIOUS` only for the intended session TTL window.
7. Remove the old value from `SESSION_SECRET_PREVIOUS`.
8. Redeploy or restart all app processes.

### Emergency Rotation

If the old secret may be compromised, skip the compatibility window:

1. Generate a new `SESSION_SECRET`.
2. Set `SESSION_SECRET_PREVIOUS=` empty.
3. Deploy or restart immediately.
4. Expect all existing sessions to be logged out.
5. Verify login and account recovery flows.

Never include the active secret in `SESSION_SECRET_PREVIOUS`; startup safety
guards reject that configuration.

## `TWO_FACTOR_ENCRYPTION_KEY`

`TWO_FACTOR_ENCRYPTION_KEY` encrypts stored TOTP secrets. The current runtime
uses the configured key for both encryption and decryption, so rotation is more
sensitive than session secret rotation.

### Safe Options

- Preferred: add a dedicated migration/re-encryption task before rotating this
  key.
- Emergency: disable and re-enroll 2FA for affected users after replacing the
  key.

### Planned Rotation Requirements

Do not replace `TWO_FACTOR_ENCRYPTION_KEY` in production unless one of these is
true:

- all encrypted 2FA secrets have been re-encrypted with the new key, or
- affected users have had 2FA disabled and will re-enroll.

After rotation, verify:

- starting 2FA setup works
- confirming 2FA setup works
- login with 2FA works for a re-enrolled user
- disabling 2FA works

## `COLLECTION_PII_ENCRYPTION_KEY`

`COLLECTION_PII_ENCRYPTION_KEY` encrypts the collection PII shadow columns used
for at-rest protection. The runtime now supports a manual compatibility window
through `COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS` for decryption only.

### Planned Rotation

1. Generate a new `COLLECTION_PII_ENCRYPTION_KEY`.
2. Move the current key into `COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS`.
3. Set the generated value as the new `COLLECTION_PII_ENCRYPTION_KEY`.
4. Deploy or restart all app processes together.
5. Run `npm run collection:pii-status` to measure remaining plaintext,
   redactable rows, and shadow-column rewrite work. You can add `-- --json`
   for machine-readable output.
6. Optional before the apply steps: run
   `npm run collection:rollout-readiness` for a single staged-readiness view
   that highlights the sensitive-field gate, any configured retired-field gate,
   and the next recommended command.
7. Optional for the first staged rollout: run
   `npm run collection:retire-sensitive-pii`, then
   `npm run collection:retire-sensitive-pii -- --apply`, to combine the
   sensitive-field readiness check and plaintext redaction into one guarded
   flow. This command exits early if rewrite work is still pending.
8. Run `npm run collection:reencrypt-pii` to measure how many rows still need
   shadow-column rewrites, then run
   `npm run collection:reencrypt-pii -- --apply` to re-encrypt them with the
   active key. For the staged sensitive rollout, you can scope this to
   `icNumber`, `customerPhone`, and `accountNumber` with
   `npm run collection:reencrypt-sensitive-pii`, then
   `npm run collection:reencrypt-sensitive-pii -- --apply`.
9. Optional after rollout verification: run
   `npm run collection:redact-sensitive-plaintext-pii`, then
   `npm run collection:redact-sensitive-plaintext-pii -- --apply`, to clear
   historical plaintext for `icNumber`, `customerPhone`, and `accountNumber`
   first. This now writes `NULL`, not empty strings, for retired plaintext.
   New writes and restore flows already store collection PII encrypted-first
   when `COLLECTION_PII_ENCRYPTION_KEY` is active, so this task mainly retires
   historical plaintext.
10. After the sensitive fields are clean, run
   `npm run collection:redact-plaintext-pii`, then
   `npm run collection:redact-plaintext-pii -- --apply`, only when the team is
   ready to include `customerName` too and has confirmed the token-prefix
   blind-index search behavior is sufficient for live operations.
11. Re-run `npm run collection:pii-status` and confirm plaintext/redaction
   counts move in the expected direction before removing the previous key. For
   the first staged retirement gate, `npm run collection:verify-pii-sensitive-retirement`
   now fails if `icNumber`, `customerPhone`, or `accountNumber` still have
   plaintext, redactable legacy rows, or pending rewrite work.
12. Optional once a staged gate is clean: set
   `COLLECTION_PII_RETIRED_FIELDS=icNumber,customerPhone,accountNumber` to stop
   live read paths from falling back to plaintext for those fields. After full
   retirement is clean, you can extend this to
   `customerName,icNumber,customerPhone,accountNumber`.
   Startup now rejects this env if `COLLECTION_PII_ENCRYPTION_KEY` is missing.
   `npm run collection:verify-pii-retired-fields` now checks the exact env list
   before that rollout. You can also run
   `npm run collection:retire-retired-fields-pii`, then
   `npm run collection:retire-retired-fields-pii -- --apply`, to combine the
   env-scoped readiness check and plaintext redaction for the exact retired
   field list.
12. Verify collection create, edit, list, summary, backup export, and backup
    restore paths.
13. Keep `COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS` only for the intended
   compatibility window while older encrypted rows and backups are being
   rewritten or phased out.
14. Remove the old value from `COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS`.
15. Redeploy or restart all app processes.

### Emergency Rotation

If the old key may be compromised, skip the compatibility window:

1. Generate a new `COLLECTION_PII_ENCRYPTION_KEY`.
2. Set `COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS=` empty.
3. Deploy or restart immediately.
4. Expect encrypted-only historical values and encrypted-only backups that
   still depend on the old key to become unreadable until they are restored
   with the old key in a controlled environment.

Never include the active key in `COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS`;
startup safety guards reject that configuration.

## Backup Encryption Keys

Backups support key IDs through `BACKUP_ENCRYPTION_KEYS` and
`BACKUP_ENCRYPTION_KEY_ID`.

Recommended format:

```text
BACKUP_ENCRYPTION_KEYS=primary:<base64-key>,previous:<base64-key>
BACKUP_ENCRYPTION_KEY_ID=primary
```

### Planned Rotation

1. Generate a new 32-byte backup encryption key.
2. Add the new key to `BACKUP_ENCRYPTION_KEYS` with a new key ID.
3. Keep existing key IDs in `BACKUP_ENCRYPTION_KEYS` so older backups remain
   restorable.
4. Set `BACKUP_ENCRYPTION_KEY_ID` to the new key ID.
5. Deploy or restart all app processes.
6. Create a new backup.
7. Restore-test a backup encrypted with the new key.
8. Restore-test an older backup encrypted with the previous key.
9. Remove old keys only after every backup encrypted with them has expired or
   been re-encrypted.

If `BACKUP_ENCRYPTION_KEY_ID` references a missing key, startup fails.

## SMTP Credentials

For SMTP exposure or planned password rotation, follow:

```text
docs/SMTP_SECRET_INCIDENT_RESPONSE.md
```

Minimum planned rotation:

1. Create a new SMTP credential or app password at the mail provider.
2. Update `SMTP_USER` and `SMTP_PASSWORD` in the deployment secret store.
3. Deploy or restart the app.
4. Send a password-reset or activation test email.
5. Revoke the old SMTP credential.
6. Confirm mail delivery still works.

If SMTP credentials were ever committed, treat them as compromised even if later
removed from the working tree.

## External API Keys

For AI/provider credentials:

1. Create a new key in the provider console.
2. Add the new value to the deployment secret store.
3. Deploy or restart the app.
4. Verify the feature that uses the key.
5. Revoke the old key.
6. Review provider usage logs for unexpected access.

## Validation Commands

Run these before and after the change when possible:

```bash
npm run verify:repo-hygiene
npm run audit:dependencies
npm run typecheck
npm run build
```

For a full local release gate:

```bash
npm run release:verify:local
```

## Rollback

Rollback depends on the secret:

- `SESSION_SECRET`: restore the previous secret or add it to
  `SESSION_SECRET_PREVIOUS` if a compatibility window is acceptable.
- `TWO_FACTOR_ENCRYPTION_KEY`: restore the previous key unless all secrets were
  re-encrypted or users were re-enrolled.
- backup keys: keep old key IDs in `BACKUP_ENCRYPTION_KEYS`; do not remove keys
  required by existing backups.
- SMTP/API keys: restore the old key only if it was not compromised; otherwise
  create another new key.

After rollback, verify login, 2FA, backup create/restore, and mail delivery as
applicable.
