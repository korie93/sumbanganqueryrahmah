#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-${A11Y_BASE_URL:-${SMOKE_BASE_URL:-http://127.0.0.1:5000}}}"

echo "Running SQR accessibility contrast contract against ${BASE_URL}"

A11Y_BASE_URL="${BASE_URL}" npm run test:e2e:a11y

