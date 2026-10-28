# Viewer export progress continuation

Approved goal: replace the existing compact Viewer export status with actual
received-record counts, followed by file preparation for CSV, Excel and PDF.
Preserve cancel, single-flight ownership, export scopes and access guards.
No new dependency, API or production deployment is authorized by this goal.

Canonical resumable record on this workstation:
`C:\Users\Administrator\security-audit-skill\sumbanganqueryrahmah\export-progress-20261028\CURRENT.json`.
Read that record and its referenced validation report before resuming. Preserve
the 57 already approved working changes and record new input hashes separately.
Do not assume a completed test run applies after its input bytes change.

All repository execution, including tests, lint, TypeScript, builds and browser
fixtures, must use the existing enforced WSL SQR-Audit sandbox with its existing
limits. Never run target code directly on Windows or access production data.
Use synthetic data only; retain failed evidence, do not loosen test assertions
or resource limits to get a pass, and close all sandbox processes when finished.

Remaining work at goal creation: implementation, units, synthetic native browser
regressions, lint, changed-file TypeScript and production frontend build;
then verify exact current hashes and runtime closure before marking complete.
Commit, push and deployment require a later user request.
