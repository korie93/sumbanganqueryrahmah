#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:-}"
if [[ -z "$ARCHIVE_PATH" ]]; then
  printf 'Usage: SQR_RELEASE_ENV_FILE=/absolute/path/.env %s /path/to/sqr-release.tar.gz\n' "$0" >&2
  exit 64
fi

APP_ROOT="${SQR_RELEASE_ROOT:-/home/deploy/apps/sqr-runtime}"
ENV_FILE="${SQR_RELEASE_ENV_FILE:-}"
RUNTIME_DIR="${SQR_RELEASE_RUNTIME_DIR:-}"
PM2_APP_NAME="${SQR_PM2_APP_NAME:-sqr}"
LOCAL_BASE_URL="${SQR_RELEASE_LOCAL_BASE_URL:-http://127.0.0.1:5000}"
PUBLIC_BASE_URL="${SQR_PUBLIC_BASE_URL:-}"
CHECKSUM_PATH="${SQR_RELEASE_ARCHIVE_CHECKSUM:-${ARCHIVE_PATH}.sha512}"
LEGACY_UPLOADS_DIR="${SQR_RELEASE_LEGACY_UPLOADS_DIR:-}"

fail() {
  printf 'Release deployment failed: %s\n' "$1" >&2
  exit 1
}

for command_name in curl flock node npm pm2 sha512sum tar; do
  command -v "$command_name" >/dev/null 2>&1 || fail "required command not found: $command_name"
done

[[ -f "$ARCHIVE_PATH" ]] || fail "release archive not found"
[[ -f "$CHECKSUM_PATH" ]] || fail "release archive checksum not found"
[[ -n "$ENV_FILE" && -f "$ENV_FILE" ]] || fail "SQR_RELEASE_ENV_FILE must point to the existing production env file"

ARCHIVE_PATH="$(readlink -f "$ARCHIVE_PATH")"
CHECKSUM_PATH="$(readlink -f "$CHECKSUM_PATH")"
ENV_FILE="$(readlink -f "$ENV_FILE")"
mkdir -p "$APP_ROOT/releases" "$APP_ROOT/shared/uploads" "$APP_ROOT/shared/var"
APP_ROOT="$(cd "$APP_ROOT" && pwd -P)"
[[ "$APP_ROOT" != "/" ]] || fail "SQR_RELEASE_ROOT cannot be the filesystem root"
exec 9>"$APP_ROOT/deploy.lock"
flock -n 9 || fail "another release operation is already running"

if [[ -n "$RUNTIME_DIR" ]]; then
  [[ -d "$RUNTIME_DIR" ]] || fail "SQR_RELEASE_RUNTIME_DIR is not a directory"
  RUNTIME_DIR="$(readlink -f "$RUNTIME_DIR")"
fi
case "$ENV_FILE" in
  "$APP_ROOT/releases/"*) fail "production env file cannot be stored inside an immutable release" ;;
esac
case "$RUNTIME_DIR" in
  "$APP_ROOT/releases/"*) fail "runtime directory cannot be stored inside an immutable release" ;;
esac

EXPECTED_ARCHIVE_CHECKSUM="$(awk 'NR == 1 { print $1 }' "$CHECKSUM_PATH")"
[[ "$EXPECTED_ARCHIVE_CHECKSUM" =~ ^[0-9a-f]{128}$ ]] \
  || fail "release archive checksum file is malformed"
ACTUAL_ARCHIVE_CHECKSUM="$(sha512sum "$ARCHIVE_PATH" | awk '{ print $1 }')"
[[ "$ACTUAL_ARCHIVE_CHECKSUM" == "$EXPECTED_ARCHIVE_CHECKSUM" ]] \
  || fail "release archive checksum verification failed"

while IFS= read -r archive_entry; do
  normalized_entry="${archive_entry#./}"
  case "$normalized_entry" in
    "" ) ;;
    /*|../*|*/../*|*/..) fail "release archive contains an unsafe path" ;;
  esac
done < <(tar -tzf "$ARCHIVE_PATH")

if tar -tvzf "$ARCHIVE_PATH" | awk '{print substr($1,1,1)}' | grep -Eq '^[^-d]$'; then
  fail "release archive contains an unsupported entry type"
fi

INCOMING_DIR="$(mktemp -d "$APP_ROOT/releases/.incoming.XXXXXX")"
cleanup_incoming() {
  if [[ -n "${INCOMING_DIR:-}" && -d "$INCOMING_DIR" ]]; then
    rm -rf -- "$INCOMING_DIR"
  fi
}
trap cleanup_incoming EXIT

tar -xzf "$ARCHIVE_PATH" --no-same-owner --no-same-permissions -C "$INCOMING_DIR"
[[ -f "$INCOMING_DIR/release-manifest.json" ]] || fail "release manifest is missing"
[[ -f "$INCOMING_DIR/release-files.sha512" ]] || fail "release file inventory is missing"
(
  cd "$INCOMING_DIR"
  sha512sum -c release-files.sha512
) >/dev/null || fail "release file inventory verification failed"

