# Data Retention Policy

This policy describes SQR operational data retention defaults. It is an
engineering baseline, not legal advice. Production operators must align final
retention windows with the governing Malaysian privacy, financial and audit
requirements for their organization.

## Data Categories

| Category | Examples | Default retention | Notes |
| --- | --- | --- | --- |
| User accounts | username, role, status, 2FA metadata | Life of account plus audit window | Disable before delete when audit continuity is needed. |
| Sessions and activities | active activity rows, tab/device metadata | Until logout, expiry or idle sweeper cleanup | Idle sweeper expires inactive sessions automatically. |
| Collection records | collection amount, date, customer/account references, receipt metadata | Operational lifetime plus audit window | Sensitive collection PII should use encrypted shadow columns when configured. |
| Receipt uploads | receipt images and scan metadata | Same as owning collection record unless separately purged | External malware scanning must be enabled in production-like deployments. |
| Imports and data rows | imported source rows, mapping metadata | Operational lifetime or until manual import deletion | Large imports should be deleted when no longer needed for reconciliation. |
| AI/search artifacts | embeddings, conversations, search cache | Shortest practical operational window | Do not place secrets, tokens or unnecessary PII in prompts. |
| Audit logs | auth/admin/security actions | Longer than operational records, commonly 1-7 years | Keep immutable where possible. |
| Backups | encrypted backup blobs and metadata | According to backup policy, usually rolling windows | Backup keys must remain available until encrypted backups expire. |
| Telemetry | Web Vitals and CSP aggregate reports | Short operational window | Do not store user PII or auth identifiers in telemetry payloads. |
| Logs | structured app, PM2, Nginx and database logs | Environment-specific, commonly 30-180 days | Logs must not contain raw secrets, tokens or decrypted PII. |

## Automated Deletion Mechanisms

- Idle sessions are expired by `server/internal/idle-session-sweeper.ts`.
- Runtime caches and telemetry drop guards use bounded TTL/window-based storage.
- Session revocation, 2FA replay and adaptive rate limit state use TTL-backed
  storage in shared Redis deployments.
- Collection PII retirement scripts can redact plaintext fields once encrypted
  shadow columns are verified.

## Manual Deletion Procedures

Before deleting operational records:

1. Confirm the requester and authorization path.
2. Export or snapshot any required audit evidence.
3. Remove dependent records through the application flow or repository method,
   not ad hoc SQL, unless an approved migration/runbook requires it.
4. Verify search indexes, rollups, backups and cached views are refreshed or
   invalidated.
5. Record the deletion action in an audit log or incident ticket.

## Account Closure

For user account closure:

1. Disable the account first to stop login and session refresh.
2. Revoke active sessions and JWT IDs.
3. Expire open activities and WebSocket sessions.
4. Retain the minimum identity fields required for audit attribution if policy
   requires historical admin/action traceability.
5. Delete or anonymize optional profile fields when no longer required.

## Collection PII Retirement

Use the staged scripts documented in `docs/SECRET_ROTATION.md` when retiring or
redacting collection PII:

```bash
npm run collection:pii-status
npm run collection:verify-pii-sensitive-retirement
npm run collection:redact-sensitive-plaintext-pii -- --apply
```

Only set `COLLECTION_PII_RETIRED_FIELDS` after verification shows zero
plaintext, zero redactable legacy rows and zero pending rewrite work for those
fields.

## Backup Retention

- Keep `BACKUP_ENCRYPTION_KEYS` entries for every backup still inside the
  retention window.
- Restore-test backups after key rotation.
- Delete expired backup blobs and metadata together.
- Never store backup encryption keys inside backup artifacts.

## Compliance Notes

Production operators should map this policy to their organization-specific
requirements for:

- Malaysian Personal Data Protection Act (PDPA) obligations
- financial recordkeeping requirements
- internal audit evidence retention
- breach/incident notification timelines
- customer deletion or correction requests

When legal retention conflicts with deletion requests, preserve the minimum
fields required by law or audit policy and document the exception.

## Review Cadence

Review this policy at least every six months and after any material schema,
backup, PII encryption, audit logging or data import change.
