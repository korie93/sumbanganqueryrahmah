# Supply Chain and SBOM

SQR release verification generates Software Bill of Materials artifacts in both
CycloneDX JSON and SPDX JSON formats using the npm CLI built into the Node 24
LTS toolchain. No runtime dependency is required for SBOM generation.

## Node Runtime Policy

The supported runtime is Node.js 24.x LTS. The `.nvmrc`, GitHub Actions
workflows, `scripts/verify-node-version.mjs`, and `package.json` engines must
stay aligned to the same major version. `package.json` intentionally uses
`>=24 <26`: patch/minor updates within the current supported line are accepted,
and the next major range is reserved for an explicit migration branch only.

### Node Upgrade Path

Node runtime upgrades must be treated as supply-chain changes, not incidental
dependency churn:

1. Track the upstream Node.js release schedule and open an isolated branch when
   the next target major is ready for evaluation.
2. Update `.nvmrc`, `package.json`, `package-lock.json`, GitHub Actions
   `node-version`, and `scripts/verify-node-version.mjs` together.
3. Run the full CI gate locally where practical: repo hygiene, secret scan,
   dependency audit, typecheck, lint, tests, build, bundle budgets, accessibility
   contracts, and PageSpeed budgets.
4. Deploy to staging and soak before production promotion.
5. Document any accepted incompatibilities or baseline updates in the pull
   request before merging.

## Local Command

```sh
SBOM_ARTIFACTS_DIR=artifacts/sbom npm run supply-chain:sbom
```

Outputs:

- `artifacts/sbom/sbom.cyclonedx.json`
- `artifacts/sbom/sbom.spdx.json`

The generator validates that each SBOM is valid JSON and contains package data.
Release verification uploads `artifacts/sbom` together with the other release
artifacts.

If `npm sbom` rejects a stale local `node_modules` tree, the generator falls
back to `package-lock.json` and emits a warning. CI should normally use the
native npm SBOM output immediately after `npm ci`.

## CI Gates

The release workflow runs:

1. `npm run verify:repo-hygiene`
2. `npm run verify:secrets`
3. `npm run audit:dependencies`
4. `npm run supply-chain:sbom`
5. release readiness verification

The custom dependency audit remains the canonical CI vulnerability gate because
it applies the repository's documented override policy while still failing on
unexpected moderate/high/critical advisories.

## Updating Dependencies

When changing dependencies:

1. Run `npm ci`.
2. Run `npm run audit:dependencies`.
3. Run `npm run supply-chain:sbom`.
4. Commit lockfile changes with the relevant test output.
5. For vendored dependencies, also run `npm run verify:xlsx-vendor-integrity`.
