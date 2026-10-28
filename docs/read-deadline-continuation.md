# Read deadline goal and continuation

Approved objective: finish 60-second full-operation deadlines for Saved list,
Saved details and Viewer UI reads, with friendly feedback, explicit recovery,
quiet cancellation and no stale result/export regressions.

The goal is tracked in this Codex conversation. To resume on this computer with
another account, read this file and the current goal, then consult:

`C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/read-deadline-20261028/CURRENT.json`

That parent-owned record identifies the latest frozen source, current progress,
exact validation proofs and any unresolved issue. Completed evidence is linked
by its original source hash; failed attempts remain separate. Follow the latest
record rather than restarting or assuming that an earlier run passed.

Baseline: HEAD `186fdb6502f97908b77bc9041419548c68e2471e`, with 43 approved
uncommitted files from earlier Saved/Viewer improvements. Their last complete
proof is `saved-return-20261028/03/FINAL_VALIDATION.json` in the same external
root. Preserve those changes, except the narrow integrations required here.

Key files: `client/src/lib/read-deadline.ts`, the three read hooks, Saved/Viewer
retry policies, the existing Saved error UI and `tests/visual/read-deadline.spec.ts`.
Run target-controlled tests/build/browser only in the existing enforced WSL
SQR-Audit sandbox with isolated loopback, empty allowlisted environment, readonly
source/toolchain, scratch-only writes and the unchanged resource caps. Never
run repository/npm/browser target code on Windows or use production data.

Finish unit/lint/changed TypeScript/frontend build and synthetic native-browser
checks, record exact source hashes and close the runtime. Mark the goal complete
only after required work passes. Commit, push and deployment require a separate
user request; do not stage secrets or overwrite other approved work.
