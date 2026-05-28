# Security

## Supported hardening posture

SQR is maintained as a strict-CSP, Trusted Types aware application. Security
changes should preserve the existing cookie flags, HSTS controls, CSRF defenses,
input validation, and production debug-route guards.

## 28 May 2026 audit controls

### Token comparison

Timing-sensitive token checks must use the central constant-time comparison
helper. Variable-length strings are hashed to fixed-size buffers before
comparison with `timingSafeEqual`.

### Report HTML rendering

Report popups must not use `document.write()`. Generated report HTML is
sanitized with DOMPurify before DOM insertion, executable tags and inline event
handlers are rejected, and report interactions are attached with DOM event
listeners after insertion.

### Email HTML

User-provided email template values must be escaped before interpolation.
URLs embedded in email HTML must pass the protocol allowlist and fall back to a
safe inert target when invalid.

### Session revocation and Redis degradation

Session revocation writes must be atomic. If Redis state cannot be confirmed
for a security decision, auth checks should fail closed and emit structured
metrics/logging without session IDs, tokens, or credentials.

### Batch authorization

Batch operations must perform per-item authorization before mutating state.
Responses must not disclose unauthorized resource IDs.

### Debug and operational routes

Debug and operations-only routes must stay unavailable in production. Runtime
guards should fail closed and tests should assert the production exclusion.

## Rollback guidance

Security rollback should be narrow. Revert only the commit that introduced a
regression, then run:

```sh
npm run typecheck
npm run lint:client
npm run test:client
npm run build
```

After rollback, validate login, CSRF-protected mutations, collection receipt
uploads, report popup generation, and email rendering before promoting the
artifact.