mapfile -t RELEASE_FIELDS < <(node - "$INCOMING_DIR/release-manifest.json" <<'NODE'
const { readFileSync } = require("node:fs");
const manifest = JSON.parse(readFileSync(process.argv[2], "utf8"));
const shaPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const tokenPattern = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,127}$/;
if (manifest?.schemaVersion !== 1 || manifest?.sourceDirty !== false) process.exit(2);
if (!shaPattern.test(manifest.commitSha) || !tokenPattern.test(manifest.version)) process.exit(3);
const builtAt = new Date(manifest.builtAt);
if (Number.isNaN(builtAt.getTime()) || builtAt.toISOString() !== manifest.builtAt) process.exit(4);
const timestamp = manifest.builtAt.replaceAll("-", "").replaceAll(":", "").replace(/\.\d{3}Z$/, "Z");
const expectedId = `sqr-${manifest.version}-${manifest.commitSha.slice(0, 12)}-${timestamp}`;
if (manifest.releaseId !== expectedId || !tokenPattern.test(manifest.releaseId)) process.exit(5);
process.stdout.write(`${manifest.releaseId}\n${manifest.commitSha}\n`);
NODE
) || fail "release manifest validation failed"

RELEASE_ID="${RELEASE_FIELDS[0]:-}"
RELEASE_SHA="${RELEASE_FIELDS[1]:-}"
[[ -n "$RELEASE_ID" && -n "$RELEASE_SHA" ]] || fail "release manifest fields are incomplete"
if [[ -n "${SQR_EXPECTED_RELEASE_SHA:-}" && "$RELEASE_SHA" != "$SQR_EXPECTED_RELEASE_SHA" ]]; then
  fail "release SHA does not match SQR_EXPECTED_RELEASE_SHA"
fi

if [[ -z "$LEGACY_UPLOADS_DIR" ]]; then
  LEGACY_UPLOADS_DIR="$(dirname "$ENV_FILE")/uploads"
fi
if [[ -e "$LEGACY_UPLOADS_DIR" ]]; then
  LEGACY_UPLOADS_DIR="$(readlink -f "$LEGACY_UPLOADS_DIR")"
  [[ -n "$LEGACY_UPLOADS_DIR" && -d "$LEGACY_UPLOADS_DIR" ]] \
    || fail "legacy uploads source is not a readable directory"
  case "$LEGACY_UPLOADS_DIR" in
    "$APP_ROOT/releases/"*) fail "legacy uploads source cannot be inside an immutable release" ;;
  esac
  node "$INCOMING_DIR/scripts/migrate-legacy-uploads.mjs" \
    "$LEGACY_UPLOADS_DIR" "$APP_ROOT/shared/uploads" \
    || fail "legacy uploads could not be copied into shared storage"
fi

RELEASE_DIR="$APP_ROOT/releases/$RELEASE_ID"
[[ ! -e "$RELEASE_DIR" ]] || fail "immutable release directory already exists"
ln -s "$ENV_FILE" "$INCOMING_DIR/.env"
ln -s "$APP_ROOT/shared/uploads" "$INCOMING_DIR/uploads"
ln -s "$APP_ROOT/shared/var" "$INCOMING_DIR/var"
if [[ -n "$RUNTIME_DIR" ]]; then
  ln -s "$RUNTIME_DIR" "$INCOMING_DIR/.runtime"
fi

(
  cd "$INCOMING_DIR"
  npm ci --omit=dev
  npm run db:migrate
)

mv "$INCOMING_DIR" "$RELEASE_DIR"
INCOMING_DIR=""

CURRENT_LINK="$APP_ROOT/current"
PREVIOUS_LINK="$APP_ROOT/previous"
OLD_RELEASE=""
OLD_PREVIOUS_RELEASE=""
if [[ -e "$CURRENT_LINK" || -L "$CURRENT_LINK" ]]; then
  [[ -L "$CURRENT_LINK" ]] || fail "current must be a symbolic link"
  OLD_RELEASE="$(readlink -f "$CURRENT_LINK")"
  case "$OLD_RELEASE" in
    "$APP_ROOT/releases/"*) ;;
    *) fail "current points outside the managed release directory" ;;
  esac
fi
if [[ -e "$PREVIOUS_LINK" || -L "$PREVIOUS_LINK" ]]; then
  [[ -L "$PREVIOUS_LINK" ]] || fail "previous must be a symbolic link"
  OLD_PREVIOUS_RELEASE="$(readlink -f "$PREVIOUS_LINK")"
  case "$OLD_PREVIOUS_RELEASE" in
    "$APP_ROOT/releases/"*) ;;
    *) fail "previous points outside the managed release directory" ;;
  esac
fi

rm -f -- "$APP_ROOT/current.next" "$APP_ROOT/previous.next"
ln -s "$RELEASE_DIR" "$APP_ROOT/current.next"
mv -Tf "$APP_ROOT/current.next" "$CURRENT_LINK"
if [[ -n "$OLD_RELEASE" ]]; then
  ln -s "$OLD_RELEASE" "$APP_ROOT/previous.next"
  mv -Tf "$APP_ROOT/previous.next" "$PREVIOUS_LINK"
fi

