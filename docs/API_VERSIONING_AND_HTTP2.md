# API Versioning and HTTP/2 Notes

## Current API Version Signal

SQR currently exposes `API-Version: 1` on HTTP responses. Treat this as an
observability and compatibility signal, not a full version-negotiation layer.
Existing clients should continue using the current `/api/...` routes until a
formal versioned contract is introduced.

## Header-Based Versioning Plan

Use header-based versioning for future breaking API changes:

1. Keep `/api/...` route paths stable for minor additive changes.
2. Introduce an explicit request header such as `API-Version: 2` only for
   breaking response or validation changes.
3. Keep old and new serializers side by side during a migration window.
4. Add contract tests for every supported version before enabling the new
   default.
5. Remove old versions only through a dated deprecation note and release gate.

Do not rely on CORS or browser origin checks as API versioning controls. Version
selection must be explicit and authenticated routes must remain protected by the
normal auth, CSRF, and rate-limit layers.

## HTTP/2 Deployment

The Node/Express app remains an HTTP/1.1 upstream behind Nginx. Public HTTP/2 is
enabled at the reverse proxy layer with:

```nginx
listen 443 ssl http2;
listen [::]:443 ssl http2;
```

Keep TLS termination, HSTS, and compression behavior aligned between Nginx and
the Express/Helmet layer. Re-test uploads, WebSockets, CSP reports, and auth
cookies after any reverse-proxy HTTP/2 configuration change.
