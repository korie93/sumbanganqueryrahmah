# Collection Report and sidebar Q — Playwright verification

Date: 2026-10-14 (Asia/Singapore). User explicitly requested Playwright execution, superseding the initial Codex-browser-only choice for these isolated local tests.

## Final result

**49 passed, 0 failed, 0 skipped** in the final Chromium run, approximately 3.5 minutes, one worker, no retries. This is the selected Collection/sidebar/brand regression suite, not all 323 tests currently listed by the repository and not remote GitHub CI.

| Scope | Cases |
| --- | ---: |
| Existing authenticated light/dark screenshot baselines | 2 |
| Existing Collection layout and admin/user/manager permissions | 13 |
| Brand, favicon, desktop toggle and public/password/workspace themes | 9 |
| Raster-backed brand assets under the unchanged status CSP | 1 |
| New compact Collection navigation, roles, keyboard, overflow and mobile/tablet | 14 |
| Existing Collection mobile return/overlay behavior | 2 |
| Sidebar Q persistence, motion guards, touch/DPR, CSP and missing-layer fallback | 8 |
| **Total** | **49** |

Reproduce against the existing built frontend:

```sh
npm run test:visual:built -- --workers=1 --grep "Collection (desktop|layout polish)|direct Billing|admin staff badge|short collection|tablet retains|mobile keeps|desktop animated Q|one touch expands|brand migration|authenticated pages match"
```

The runner serves `dist-local/public` on an ephemeral `127.0.0.1` port, scrubs application secrets from the child environment, disables dotenv and uses fail-closed synthetic responses. It does not launch the backend or connect to PostgreSQL. Browser contexts and the static test server close after execution. No production accounts, data, receipts, exports, deployment or permissions are involved.

Generated report: `artifacts/playwright-report/index.html`. Final run state: `artifacts/playwright-test-results/.last-run.json`. Successful screenshots remain under the corresponding test-result folders. These generated artifacts are ignored by Git.

## Corrections made during execution

1. Initial selected run: 43 passed, 4 failed. Two workspace-logo assertions still expected the generic theme-auto/two-image behavior. Updated only that workspace case to protect the intentionally transparent light PNG in both themes, including actual theme switching and collapse/re-expand. Public/password page theme expectations remain unchanged.
2. The new mobile drawer case used an exact name excluding the existing description. Scoped it to the mobile section navigation and anchored the label match, with explicit assertions that both the full label and description remain visible. Escape/focus-return and Records navigation checks remain.
3. The superuser sidebar-persistence case waited for a form before choosing a nickname. Added a spec-local helper that selects the real synthetic nickname through the chooser on initial navigation and each reload. The shared fixture/helper and production flow remain unchanged.
4. Follow-up run: all 47 selected interaction cases passed, with only the two old Save Collection screenshot baselines failing. Expected/actual/diff images were opened and independently reviewed at matching 1280×720 dimensions. Differences were the approved compact header/navigation and prior Q/collapse-control update; chooser, reload, draft/privacy guidance, keyboard shortcut, notices and form controls remained intact. Content moved up roughly 160px.
5. Replaced only `sumbangan-form-light.png` and `sumbangan-form-dark.png` with those reviewed deterministic captures. Dashboard, Settings and login baseline files were untouched. A complete final rerun passed all 49 cases.

Initial failures are preserved under `artifacts/playwright-collection-q-initial/`; the reviewed Save expected/actual/diff images and traces are retained under `artifacts/playwright-collection-q-baselines-20261014/`.

No timeout, screenshot tolerance, mask, skip, permission, CSP or production implementation was changed to make the tests pass. The only current-turn source edits are the three scoped test specifications and verification documentation; the two image changes are intentional reviewed baseline maintenance.

## Additional checks and limits

- Three edited specifications: semantic TypeScript compilation and scoped ESLint passed.
- Static-runner/snapshot source contracts: 11/11 passed.
- Secret scan, repository hygiene and diff checks passed (normal CRLF notices only).
- Existing build/typecheck/frontend unit and bundle verification from the implementation remain applicable; no application code or dependency changed during this testing request.
- The optional 60-second CPU 4×/6× trace/heap harness was not run. Actual physical-device GPU/zoom behavior, complete 323-test coverage, configured OSP target workspaces, backend saves and live deployment/CI are not certified by this suite.

No commit, push or deployment was performed.
