# SQR enterprise error pages — continuation handoff

## Authority and current state

- User initially approved local implementation of `CODEX_GPT_6_ASTRA_ULTRA_SQR_ENTERPRISE_ERROR_PAGES_MAX_UIUX_CSS_GOAL.md` with commit/push/deploy excluded. The subsequent request on 20 September 2026 authorizes committing and pushing this completed work; deployment and production changes remain excluded.
- Base: `main` at `ad001305308e9ca3cf7442f612d63f638ed77c19`.
- Local implementation and acceptance verification are complete as of 20 September 2026. The existing goal is marked complete after the final document/hygiene audit. This handoff is included in the authorized commit; inspect `git log -1 -- CODEX_CONTINUATION_HANDOFF_SQR_ENTERPRISE_ERROR_PAGES.md` for its commit identity and check the remote before assuming push completion. Do not create another goal or claim production verification.
- Never read/print/commit environment secrets. Do not reuse historical SSH access, touch production, change business rules, or alter rate limits.

## Design and architecture decisions

- Existing SQR system font, minimal brand SVG and light/dark palettes; restrained two-column desktop layout and single-column mobile layout. No heavy illustration dependency, glass effects or new UI library.
- One shared React presentation and semantic Malay content for 404, 502, 503, 504, maintenance, offline and restored states.
- Static 502/503/504/maintenance HTML generated at build time, with independent local CSS/JS/SVG. No React, Node, CDN or external font needed when served by Nginx.
- Real unknown-document 404, known deep links 200. Preserve API JSON, file/WS namespaces, forced-password and banned-account priority.
- Existing maintenance switch remains authoritative. Hard maintenance returns a document 503 at the original URL; login remains accessible for administrator access. No competing edge toggle.
- Manual recovery only: bounded 8-second requests, one check in flight, 3-second click cooldown, hidden/unmounted abort, no polling or automatic navigation/resubmission. Both liveness `ready: true` and maintenance `false` must be verified before restored state. Browser online event alone is not proof.
- `proxy_intercept_errors off` is retained: upstream response bodies are preserved. Nginx-generated gateway errors use scoped HTML fallback for document requests; API/asset/WS failures stay non-HTML.

## Current files / ownership

- `shared/system-status.ts`, `client/src/components/system-status/`: shared copy, view, scoped CSS, recovery helper/hook.
- `client/src/pages/NotFound.tsx`, `Maintenance.tsx`: actual pages integrated, maintenance countdown/poll removed from page.
- `scripts/build-system-status.ts`, `deploy/errors/`: independent static artifacts and generation check.
- `shared/app-document-routes.ts`, `client/src/app/{routing,usePublicAppState,AppPageRenderer}.tsx/ts`, `client/src/App.tsx`: exact document routes and authenticated not-found handling.
- `server/internal/{frontend-static,runtime-config-manager}.ts`: status and namespace preservation.
- New routing/maintenance tests plus HTTP-suite wrapper and timer cleanup checks.
- `deploy/nginx/sqr-error-pages-*.conf.example`, `deploy/nginx/sqr.conf.example`, `docs/error-experience-nginx.md`: additive deployment and rollback examples, not applied to production.
- `scripts/test-system-status-nginx.mjs`, `scripts/tests/system-status-nginx-contract.test.mjs`: local actual Nginx transport test and config contract checks.
- `scripts/system-status-browser.mjs`, `scripts/fixtures/system-status-ui.jsx`: real component/hook viewport, accessibility and recovery checks.
- `scripts/system-status-built-browser.ts`: actual production entry and document middleware browser checks with synthetic API/account state.
- `scripts/system-status-assets.test.ts`, `client/src/components/system-status/recovery-check.test.ts`: semantic/escaping/payload/recovery and real packaging/checksum regression tests.
- `scripts/prepare-release-package.mjs`, `package.json`, shared-boundary contract: artifacts packaged independently and drift checked in builds/tests.
- `docs/error-experience-verification.md`: complete file-purpose inventory, design/architecture audit, acceptance mapping, commands and screenshot review.
- Deleted only obsolete `client/src/pages/{Maintenance,NotFound}.css`; recoverable from Git. No system/user data removed.

## Final verified evidence

- `npm run typecheck`: passed. `npm run lint`: passed. Scoped new script lint: passed.
- `npm run test:client`: 1,638 passed (1,095 +543), log `artifacts/system-status-client-tests.log`.
- `npm run test:scripts`: 448 passed (385 +63), including generated-asset equality and actual release-package/checksum fixture.
- `npm run test:http`: passed, including document/maintenance/API and NAT regressions. `npm run test:ws`:106 passed.
- `npm run test:status:browser`:160 checks passed,166 screenshot captures; `artifacts/system-status-browser/results.json`. Covers all seven requested widths and both themes, axe at extremes, keyboard/reduced motion, no clipping, manual retry/cooldown/timeout/offline/malformed/oversized/abort/unmount and no idle polling. Real public/shell maintenance hooks cannot auto-exit.
- `npm run test:status:built`:17 passed; `artifacts/system-status-built-browser/results.json`. Actual built anonymous/user/admin/superuser404, valid nested login-guarded deep links, maintenance HTTP503 and explicit restored state.
- `npm run test:status:nginx`:114 passed with actual portableNginx1.24.0, including successful `nginx -t`; latest evidence `artifacts/system-status-nginx/run-MB63xc/`. Actual Node-off fallback/assets, timeout504,503, upstreamJSON preservation,WS101+echo,polling and restart recovery.
- Primary agent manually opened screenshots at320/360/390/430/768/1024/1440, focus/recovered variants and actual built app. Full exact screenshot inventory/findings in the verification report.
- `npm run build`: passed client/server production build and zero production sourcemaps. Bundle budgets passed.
- Static maximum cold payload23,708bytes (23.2KiB) before compression, no external/runtime dependencies. Drift, JSON parsing, storage, breakpoint, repo hygiene, secret scan and diff checks passed.
- No current production `nginx -T` has been obtained. Historical deployment notes are not proof of active configuration. The Windows test is local evidence, not Linux production validation.
- At implementation verification time no remote CI, database-backed complete release-readiness command, commit, push or deploy had been performed. Commit/push is now authorized separately. The recorded dirty local build is evidence only, not a release artifact; rebuild from the committed source for any later release.

## Next steps

1. If asked to commit/push, inspect current diff and untracked files, preserve later user changes, never stage `.env*` or ignored artifacts. No dependency lockfile change is needed.
2. For a fresh verification machine, run normal dependency installation, `npm run verify:status-assets`, typecheck/lint/client/scripts/HTTP/WS/build, then `test:status:browser` and `test:status:built`. Browser-built requires a fresh build. `test:status:nginx` requires an available verified Nginx binary; see deployment guide for `SQR_NGINX_EXECUTABLE`.
3. If changing shared view/copy/CSS/logo, run `npm run build:status` and recheck drift/browser captures; do not hand-edit generated HTML/CSS/logo.
4. A future production request must first authorize deployment and obtain fresh sanitized active-config evidence. Follow `docs/error-experience-nginx.md`; never replace the live split-file site with the example. Record exact backup paths under `/etc/nginx/backups/`, test config before reload, and verify source/runtime SHA and API/WS health. No production rollback is currently needed because nothing was deployed.
5. The local-only goal has no remaining implementation blocker. Production approval/configuration verification is a separate future step, not an implicit authorization from this handoff.
