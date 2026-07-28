#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL="$ROOT/infra/platform/postgres/008_gateway_rf_scan.sql"

echo "→ Migration scan RF gateways"
docker compose -f "$ROOT/docker-compose.yml" exec -T platform-postgres \
  psql -U platform -d platform -f - < "$SQL"

echo "✓ Scan RF appliqué"
