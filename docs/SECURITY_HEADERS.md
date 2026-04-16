# Security Headers

Dokumen ini merakam keputusan security-header yang kini benar-benar diaktifkan dalam app.

## HSTS Preload

Server kini menghantar `Strict-Transport-Security` dengan:

- `max-age=15552000`
- `includeSubDomains`
- `preload`

Ini ialah keputusan yang kuat dan hanya selamat jika:

- semua production domains sentiasa HTTPS
- semua subdomains production juga sentiasa HTTPS
- tiada keperluan untuk melayan traffic HTTP biasa pada mana-mana subdomain production

Jika deployment tidak lagi memenuhi syarat ini, keluarkan app daripada HSTS preload list dan semak semula header ini sebelum sebarang rollback ke HTTP.

## CSP dan Trusted Types

App juga menguatkuasakan:

- CSP `script-src 'self'`
- `script-src-attr 'none'`
- `require-trusted-types-for 'script'`
- Trusted Types policy `sqr`

Ini disengajakan untuk mengurangkan sink DOM berisiko tinggi. Sebarang perubahan kepada lazy loaders, export helpers, atau chart styling perlu mengekalkan model ini.
