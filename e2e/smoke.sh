#!/usr/bin/env bash
#
# Placeholder end-to-end smoke check (M01.5 S9). Exercises the *deployed*
# environment after the CI deploy stages: the API answers its readiness probe and
# the web shell loads. This is a real check against live URLs — not a fake pass —
# and gates the pipeline. Milestone 10 replaces/augments this with the
# critical-journey browser tests (see README.md); the stage is already wired.
#
# Environment contract (supplied by CI from repo variables, so the target is
# config-driven and can be repointed at a dedicated staging/preview env later
# without touching the workflow):
#   E2E_API_URL  base URL of the API (Cloud Run service)
#   E2E_WEB_URL  base URL of the web app (Firebase Hosting)
set -euo pipefail

: "${E2E_API_URL:?E2E_API_URL is required (the deployed API base URL)}"
: "${E2E_WEB_URL:?E2E_WEB_URL is required (the deployed web base URL)}"

# Retry to absorb a cold start + Neon wake (Cloud Run minInstances=0).
check() {
  local name="$1" url="$2" code=""
  for i in $(seq 1 6); do
    code="$(curl -fsS -o /dev/null -w '%{http_code}' "$url" || true)"
    if [ "$code" = "200" ]; then
      echo "✓ ${name}: ${url} -> 200"
      return 0
    fi
    echo "… ${name}: ${url} -> ${code:-no-response} (attempt ${i}/6), retrying"
    sleep 5
  done
  echo "✗ ${name}: ${url} -> ${code:-no-response}"
  return 1
}

# API readiness. NB: use /readyz, not /healthz — Cloud Run does not route
# external traffic to the liveness-probe path (/healthz). /readyz also pings the
# DB, so a 200 confirms the API + its database are live.
check "API readiness" "${E2E_API_URL%/}/readyz"

# Web shell loads (Firebase Hosting serves index.html).
check "Web shell" "${E2E_WEB_URL%/}/"

echo "Smoke checks passed."
