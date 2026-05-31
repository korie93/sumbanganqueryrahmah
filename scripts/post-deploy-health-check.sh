#!/usr/bin/env bash
set -euo pipefail

# SQR post-deployment health check.
# Usage: bash scripts/post-deploy-health-check.sh https://sqr.example.com
#
# The script validates the public health endpoints and the app-owned browser
# security headers documented in deploy/SECURITY_HEADERS.md. It is safe to run
# against local development, staging, canary, or production. Expensive probes,
# such as login rate-limit checks, are opt-in.

BASE_URL="${1:-${SQR_POST_DEPLOY_BASE_URL:-http://127.0.0.1:5000}}"
BASE_URL="${BASE_URL%/}"
REQUEST_TIMEOUT_SECONDS="${SQR_POST_DEPLOY_TIMEOUT_SECONDS:-10}"
RATE_LIMIT_PROBE="${SQR_POST_DEPLOY_RATE_LIMIT_PROBE:-0}"

FAILED=0
WARNED=0

HEADERS_FILE="$(mktemp)"
BODY_FILE="$(mktemp)"
READY_BODY_FILE="$(mktemp)"
LIVE_BODY_FILE="$(mktemp)"

cleanup() {
  rm -f "$HEADERS_FILE" "$BODY_FILE" "$READY_BODY_FILE" "$LIVE_BODY_FILE"
}
trap cleanup EXIT

pass() {
  printf 'PASS %s\n' "$1"
}

warn() {
  WARNED=$((WARNED + 1))
  printf 'WARN %s\n' "$1"
}

fail() {
  FAILED=$((FAILED + 1))
  printf 'FAIL %s\n' "$1"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "Required command not found: $1"
  fi
}

fetch_to_file() {
  local path="$1"
  local output_file="$2"
  local status

  status="$(
    curl -sS \
      --max-time "$REQUEST_TIMEOUT_SECONDS" \
      -o "$output_file" \
      -w '%{http_code}' \
      "$BASE_URL$path" 2>/dev/null || printf '000'
  )"

  printf '%s' "$status"
}

fetch_headers() {
  local status

  status="$(
    curl -sS \
      --max-time "$REQUEST_TIMEOUT_SECONDS" \
      -D "$HEADERS_FILE" \
      -o "$BODY_FILE" \
      -w '%{http_code}' \
      "$BASE_URL/" 2>/dev/null || printf '000'
  )"

  if [[ "$status" =~ ^[23][0-9][0-9]$ ]]; then
    pass "Root route responded with HTTP $status"
  else
    fail "Root route did not respond successfully; HTTP $status"
  fi
}

header_value() {
  local header_name="$1"
  awk -v target="$header_name" '
    BEGIN { target = tolower(target) }
    {
      line = $0
      sub(/\r$/, "", line)
      split(line, parts, ":")
      if (tolower(parts[1]) == target) {
        sub(/^[^:]+:[ \t]*/, "", line)
        print line
        exit
      }
    }
  ' "$HEADERS_FILE"
}

check_header_contains() {
  local header_name="$1"
  local expected="$2"
  local value

  value="$(header_value "$header_name")"
  if [[ -z "$value" ]]; then
    fail "$header_name header is missing"
    return
  fi

  if [[ "$value" == *"$expected"* ]]; then
    pass "$header_name contains $expected"
  else
    fail "$header_name expected to contain '$expected' but got '$value'"
  fi
}

check_csp_no_unsafe_inline_scripts() {
  local csp

  csp="$(header_value "Content-Security-Policy")"
  if [[ -z "$csp" ]]; then
    fail "Content-Security-Policy header is missing"
    return
  fi

  if printf '%s\n' "$csp" | grep -Eiq "script-src[^;]*'unsafe-inline'|script-src[^;]*unsafe-inline"; then
    fail "CSP script-src allows unsafe-inline"
  else
    pass "CSP script-src does not allow unsafe-inline"
  fi
}

