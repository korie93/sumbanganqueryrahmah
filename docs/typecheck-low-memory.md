# Local TypeScript checks on memory-constrained machines

The standard CI command remains `npm run typecheck` (`tsc --noEmit`). It is not
replaced, weakened or removed from release verification.

An additional local command is available:

```sh
npm run typecheck:low-memory
```

The coordinator starts one compiler worker at a time with a 768 MiB V8 old-space
limit. Each worker uses the original compiler options and checks up to 64 root
files with their resolved imports. All project declaration files, global scripts
and files containing namespace/module declarations join every batch, preserving
shared ambient context. Each batch runs configuration, global and syntax
diagnostics, then semantic diagnostics for its selected roots before the process
exits and releases its memory. Imported project roots receive their own semantic
checks in their scheduled batches. Declaration files
retain the project's existing `skipLibCheck` behavior.

SQR's npm command supplies `--context-types=node`, using the already-installed
`@types/node` declarations. The monolithic program receives this context through
backend dependency references; isolated frontend batches need it explicitly.
This adds a shared declaration root, not a compiler-option override or install.
Missing explicit context fails the command.

The tradeoff is slower execution because parsing and binding repeat. The limit is
for V8 old-space, not the total process or operating system memory requirement.
Individual import graphs can still require substantial memory. This mode cannot
promise to work on every low-memory machine. It is not identical to a monolithic
program: dependency augmentations imported only by another batch may affect its
context. Non-declaration dependencies outside configured project roots are not
separately scheduled for semantic checks. CI's full-program check remains authoritative; a local pass does not
replace it.

For smaller semantic batches:

```sh
npm run typecheck:low-memory -- --batch-size=32
```

`--heap-mb=256` through `1536` configures each worker's old-space limit;
`--project=path/to/tsconfig.json` selects a configuration. Unknown or invalid
arguments fail. Each worker has a 120-second timeout. A worker crash, timeout,
diagnostic, coverage mismatch or changed project-source fingerprint fails the command;
partial completion is never reported as a pass. Keep the checkout unchanged
during a run, including installed dependencies. The command emits no JavaScript
and writes no build cache.

Incremental, composite, declaration-emitting and referenced projects are rejected
explicitly. Use the standard compiler command for those configurations.

This local aid does not replace CI or the build, lint, browser and performance
gates. A successful fixture test alone is not evidence that a full SQR run passed.

## Verified SQR run — 15 November 2026

Run `auth-smooth-tests-0157573c2a80` executed the npm command in an isolated,
network-disabled Linux sandbox with the existing dependencies and synthetic
tests. All **3,006 configured root files** completed in **485.814 seconds** with
exit code 0. Peak cgroup memory, including the coordinator, workers and charged
file cache, was **991,350,784 bytes (945.4 MiB)**. No memory-high, hard-limit or
OOM events were recorded. Worker old-space remained capped at 768 MiB; batches
contained 64 roots. This is a local-batch result, not a monolithic CI pass.

Earlier monolithic attempts reached V8 heap limits at 512 MiB and 1,024 MiB.
The 1,536 MiB attempt stopped at its CPU budget, so it is not recorded as an OOM
or a successful check. A 32-root local run checked 2,624 roots without diagnostics
before its 720-second CPU budget expired. Increasing the batch to 64 reduced
repeated compiler initialization and completed within that same budget.

The existing root TypeScript configuration, CI workflow and package lock were
not changed. No dependency was installed and no production endpoint was used.

Final regression run `auth-smooth-tests-c6edd25853f9` passed **19/19 tests**:
the six low-memory checks, existing release-readiness contracts and verification
documentation contracts. The earlier combined run lacked three reference files
in its sandbox snapshot; that fixture omission was corrected without changing
application code or relaxing the tests.
