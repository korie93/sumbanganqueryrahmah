#!/usr/bin/env bash
set -euo pipefail

# Verifies that a deployment checkout is on the intended branch and exactly
# matches origin before npm install, build, or PM2 restart commands run.
#
# Usage:
#   bash scripts/verify-server-checkout.sh main
#   SQR_DEPLOY_BRANCH=main bash scripts/verify-server-checkout.sh

BRANCH="${1:-${SQR_DEPLOY_BRANCH:-main}}"
FAILED=0

pass() {
  printf 'PASS %s\n' "$1"
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

require_command git

if [[ "$FAILED" -eq 0 ]]; then
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    fail "Current directory is not a Git checkout"
  else
    pass "Current directory is a Git checkout"
  fi
fi

if [[ "$FAILED" -eq 0 ]]; then
  if git fetch origin --prune; then
    pass "Fetched origin"
  else
    fail "Unable to fetch origin before checkout verification"
  fi
fi

if [[ "$FAILED" -eq 0 ]]; then
  WORKING_TREE_STATUS="$(git status --short)"
  if [[ -z "$WORKING_TREE_STATUS" ]]; then
    pass "Working tree is clean"
  else
    fail "Working tree has local changes; inspect git status before deploy"
    printf '%s\n' "$WORKING_TREE_STATUS"
  fi

  CURRENT_BRANCH="$(git branch --show-current)"
  if [[ "$CURRENT_BRANCH" == "$BRANCH" ]]; then
    pass "Current branch is $BRANCH"
  else
    fail "Current branch is '$CURRENT_BRANCH', expected '$BRANCH'"
  fi

  if git rev-parse --verify "origin/$BRANCH" >/dev/null 2>&1; then
    LOCAL_COMMIT="$(git rev-parse HEAD)"
    REMOTE_COMMIT="$(git rev-parse "origin/$BRANCH")"

    if [[ "$LOCAL_COMMIT" == "$REMOTE_COMMIT" ]]; then
      pass "Server checkout matches origin/$BRANCH at $LOCAL_COMMIT"
    else
      fail "Server checkout is not at origin/$BRANCH"
      printf 'local : %s\nremote: %s\n' "$LOCAL_COMMIT" "$REMOTE_COMMIT"
    fi
  else
    fail "Remote branch origin/$BRANCH was not found"
  fi
fi

if [[ "$FAILED" -gt 0 ]]; then
  printf 'Server checkout verification failed with %s issue(s).\n' "$FAILED"
  exit 1
fi

printf 'Server checkout verification passed for branch %s.\n' "$BRANCH"
