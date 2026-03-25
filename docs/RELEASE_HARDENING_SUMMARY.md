# Release Hardening Summary

Use this document together with:

- `docs/GO_LIVE_LAUNCH_CHECKLIST.md`
- `docs/PRODUCTION_PROMOTION_PLAYBOOK.md`
- `docs/QA_FINAL_CHECKLIST.md`

This summary is a short release-oriented view of the hardening work completed on the current build.

## 1. What Was Hardened

### Backend

- runtime config validation now fails early for unsafe or incomplete startup configuration
- health endpoints distinguish live vs ready state
- critical collection mutations have stronger duplicate-submit and idempotency protection
- receipt runtime flow is aligned to `collection_record_receipts` as the authoritative relation
- receipt upload/view/download paths were hardened for safer validation and access behavior
- backup jobs now survive process restarts more safely through persistent job tracking
- permission enforcement for sensitive routes was tightened further on backend routes
- schema governance was normalized through reviewed migrations across the main domains

### Frontend

- heavy report and collection views now use more bounded cache, abort cleanup, and request guards
- receipt, viewer, export, AI, monitor, activity, import, saved-imports, and backup flows were hardened against overlapping work
- login, heartbeat, activation, and password-change flows now clean up in-flight requests and redirect timers more safely
- route-level boundaries and shared mutation feedback were improved for more predictable recovery UX

## 2. Controlled Rollout Checklist

Run these in order.

### A. Pre-deploy

- [ ] confirm `.env` values are complete and production-safe
- [ ] confirm PostgreSQL credentials and backup encryption config are correct
- [ ] confirm `PUBLIC_APP_URL`, cookie config, and CORS origins match deployment
- [ ] confirm latest reviewed migrations are committed and present in `drizzle/`

### B. Staging Verification

- [ ] run `npm run db:migrate`
- [ ] run `npm run release:verify:local`
- [ ] deploy to staging
- [ ] verify `GET /api/health/live`
- [ ] verify `GET /api/health/ready`

### C. Smoke Flows In Staging

- [ ] login
- [ ] logout
- [ ] force logout / session replacement behavior
- [ ] activate account
- [ ] password change
- [ ] create collection record without receipt
- [ ] create collection record with receipt
- [ ] replace receipt
- [ ] remove receipt
- [ ] edit amount
- [ ] edit payment date including cross-month
- [ ] reassign nickname/staff
- [ ] delete record if supported
- [ ] open Collection Daily, Collection Summary, and Nickname Summary after each mutation
- [ ] verify backup create and backup restore queue behavior

### D. Canary / Initial Production Window

- [ ] deploy to controlled slice first
- [ ] monitor logs for request-id correlated errors
- [ ] monitor memory while repeating receipt preview and viewer flows
- [ ] monitor stale conflict and 429 pressure
- [ ] verify no repeated auth loop or forced logout regression
- [ ] verify no summary drift after live collection mutations

## 3. Minimum Commands

```bash
npm run db:migrate
npm run release:verify:local
npm run monitor:stale-conflicts
```

Optional continuous watch during canary:

```bash
MONITOR_LOOP=1 MONITOR_INTERVAL_MS=60000 npm run monitor:stale-conflicts
```

## 4. High-Risk Areas To Watch First

These are the first places to inspect if production behavior looks wrong.

- auth lifecycle: login, forced logout, activation, password reset, password change
- collection totals after create/edit/reassign/date move/delete
- receipt replace/remove behavior on old records
- backup queue status after restart or failed restore attempt
- report and export flows under repeated user interaction
- monitor/activity pages with polling active for longer sessions

## 5. No-Go Signals

Do not continue rollout if any of these appear.

- collection totals drift between Daily, Summary, and Nickname Summary
- receipt preview/download ownership regression
- repeated 5xx on collection, auth, or backup routes
- sustained 429 spikes or unusually high stale-conflict rate
- auth loop, invalid forced logout, or account lifecycle regression
- memory growth that does not settle after repeated viewer or receipt cycles

## 6. Immediate Rollback Decision

Rollback quickly if the issue affects:

- auth access
- collection correctness
- receipt visibility or ownership safety
- backup integrity

After rollback:

1. verify login
2. verify collection create/edit/delete
3. verify receipt preview/download
4. verify backup status endpoints
5. inspect request-id correlated logs before re-promoting
