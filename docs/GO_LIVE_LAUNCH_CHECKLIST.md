# Go-Live Launch Checklist

This checklist is the final gate before controlled production launch.

## Phase 1: Production Safety Gate

- [ ] Environment validation passes in production-like mode.
- [ ] Missing critical secrets fail fast at startup.
- [ ] `BACKUP_ENCRYPTION_KEY` (or `BACKUP_ENCRYPTION_KEYS`) is configured when backups are enabled.
- [ ] Dev-only bootstrap/mail-preview behavior is disabled in production-like mode.
- [ ] Session/auth cookie configuration is production-safe.
- [ ] Backup routes are superuser-protected.
- [ ] Audit-log routes are superuser-protected.
- [ ] Receipt preview/download access is ownership-safe.

## Phase 2: Critical Business Flow Gate

- [ ] Create collection record updates daily/summary/nickname outputs correctly.
- [ ] Edit amount updates all affected totals correctly.
- [ ] Edit payment date updates day/month buckets correctly.
- [ ] Reassign nickname/staff updates old/new totals correctly.
- [ ] Delete record removes totals correctly and does not leave stale summary values.
- [ ] Monthly target is a hard ceiling in Collection Daily expected-progress math.
- [ ] Remaining target always equals `monthlyTarget - collectedToDate` (bounded at `>= 0`).
- [ ] Receipt upload/preview/download works and remains access-controlled.

## Phase 3: Runtime Stability Gate

- [ ] No critical console/server errors during smoke and staging soak flows.
- [ ] No obvious memory growth from repeated modal/viewer open-close cycles.
- [ ] Pagination/caps are active for heavy endpoints.
- [ ] Conflict handling (`COLLECTION_RECORD_VERSION_CONFLICT`) is visible and user-safe.
- [ ] 429 pressure and alert levels are within acceptable operating range.

## Required Automated Commands

Run locally before promotion:

```bash
npm run release:verify:local
```

Run optional continuous monitor during canary:

```bash
MONITOR_LOOP=1 MONITOR_INTERVAL_MS=60000 npm run monitor:stale-conflicts
```

## Required Staging Soak (Manual, 30-60 min)

Run two tabs in parallel and repeat:

1. create record (with and without receipt)
2. edit amount
3. edit payment date (including cross-month)
4. reassign nickname/staff
5. delete record

Verify after each step:

- Collection Daily is correct
- Collection Summary is correct
- Nickname Summary is correct
- no duplicate counting
- no hard refresh needed for correctness

## Go / No-Go Decision

Go only if all checks above are green.

No-Go if any of the following occur:

- access-control bypass or unsafe route exposure
- summary/target drift after mutations
- receipt ownership/control regression
- sustained 429/error spikes during soak/canary
- backup integrity/restore drill failure

## Post-Launch First Tasks

- Monitor stale conflict frequency and 429 pressure for first 24-72h.
- Track collection mutation error rates and failed auth rates.
- Re-run disaster-recovery drill on schedule.
- Keep rollback plan and previous stable release ready.
