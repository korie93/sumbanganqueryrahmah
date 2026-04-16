# Threat Model

Ringkasan threat model ini sengaja ringkas dan fokus pada permukaan serangan utama yang memang wujud dalam repo.

## Protected Assets

- sesi login, JWT, dan cookie auth
- data pengguna dan peranan akaun
- rekod collection, resit, dan fail import
- konfigurasi sistem, backup, dan restore
- telemetry dan signal operasi

## Main Threats

- credential stuffing, brute force, dan session takeover
- privilege escalation melalui route yang salah guard
- upload/import abuse, termasuk fail berbahaya atau payload besar
- XSS melalui sink DOM, export previews, atau rich UI helpers
- WebSocket abuse, reconnect races, dan flooding
- shutdown/timeout races yang menyebabkan state tergantung
- accidental secret leakage melalui git, logs, atau tooling

## Current Defenses

- role/tab guards dan mandatory 2FA untuk akaun privileged
- request timeout, adaptive rate limit, dan runtime monitor
- upload validation, receipt sanitization, dan quarantine flow
- CSP + Trusted Types + DOMPurify-backed sanitization
- WebSocket origin checks, rate limiting, dan cleanup hooks
- structured logging dengan redaction
- dependency audit, lint, smoke, dan contract verification

## Review Triggers

Threat model ini patut dikaji semula bila:

- auth/session model berubah
- domain/subdomain production berubah
- storage/upload flow baharu ditambah
- external AI/provider baharu diperkenalkan
- backup/restore contract berubah
