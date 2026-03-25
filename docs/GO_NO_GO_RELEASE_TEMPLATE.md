# Go / No-Go Release Template

Use this template during the actual release window.

Companion docs:

- `docs/RELEASE_HARDENING_SUMMARY.md`
- `docs/GO_LIVE_LAUNCH_CHECKLIST.md`
- `docs/PRODUCTION_PROMOTION_PLAYBOOK.md`

## Release Details

- Release version / tag:
- Date:
- Start time:
- Environment:
- Release lead:
- Engineering approver:
- Operations approver:

## 1. Pre-Deploy Gate

- [ ] `npm run typecheck`
- [ ] `npm run test:client`
- [ ] `npm run build`
- [ ] `npm run db:migrate`
- [ ] `npm run release:verify:local`

Notes:

-
-

## 2. Staging Verification

- [ ] staging deploy completed
- [ ] `/api/health/live` healthy
- [ ] `/api/health/ready` healthy
- [ ] auth smoke passed
- [ ] collection smoke passed
- [ ] receipt smoke passed
- [ ] backup smoke passed

Notes:

-
-

## 3. Critical Business Flows

- [ ] create record updates Daily / Summary / Nickname Summary
- [ ] amount change updates all totals correctly
- [ ] payment date move updates old and new bucket correctly
- [ ] nickname reassignment updates both staff totals correctly
- [ ] delete flow removes totals correctly
- [ ] monthly target math remains bounded correctly
- [ ] receipt create / replace / remove / preview / download all behave correctly

Notes:

-
-

## 4. Runtime Stability Checks

- [ ] no critical 5xx spike observed
- [ ] no auth loop observed
- [ ] no receipt regression observed
- [ ] no obvious memory growth during repeated viewer or receipt actions
- [ ] no unexpected stale conflict spike
- [ ] no unexpected 429 spike

Current signals:

- stale conflicts:
- 429 count:
- error rate:
- active alerts:

Notes:

-
-

## 5. Decision

Decision:

- [ ] GO
- [ ] NO-GO

Reason:

-
-

## 6. If GO

- [ ] production canary deployed
- [ ] first canary observation window completed
- [ ] production full promotion approved

Promotion notes:

-
-

## 7. If NO-GO

- [ ] rollback initiated
- [ ] previous stable release restored
- [ ] login rechecked after rollback
- [ ] collection and receipt rechecked after rollback
- [ ] incident owner assigned

Rollback notes:

-
-

## 8. Sign-Off

- Release lead:
- Engineering approver:
- Operations approver:
- Final timestamp:
