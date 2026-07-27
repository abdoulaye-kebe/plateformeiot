#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL="$ROOT/infra/platform/postgres/007_billing_interval.sql"

echo "→ Migration billing interval (mensuel + annuel)"
docker compose -f "$ROOT/docker-compose.yml" exec -T platform-postgres \
  psql -U platform -d platform -f - < "$SQL"

echo "✓ Billing interval appliquée"
