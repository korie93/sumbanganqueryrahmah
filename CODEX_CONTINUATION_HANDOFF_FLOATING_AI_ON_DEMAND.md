# Floating AI on-demand continuation

Updated: 27 October 2026, Asia/Singapore. Local implementation and scoped QA are complete.

## Authorization and current Git state

The user approved the lightweight launcher and requested a completion goal with
cross-account continuation. Commit, push and deployment require separate user
instructions. HEAD remains 0778f02c47ea5c24600ff6f771a1e7cd0543d926 on main.
This task has exactly16 changed/new files, nothing staged. The earlier completed
production deployment runs that HEAD; this local launcher change is NOT deployed.

## Result

- AuthenticatedAppShell renders a lightweight launcher without idle/timer-based
  automatic runtime loading. First native click/Enter/Space loads FloatingAI.
- Concurrent activations share one promise. Generation, mount and route owner
  guards reject stale completions. Stored activatedOnRoute also handles module
  readiness and navigation batched into one React commit.
- Both initial open and activated state are seeded together. Route equality
  guards preserve first activation under StrictMode. The loaded runtime remains
  mounted so minimizing preserves the existing request/messages lifecycle.
- Ordinary idle routes use existing CSS placement and mobile focus suppression.
  Save Collection and Saved mobile lazily reuse the existing placement-only
  machinery for control/footer/portalled-dialog clearance. Placement failure is
  contained locally and its retry leaves the form/data intact.
- Native ESM remembers failed module URLs. Runtime and placement each have two
  fixed build-owned entry URLs (normal and queried retry). Explicit retry uses
  the alternate, with no eval/blob/unbounded cache busting/reload/CSP weakening.
- Loading uses a reduced-motion-aware spinner, aria-busy and short BM status.
  Backend/authentication/financial workflows and dependencies are unchanged.

## Final verification

Canonical external directory:
C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ai-launcher-on-demand-20261027/02

FINAL_VALIDATION.json and verify-final.cjs pin all1,984 runtime/test/config inputs,
the16 working-file hashes,23 positive evidence records and unchanged HEAD. The
handoff itself is documentation and is hashed separately from executable inputs.

Final immutable source: /opt/sqr-audit/source-ai-launcher-02
Manifest SHA256: 5e8f2bc515c61a30f6b7ba4923cfa68ae40323f65772d5e0262942b10d061729

-85 unit/contract tests: receipt-adaptive-tests-777759cdfa64.
-Lint14 changed TS/TSX files: receipt-adaptive-lint-1121157bf3e8.
-Strict/exactOptional semantic checks of14 changed roots +Vite ambient:
 receipt-adaptive-types-241df5f8e9e8;1,895 resolved source files. Not full-repo tsc.
-Actual production frontend build: receipt-adaptive-build-1fb74449a328. All bundle
 budgets pass;0 source maps. Graph proves runtime/panel/layout/focus are outside
 the shell static closure, with a distinct retry entry not importing primary.
-19 native browser cases:7 new launcher cases,4 existing Save clearance cases,
 8 existing Saved light/dark cases at320/390/722/1440px. All passed independently
 with0 retries under unchanged resource caps. Exact run IDs are in validation.

Actual compiled frontend: /opt/sqr-audit/inputs/ai-launcher-frontend-02/public
Archive SHA256: d9acc1f9156de07d7cd9ad12847729797abfed8a984f2df31340f70feff7bc8e
758 files, paired with final source; static brand/font assets come from the
previous approved archive, while generated JS/CSS/index are rebuilt from source.

Browser checks cover cold startup/no runtime request before interaction, keyboard
first open/focus/Escape/reopen, held-import deduplication, stale navigation,
primary-download retry via a distinct URL, placement failure with usable form,
minimized active request with one retained answer, mobile modal, and existing
Save/Saved collision/keyboard/drawer/pagination behavior. Independent source
review found no blockers. See docs/floating-ai-on-demand.md for design intent.

## Limits and preserved earlier evidence

No Chrome Task Manager MB reduction is guaranteed or measured. Entry retry is
bounded; failure of a shared/nested chunk may still need a later page reload.
Full GitHub CI/release verification and full repo typecheck were not repeated.

Initial grouped browser attempts hit sustained/hard sandbox memory ceilings;
those failures are retained outside02 and excluded from final positive evidence.
The harness was split into one native test per disposable process, with smaller
Node heaps and unchanged assertions/OS caps. Native testing also exposed the
failed-URL retry defect; it was fixed and all affected checks rebuilt/rerun.

## Runtime safety and completion

All target tests/builds/browser execution used WSL SQR-Audit +bwrap/cgroups only.
Never execute repo/npm/test/browser code on Windows. Host built-ins/Git handled
data packaging only. No external target network, installs, production access,
real accounts/data or credentials. Readonly source/toolchain, scratch-only writes,
empty explicit env. Caps1CPU/768MiB/noSwap/128tasks/180s wall/120CPU seconds,
scratch256MiB/8192inodes/file8MiB/stdout1MiB/stderr256KiB were not increased.
Native Saved screenshots remained scratch-only and were not retained. Evidence
was promoted after termination through the trusted bounded no-follow reader.

Runtime closure verified zero audit cgroups/scratch mounts/UID1000 processes,
then terminated SQR-Audit. The completion goal can now be marked complete.

If another account continues, first read this file and02/FINAL_VALIDATION.json.
No implementation work remains. If the user next requests commit/push, recheck
the final hashes, stage exactly16 files and run the actual current-HEAD secret and
message guards inside the established immutable staged-byte sandbox. Use prior
release-cleanup-commit-20261027 guard workflow as template; do not run repo hooks
on Windows, bypass guards or alter permanent hooksPath. Normal non-force push
and remote SHA/clean-tree verification follow. Deploy only on a separate request
using the approved exact-SHA immutable release after GitHub gates pass.
