# Immutable Production Releases

This is the preferred SQR production deployment path. CI builds and verifies
one release archive, GitHub records production approval, and the server promotes
that exact archive without rebuilding application code.

The legacy Git checkout procedure remains available in
`docs/runbooks/production.md` only for documented recovery.

## Release Guarantees

- The server bundle embeds the release version, full commit SHA, build time,
  and deterministic release ID.
- `GET /api/health/version` exposes only those public-safe fields.
- Every packaged file and the outer archive are protected by SHA-512 checksums.
- Dirty working trees cannot produce deployable artifacts.
- `current` and `previous` are atomic symbolic links under one release root.
- A failed readiness, provenance, or public post-deploy check restores the
  previous application release when one exists.
- The first cutover snapshots and replaces an incompatible legacy PM2
  registration, then resurrects that snapshot if verification fails.
- Deployment-only shell variables are filtered from the application process
  before strict runtime environment validation.
- A legacy `uploads` directory beside the production `.env` is checked on each
  deploy and copied into shared storage without overwriting existing files.
- Production secrets, uploads, generated runtime data, and private CA files are
  never copied into the release artifact.

Database migrations are forward-only. Application rollback does not reverse a
migration; migrations must remain backward compatible under the repository's
migration governance checks.

## One-Time GitHub Setup

1. Open repository **Settings > Environments**.
2. Create an environment named `production`.
3. Add at least one required reviewer and prevent self-review where supported.
4. Restrict deployment branches to `main`.

YAML can select the environment, but required reviewers must be configured in
GitHub repository settings.

## Create And Approve A Release

1. Open **Actions > Release Verification**.
2. Select **Run workflow** on `main`.
3. Wait for `release-readiness` to pass.
4. Approve the `production` environment review.
5. Download `production-release-<full-commit-sha>` from the workflow artifacts.

The downloaded GitHub artifact contains:

- `sqr-release-<full-commit-sha>.tar.gz`
- `sqr-release-<full-commit-sha>.tar.gz.sha512`

Do not deploy the temporary `release-candidate-*` artifact.

## One-Time Server Setup

The first immutable deployment can use the deployment script from a reviewed
checkout. Subsequent deployments can use the script under the active release.

```bash
cd ~/apps/sumbanganqueryrahmah

mkdir -p ~/apps/sqr-runtime ~/release-inbox
chmod 750 ~/apps/sqr-runtime ~/release-inbox

# The existing production env remains outside immutable releases.
chmod 600 "$PWD/.env"
```

Keep private runtime files outside the release root. For the current single-host
deployment this is normally:

```bash
export SQR_RELEASE_ENV_FILE="$HOME/apps/sumbanganqueryrahmah/.env"
export SQR_RELEASE_RUNTIME_DIR="$HOME/apps/sumbanganqueryrahmah/.runtime"
export SQR_RELEASE_ROOT="$HOME/apps/sqr-runtime"
export NODE_EXTRA_CA_CERTS="$HOME/apps/sumbanganqueryrahmah/.runtime/redis-ca.crt"
```

On deployment, the script checks for `uploads` beside `SQR_RELEASE_ENV_FILE`
and merges regular files into `$SQR_RELEASE_ROOT/shared/uploads` with
no-clobber semantics. Existing shared files win, the legacy source is retained,
and symbolic links or special files fail the deployment. A different reviewed
source may be selected with `SQR_RELEASE_LEGACY_UPLOADS_DIR`.

`NODE_EXTRA_CA_CERTS` must be present before Node starts; putting it only inside
`.env` is too late for Node's TLS initialization.

## Deploy An Approved Artifact

Place both downloaded files in `~/release-inbox`, then run:

```bash
cd ~/apps/sumbanganqueryrahmah

export SQR_RELEASE_ENV_FILE="$PWD/.env"
export SQR_RELEASE_RUNTIME_DIR="$PWD/.runtime"
export SQR_RELEASE_ROOT="$HOME/apps/sqr-runtime"
export SQR_PUBLIC_BASE_URL="https://sqr-system.com"
export NODE_EXTRA_CA_CERTS="$PWD/.runtime/redis-ca.crt"

ARCHIVE="$HOME/release-inbox/sqr-release-<full-commit-sha>.tar.gz"
export SQR_EXPECTED_RELEASE_SHA="<full-commit-sha>"

bash deploy/immutable/deploy-release.sh "$ARCHIVE"
```

The deployment script performs, in order:

1. exclusive deployment locking;
2. archive checksum and path-safety validation;
3. internal file inventory verification;
4. manifest and expected SHA validation;
5. production dependency installation in a temporary directory;
6. migration under the PostgreSQL advisory lock;
7. atomic `current` symlink promotion;
8. PM2 start/reload with readiness waiting;
9. local readiness and exact release SHA verification;
10. public security, health, auth, and provenance checks;
11. PM2 process-list persistence only after every verification gate passes.

## Verify Production Version

```bash
curl -fsS https://sqr-system.com/api/health/version
readlink -f "$HOME/apps/sqr-runtime/current"
pm2 status
```

The endpoint SHA must equal the approved artifact SHA.

## Roll Back

```bash
export SQR_RELEASE_ROOT="$HOME/apps/sqr-runtime"
export NODE_EXTRA_CA_CERTS="$HOME/apps/sumbanganqueryrahmah/.runtime/redis-ca.crt"

bash "$SQR_RELEASE_ROOT/current/deploy/immutable/rollback-release.sh"
curl -fsS https://sqr-system.com/api/health/version
```

Rollback swaps `current` and `previous`, reloads PM2, and verifies both readiness
and embedded SHA. If the rollback target fails verification, the script restores
the release that was active before the rollback attempt.

## Recover Legacy Receipt Metadata

If receipt binaries were migrated into shared storage after an application read
had already removed their database relations, do not run a full backup restore.
Use the receipt-only recovery tool from the active immutable release.

```bash
cd "$HOME/apps/sqr-runtime/current"

# Read-only: show current relation counts and candidate backups.
node --env-file=.env \
  dist-local/scripts/recover-collection-receipt-metadata.js --list

# Read-only: validate one backup, its receipt files, and the proposed changes.
node --env-file=.env \
  dist-local/scripts/recover-collection-receipt-metadata.js \
  --backup-id '<pre-incident-backup-id>'

# Apply only after the dry-run counts have been reviewed.
node --env-file=.env \
  dist-local/scripts/recover-collection-receipt-metadata.js \
  --backup-id '<pre-incident-backup-id>' \
  --apply \
  --confirm-backup-id '<pre-incident-backup-id>'
```

The tool verifies the stored backup checksum, validates each managed receipt
path and file, preserves archived receipts, inserts only missing relations, and
records an audit event. It is idempotent. Backups without a stored checksum are
rejected unless an operator explicitly adds `--allow-unverified-backup` after
independent review.

## Operational Notes

- Never edit files under `releases/<release-id>`.
- Never point `current` or `previous` outside `SQR_RELEASE_ROOT/releases`.
- Preserve at least the current and previous release directories.
- Do not place `.env`, uploads, database dumps, certificates, or logs under a
  release directory.
- The first migration from the legacy PM2 checkout should use a maintenance
  window. Keep the old checkout until the first immutable release is verified.