check_hsts() {
  local hsts
  local max_age

  hsts="$(header_value "Strict-Transport-Security")"
  if [[ -z "$hsts" ]]; then
    if [[ "$BASE_URL" == https://* ]]; then
      fail "Strict-Transport-Security header is missing on HTTPS deployment"
    else
      warn "Strict-Transport-Security absent on non-HTTPS target; skipped hard fail"
    fi
    return
  fi

  max_age="$(printf '%s\n' "$hsts" | sed -nE 's/.*max-age=([0-9]+).*/\1/p' | head -n 1)"
  if [[ -z "$max_age" ]]; then
    fail "Strict-Transport-Security is missing max-age"
    return
  fi

  if (( max_age >= 31536000 )); then
    pass "Strict-Transport-Security max-age is at least one year"
  else
    fail "Strict-Transport-Security max-age is too short: $max_age"
  fi
}

check_health_payload() {
  local path="$1"
  local output_file="$2"
  local status

  status="$(fetch_to_file "$path" "$output_file")"
  if [[ "$status" != "200" ]]; then
    fail "$path returned HTTP $status"
    return
  fi

  if node - "$output_file" <<'NODE'
const { readFileSync } = require("node:fs");
const filePath = process.argv[2];
const payload = JSON.parse(readFileSync(filePath, "utf8"));
if (payload && payload.status === "ok" && payload.ready === true) {
  process.exit(0);
}
console.error(`status=${String(payload?.status)} ready=${String(payload?.ready)}`);
process.exit(1);
NODE
  then
    pass "$path reports status=ok and ready=true"
  else
    fail "$path did not report status=ok and ready=true"
  fi
}

check_auth_endpoint() {
  local status

  status="$(
    curl -sS \
      --max-time "$REQUEST_TIMEOUT_SECONDS" \
      -o /dev/null \
      -w '%{http_code}' \
      -X POST "$BASE_URL/api/auth/login" \
      -H 'Content-Type: application/json' \
      -d '{}' 2>/dev/null || printf '000'
  )"

  case "$status" in
    400|401|403|429)
      pass "Auth login endpoint rejects malformed credentials with HTTP $status"
      ;;
    *)
      fail "Auth login endpoint returned unexpected HTTP $status for malformed credentials"
      ;;
  esac
}

check_auth_rate_limit_probe() {
  local rate_limited_count

  if [[ "$RATE_LIMIT_PROBE" != "1" ]]; then
    warn "Auth rate-limit burst probe skipped; set SQR_POST_DEPLOY_RATE_LIMIT_PROBE=1 to enable"
    return
  fi

  rate_limited_count="$(
    for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
      curl -sS \
        --max-time "$REQUEST_TIMEOUT_SECONDS" \
        -o /dev/null \
        -w '%{http_code}\n' \
        -X POST "$BASE_URL/api/auth/login" \
        -H 'Content-Type: application/json' \
        -d '{"username":"post-deploy-probe","password":"post-deploy-probe"}' 2>/dev/null || true
    done | grep -c '^429$' || true
  )"

  if (( rate_limited_count > 0 )); then
    pass "Auth rate limiting triggered during optional burst probe"
  else
    fail "Auth rate limiting did not trigger during optional burst probe"
  fi
}

printf 'SQR post-deployment health check\n'
printf 'Target: %s\n' "$BASE_URL"
printf 'Timeout: %ss\n\n' "$REQUEST_TIMEOUT_SECONDS"

require_command curl
require_command node

if (( FAILED == 0 )); then
  fetch_headers
fi

printf '\nSecurity headers\n'
check_header_contains "Content-Security-Policy" "default-src"
check_header_contains "Content-Security-Policy" "require-trusted-types-for"
check_header_contains "X-Content-Type-Options" "nosniff"
check_header_contains "X-Frame-Options" "SAMEORIGIN"
check_header_contains "Referrer-Policy" "no-referrer"
check_header_contains "Permissions-Policy" "camera=()"
check_header_contains "Permissions-Policy" "microphone=()"
check_header_contains "X-Permitted-Cross-Domain-Policies" "none"
check_header_contains "Cross-Origin-Opener-Policy" "same-origin"
check_header_contains "Cross-Origin-Resource-Policy" "same-origin"
check_csp_no_unsafe_inline_scripts
check_hsts

printf '\nApplication health\n'
check_health_payload "/api/health/live" "$LIVE_BODY_FILE"
check_health_payload "/api/health/ready" "$READY_BODY_FILE"

printf '\nAuth surface\n'
check_auth_endpoint
check_auth_rate_limit_probe

printf '\nSummary\n'
if (( FAILED == 0 )); then
  printf 'PASS deployment verified'
  if (( WARNED > 0 )); then
    printf ' with %d warning(s)' "$WARNED"
  fi
  printf '\n'
  exit 0
fi

printf 'FAIL %d check(s) failed' "$FAILED"
if (( WARNED > 0 )); then
  printf ' and %d warning(s) emitted' "$WARNED"
fi
printf '\n'
exit 1
