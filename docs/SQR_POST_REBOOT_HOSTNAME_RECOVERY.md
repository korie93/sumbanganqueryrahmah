# PostgreSQL hostname recovery, 12 September 2026

Recovered at10:31:28UTC /18:31:28Malaysia after explicit user approval. This was
a separate pre-existing outage detected before the final Nginx change.

## Cause and minimal correction

After the09:15UTC boot, cloud-init-managed `/etc/hosts` mapped `vultr.guest vultr`
to127.0.1.1. PostgreSQL16main listened on127.0.0.1:5432 and::1:5432, while the
application's live/saved/dotenv PG_HOST was `vultr.guest`. TCP was refused before
database authentication, producing repeated application startup failures and502.
The previous mapping and its author are not proven by these observations.

The user approved a backed-up durable mapping correction while preserving TLS.
Only these exact lines changed:

| File | Before | After |
| --- | --- | --- |
| `/etc/cloud/templates/hosts.debian.tmpl` | `127.0.1.1 {{fqdn}} {{hostname}}` | `127.0.0.1 {{fqdn}} {{hostname}}` |
| `/etc/hosts` | `127.0.1.1 vultr.guest vultr` | `127.0.0.1 vultr.guest vultr` |

All other bytes, aliases, localhost/IPv6 entries and permissions were preserved.
The active merged cloud-init configuration has `manage_etc_hosts=true` and uses
the Debian template under `/etc/cloud/templates`. The installed cloud-init
renderer reproduced the old hosts file exactly, then the reviewed candidate
exactly; after apply its native rendering again matched the actual hosts file.
No reboot was performed solely to test this. Future template/package changes
should retain and recheck this mapping; no promise of immunity to later edits.

No PG_HOST, password, certificate, TLS verification, PostgreSQL listener,
Redis configuration, cloud-init management mode, PM2 definition or app release
was changed. No manual app/database restart, migration, financial test mutation
or upload deletion was performed. PM2's existing retry recovered naturally.

## Backup, verification and rollback

Backup: `/var/backups/sqr-host-recovery-20260912T103128Z` (root-only0700), containing
both original files with preserved ownership/mode/timestamps and an audit.json.
Both backup hashes and metadata were verified before the template-first,
hosts-second atomic writes. Helper:
`/home/deploy/sqr-nat-preflight-20260910/sqr-hosts-recovery.cjs`, SHA256
`22c99418ed8a1a4fe6e1b9006d2b267b8c360fad4212e46aeead30d7ebadb68d`.
Independent review, syntax and exact-transform self-tests passed. Reviewed plan:
`ee18644235d8e1e17e7c424cab18f66fb870c18565a330a7e217d853a84b8e1c`.

| File | Original SHA256 | Applied SHA256 |
| --- | --- | --- |
| Template | `809caec424db135edb695095a4d3bd17cf755c9179c1a639ae56155315767d00` | `70a967438b2b7b59913d314bf38a95a5933927c426226c152590b9b5617b1fdc` |
| Hosts | `b9e291b9b7bd3f292f5afd8e690cf469cc0dccfa3db660d20e9cd7f779e5dbbf` | `9cc4ade991ee8c0ab4c5647c2a2dd49ed58e86246bf8c3f07deb32f80a0d26cc` |

Verification used the actual configured hostname, existing CA and
rejectUnauthorized=true: PostgreSQLTLS1.3 authentication and read-only SELECT1
passed. DNS for both aliases resolves only127.0.0.1. Local/public readiness and
`/api/health/version` returned200 with exact deployedSHA62cbe7aa. PID7092 remained
online at240restarts through10:36:28UTC; RedisTLS/PONG passed. The first probe
before app startup completed could not connect; a diagnostic's initial incorrect
`/api/version` path gave404 and was corrected to the actual health/version route.
Neither transient probe was counted as a passing application-health check.

Rollback requires fresh authorized access, verified helper and unchanged known
file hashes: `sudo node /home/deploy/sqr-nat-preflight-20260910/sqr-hosts-recovery.cjs --rollback /var/backups/sqr-host-recovery-20260912T103128Z`.
This restores the known bad hostname mapping; use only for deliberate recovery,
not routine operation. It does not restore database contents or certificates.

The final Nginx rollout followed only after baseline readiness recovered; see
[Nginx evidence](SQR_NGINX_IMPORT_READ_ROLLOUT.md). Temporary SSH access has been
revoked and its local key pair deleted; the user's other key was retained.
