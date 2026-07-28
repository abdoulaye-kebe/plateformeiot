#!/usr/bin/env bash
# Attend que platform-postgres soit healthy (ou affiche les logs en cas d'échec)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MAX_WAIT="${1:-180}"
echo "→ Attente platform-postgres (max ${MAX_WAIT}s)..."

for ((i=1; i<=MAX_WAIT; i+=2)); do
  status="$(docker compose ps platform-postgres --format '{{.Status}}' 2>/dev/null || true)"
  if echo "$status" | grep -qi healthy; then
    echo "✓ platform-postgres healthy"
    exit 0
  fi
  if echo "$status" | grep -qiE 'exited|dead'; then
    echo "✗ platform-postgres arrêté — derniers logs :"
    docker compose logs --tail=100 platform-postgres || true
    exit 1
  fi
  sleep 2
done

echo "✗ Timeout — platform-postgres pas healthy après ${MAX_WAIT}s"
docker compose ps platform-postgres || true
docker compose logs --tail=100 platform-postgres || true
exit 1
