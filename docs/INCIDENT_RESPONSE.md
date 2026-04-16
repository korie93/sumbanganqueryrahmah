# Incident Response

Panduan ini meliputi tindak balas awal untuk insiden production yang paling relevan kepada repo ini.

## First 15 Minutes

1. Kenal pasti skop: auth, upload/import, AI, backup/restore, atau infra.
2. Semak `GET /api/health/ready` dan log berstruktur semasa.
3. Bekukan rollout atau deploy baharu sehingga punca lebih jelas.
4. Jika insiden melibatkan secret atau cookie/session integrity, mulakan rotation segera.

## Containment Priorities

- Untuk auth/session abuse: tamatkan sesi aktif yang terjejas, audit akaun privileged, dan semak 2FA enforcement.
- Untuk upload/import abuse: hentikan flow import berkaitan dan semak quarantine/log validation.
- Untuk runtime degradation: semak pool pressure, timeout warnings, stale conflict snapshots, dan alert incidents.
- Untuk secret exposure: ikut prosedur rotation dan sejarah git yang sudah didokumenkan.

## Evidence to Preserve

- request id berkaitan
- structured logs yang terjejas
- alert/timing snapshots
- sample payload atau filename yang sudah disanitasi
- commit/deploy window yang memperkenalkan perubahan

## Recovery

- sahkan health endpoint kembali stabil
- jalankan smoke flow yang berkaitan dengan insiden
- sahkan no-regression pada auth/upload/backup path yang disentuh
- dokumentasikan root cause, containment, remediation, dan follow-up backlog
