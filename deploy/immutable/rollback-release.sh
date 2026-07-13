#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${SQR_RELEASE_ROOT:-/home/deploy/apps/sqr-runtime}"
PM2_APP_NAME="${SQR_PM2_APP_NAME:-sqr}"
LOCAL_BASE_URL="${SQR_RELEASE_LOCAL_BASE_URL:-http://127.0.0.1:5000}"

fail() {
  printf 'Release rollback failed: %s\n' "$1" >&2
  exit 1
}

for command_name in curl flock node pm2; do
  command -v "$command_name" >/dev/null 2>&1 || fail "required command not found: $command_name"
done

[[ -d "$APP_ROOT/releases" ]] || fail "managed release directory does not exist"
APP_ROOT="$(cd "$APP_ROOT" && pwd -P)"
[[ "$APP_ROOT" != "/" ]] || fail "SQR_RELEASE_ROOT cannot be the filesystem root"
exec 9>"$APP_ROOT/deploy.lock"
flock -n 9 || fail "another release operation is already running"
CURRENT_LINK="$APP_ROOT/current"
PREVIOUS_LINK="$APP_ROOT/previous"
[[ -L "$CURRENT_LINK" && -L "$PREVIOUS_LINK" ]] || fail "current and previous release links are required"

CURRENT_RELEASE="$(readlink -f "$CURRENT_LINK")"
PREVIOUS_RELEASE="$(readlink -f "$PREVIOUS_LINK")"
for release_path in "$CURRENT_RELEASE" "$PREVIOUS_RELEASE"; do
  case "$release_path" in
    "$APP_ROOT/releases/"*) ;;
    *) fail "release link points outside the managed release directory" ;;
  esac
  [[ -f "$release_path/release-manifest.json" ]] || fail "release manifest is missing"
done

PREVIOUS_SHA="$(node -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).commitSha' "$PREVIOUS_RELEASE/release-manifest.json")"
[[ "$PREVIOUS_SHA" =~ ^([0-9a-f]{40}|[0-9a-f]{64})$ ]] || fail "previous release SHA is invalid"

rm -f -- "$APP_ROOT/current.rollback" "$APP_ROOT/previous.rollback"
ln -s "$PREVIOUS_RELEASE" "$APP_ROOT/current.rollback"
mv -Tf "$APP_ROOT/current.rollback" "$CURRENT_LINK"
ln -s "$CURRENT_RELEASE" "$APP_ROOT/previous.rollback"
mv -Tf "$APP_ROOT/previous.rollback" "$PREVIOUS_LINK"

export SQR_RELEASE_ROOT="$APP_ROOT"
export SQR_PM2_APP_NAME="$PM2_APP_NAME"
PM2_CONFIG="$CURRENT_LINK/deploy/pm2/ecosystem.release.config.cjs"

if ! pm2 startOrReload "$PM2_CONFIG" --only "$PM2_APP_NAME" --update-env \
  || ! curl --retry 30 --retry-delay 1 --retry-all-errors -fsS "$LOCAL_BASE_URL/api/health/ready" >/dev/null \
  || ! curl -fsS "$LOCAL_BASE_URL/api/health/version" | node -e '
let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
  const payload = JSON.parse(raw);
  process.exit(payload?.release?.commitSha === process.argv[1] ? 0 : 1);
});
' "$PREVIOUS_SHA"
then
  rm -f -- "$APP_ROOT/current.restore" "$APP_ROOT/previous.restore"
  ln -s "$CURRENT_RELEASE" "$APP_ROOT/current.restore"
  mv -Tf "$APP_ROOT/current.restore" "$CURRENT_LINK"
  ln -s "$PREVIOUS_RELEASE" "$APP_ROOT/previous.restore"
  mv -Tf "$APP_ROOT/previous.restore" "$PREVIOUS_LINK"
  pm2 startOrReload "$CURRENT_LINK/deploy/pm2/ecosystem.release.config.cjs" --only "$PM2_APP_NAME" --update-env || true
  fail "rollback target failed verification; original release restored"
fi

printf 'Rollback completed successfully\n'
printf 'Current: %s\n' "$(readlink -f "$CURRENT_LINK")"
printf 'Previous: %s\n' "$(readlink -f "$PREVIOUS_LINK")"