export SQR_RELEASE_ROOT="$APP_ROOT"
export SQR_PM2_APP_NAME="$PM2_APP_NAME"
PM2_CONFIG="$RELEASE_DIR/deploy/pm2/ecosystem.release.config.cjs"
LEGACY_PM2_REPLACED=false

restore_release_links() {
  rm -f -- "$APP_ROOT/current.rollback" "$APP_ROOT/previous.rollback"
  if [[ -n "$OLD_RELEASE" ]]; then
    ln -s "$OLD_RELEASE" "$APP_ROOT/current.rollback"
    mv -Tf "$APP_ROOT/current.rollback" "$CURRENT_LINK"
  else
    rm -f -- "$CURRENT_LINK"
  fi
  if [[ -n "$OLD_PREVIOUS_RELEASE" ]]; then
    ln -s "$OLD_PREVIOUS_RELEASE" "$APP_ROOT/previous.rollback"
    mv -Tf "$APP_ROOT/previous.rollback" "$PREVIOUS_LINK"
  else
    rm -f -- "$PREVIOUS_LINK"
  fi
}

restore_previous_release() {
  restore_release_links
  if [[ -n "$OLD_RELEASE" ]]; then
    pm2 startOrReload "$PM2_CONFIG" \
      --only "$PM2_APP_NAME" --update-env || true
    return 0
  fi

  pm2 delete "$PM2_APP_NAME" >/dev/null 2>&1 || true
  if [[ "$LEGACY_PM2_REPLACED" == "true" ]]; then
    pm2 resurrect
  fi
}

registered_pm2_definition() {
  pm2 jlist | node -e '
let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
  const appName = process.argv[1];
  const processes = JSON.parse(raw);
  const processEntry = processes.find((entry) => entry?.name === appName);
  if (!processEntry) return;
  const scriptPath = processEntry?.pm2_env?.pm_exec_path;
  const workingDirectory = processEntry?.pm2_env?.pm_cwd;
  process.stdout.write(
    `${typeof scriptPath === "string" ? scriptPath : ""}\t${
      typeof workingDirectory === "string" ? workingDirectory : ""
    }`,
  );
});
' "$PM2_APP_NAME"
}

REGISTERED_PM2_DEFINITION="$(registered_pm2_definition)" \
  || {
    restore_release_links
    fail "existing PM2 registration could not be inspected"
  }
IFS=$'\t' read -r REGISTERED_PM2_SCRIPT REGISTERED_PM2_CWD <<< "$REGISTERED_PM2_DEFINITION"
PM2_REGISTRATION_IS_MANAGED=true
if [[ -n "$REGISTERED_PM2_DEFINITION" ]]; then
  case "$REGISTERED_PM2_SCRIPT" in
    "$APP_ROOT/current/"*|"$APP_ROOT/releases/"*) ;;
    *) PM2_REGISTRATION_IS_MANAGED=false ;;
  esac
  case "$REGISTERED_PM2_CWD" in
    "$APP_ROOT/current"|"$APP_ROOT/releases/"*) ;;
    *) PM2_REGISTRATION_IS_MANAGED=false ;;
  esac
fi
if [[ "$PM2_REGISTRATION_IS_MANAGED" == "false" ]]; then
  # Preserve the legacy process list before replacing its immutable-incompatible
  # script and cwd registration. A failed first cutover can resurrect it.
  if ! pm2 save; then
    restore_release_links
    fail "legacy PM2 process list could not be saved before first cutover"
  fi
  LEGACY_PM2_REPLACED=true
  if ! pm2 delete "$PM2_APP_NAME"; then
    restore_previous_release || true
    fail "legacy PM2 registration could not be replaced"
  fi
fi

verify_release() {
  pm2 startOrReload "$PM2_CONFIG" --only "$PM2_APP_NAME" --update-env
  curl --retry 30 --retry-delay 1 --retry-all-errors -fsS "$LOCAL_BASE_URL/api/health/ready" >/dev/null
  curl -fsS "$LOCAL_BASE_URL/api/health/version" | node -e '
let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
  const expectedSha = process.argv[1];
  const payload = JSON.parse(raw);
  process.exit(payload?.status === "ok" && payload?.release?.commitSha === expectedSha ? 0 : 1);
});
' "$RELEASE_SHA"
}

if ! verify_release; then
  restore_previous_release || true
  fail "new release failed health or provenance verification; previous release restored when available"
fi

if [[ -n "$PUBLIC_BASE_URL" ]]; then
  if ! SQR_EXPECTED_RELEASE_SHA="$RELEASE_SHA" \
    bash "$CURRENT_LINK/scripts/post-deploy-health-check.sh" "$PUBLIC_BASE_URL"; then
    restore_previous_release || true
    fail "public post-deploy gate failed; previous release restored when available"
  fi
fi

if ! pm2 save; then
  restore_previous_release || true
  fail "verified release could not be persisted in the PM2 process list"
fi

printf 'Release deployed successfully\n'
printf 'Release ID: %s\n' "$RELEASE_ID"
printf 'Commit SHA: %s\n' "$RELEASE_SHA"
printf 'Current: %s\n' "$(readlink -f "$CURRENT_LINK")"
