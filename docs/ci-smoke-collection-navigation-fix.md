# CI smoke UI — compact Collection navigation compatibility

Verification date: 2026-10-14 (Asia/Singapore). Source commit: `fbdb7cbd`. This follow-up changes smoke-test selectors and regression contracts only; the compact Collection UI remains unchanged.

## Confirmed failure

- [CI run 38433413919](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/38433413919), `smoke-ui` job 115423503151, failed at **Run UI smoke**, phase `collection stale delete conflict`.
- [Release Verification run 38435482214](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/38435482214), job 115428214940, failed at the same phase and selector.
- The log identifies `getByText('View Rekod Collection').first()` resolving to the hidden `.collection-section-label-full` span until its unchanged 30-second timeout. Desktop deliberately displays the compact `Rekod` label, while the native button retains its complete accessible name.
- In the CI run, Build, visual layout contracts, Playwright visual regressions and accessibility contracts had already passed. The failed smoke also left an active synthetic superuser session, explaining the subsequent monitoring login 409; authentication/session protections were not the root cause and are not changed.

## Bounded fix

Changed four readiness waits in `scripts/ui-smoke.mjs`:

- Records in the Manual Verified ABORT flow.
- Save Collection and Records in the receipt flow.
- Records in the stale-delete conflict flow.

Each now resolves the visible native button by its unchanged exact/full accessible name, scoped to the `Collection sections` navigation. Existing timeouts remain. Genuine Billing headings and Daily page readiness remain unchanged. No labels, layout, routes, permissions, matching logic, API, database schema, session or rate-limit settings were changed.

Two regression contracts in `scripts/tests/ui-smoke-navigation-contract.test.mjs` reject literal full-label text selectors for section navigation and protect the native-button waits. The real stale-version PATCH, tracked DELETE 409, surviving record, clean response tracker and record/source cleanup assertions are explicitly retained.

## Actual verification

**Full real-app smoke passed**, exit code 0, all 17 phases:

browser startup; public login bootstrap; stale browser session cleanup; authenticated login; desktop navigation; keyboard navigation; theme controls; mobile navigation; Home entry point; Daily page; Collection mutation consistency; stale-delete conflict; Manual Verified ABORT; Billing Principal including XLSX/PNG/PDF; receipt create/replace/remove; backup/restore; logout.

Executed the existing isolated runner with `SQR_REDESIGN_SMOKE_ONLY=1`:

```powershell
$env:SQR_REDESIGN_SMOKE_ONLY='1'
node scripts/test-frontend-redesign-isolated.mjs --final
```

The runner created a new PostgreSQL 17 cluster and application working directory with synthetic accounts/59 Collection seed records. Ports were loopback-only; migrations, real HTTP/API mutations and browser interactions operated only against that owned fixture. No repository dotenv, existing database, uploads or receipts entered the app environment. The scanner shim applies only inside this test fixture. No persistent authentication trace/HTML was recorded.

Server log: `artifacts/frontend-redesign/final-I8mHIZ/server.log` (ignored by Git). The runner confirmed graceful app shutdown, PostgreSQL stop and deletion of its validated nonsymlink temporary directory. The removed app/database contained only generated synthetic test data and can be recreated by rerunning the fixture; existing application data was untouched.

Additional checks:

- Focused smoke-navigation contracts: 18/18 passed; combined navigation/isolation contracts: 42/42 passed.
- Full script-test entrypoints passed when launched with OS-only inherited support, an absent explicit dotenv path, and a fail-closed localhost port-1 database configuration. The direct local run initially encountered sandbox metadata restrictions, then an unrelated unrecognized `LOG_FORMAT` from the local environment. No `.env` or runtime validation rule was edited to bypass those conditions.
- `node --check scripts/ui-smoke.mjs`, secret scan, repository hygiene and diff checks passed; normal CRLF notices only.

These verification results were obtained locally before commit/push; they do not claim that remote CI or Release Verification has passed for the fix. No workflow settings were changed and no production deployment was performed.
