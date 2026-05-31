# Production Promotion Playbook

Use this playbook for final verification and controlled production promotion.

## 1. Required CI Gates (PR)

CI must pass on the PR branch:

- `npm run test:client`
- `npm run test:routes`
- `npm run smoke:ui`

These checks are enforced in:

- `.github/workflows/ci.yml`

## 2. Local Release Verification

Run the full local release gate:

```bash
npm run release:verify:local
```

This executes:

- client/routes/services tests
- build
- smoke preflight + UI smoke
- backup create/export integrity drill (`npm run dr:drill`)

Artifacts are written to:

- `artifacts/release-readiness-local`

## 3. Staging Soak (30-60 minutes)

Staging client builds must run with `DEPLOY_ENV=staging` or `APP_ENV=staging`.
Those markers intentionally disable Vite source maps, matching production
information-disclosure posture; use `VITE_ENABLE_SOURCEMAPS=1` only for local
development troubleshooting.

Use two tabs/sessions with the same month/staff scope and execute:

1. create record with and without receipt
2. edit amount
3. edit payment date (same month and cross-month)
4. reassign nickname/staff
5. delete record

Verify after each mutation:

- Collection Daily total is correct
- Collection Summary month totals are correct
- Nickname Summary totals are correct
- old bucket loses value and new bucket gains value
- no duplicate counting
- no hard refresh required for correctness

## 4. Runtime Monitoring During Soak and Canary

Single snapshot:

```bash
npm run monitor:stale-conflicts
```

Continuous polling:

```bash
MONITOR_LOOP=1 MONITOR_INTERVAL_MS=60000 npm run monitor:stale-conflicts
```

Track these signals:

- `collectionRecordVersionConflicts24h`
- `status429Count` (5s window)
- `errorRate`
- `activeAlertCount`

Suggested escalation thresholds:

- stale conflicts >= 20/24h
- 429 count >= 30/5s
- error rate >= 5%
- any active critical alert

## 5. Post-Deployment Health Gate

After each staging, canary, or production deploy, run the public health and
security-header gate from an operator machine or CI/CD deploy job that can reach
the promoted URL:

```bash
bash scripts/post-deploy-health-check.sh https://sqr-system.com
```

The script verifies the public liveness/readiness endpoints, app-owned security
headers, malformed-login rejection, and HTTPS HSTS posture. The optional login
burst probe is disabled by default to avoid noisy production auth attempts; run
it only during a controlled window:

```bash
SQR_POST_DEPLOY_RATE_LIMIT_PROBE=1 \
  bash scripts/post-deploy-health-check.sh https://sqr-system.com
```

Do not mark a deploy complete while this script exits non-zero.

## 6. Canary and Rollback

Canary rollout steps:

1. deploy to staging and run soak
2. deploy to production canary slice
3. monitor for at least 30 minutes
4. promote only when signals are stable

Rollback triggers:

- sustained 429 spikes
- elevated conflict frequency with user impact
- summary mismatch or receipt access regression
- repeated 5xx on collection/report routes

Rollback action:

1. revert to previous stable release
2. verify login + collection + summary + receipt flows
3. keep canary disabled until root cause is confirmed

## 7. Go / No-Go

Go only if all are true:

- CI gates are green
- local release verification is green
- staging soak passes without data drift
- post-deployment health gate passes for the promoted URL
- canary monitoring signals are stable

Otherwise: no-go and rollback/fix first.

Companion checklist:

- `docs/GO_LIVE_LAUNCH_CHECKLIST.md`
