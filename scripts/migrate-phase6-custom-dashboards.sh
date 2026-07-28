#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL="$ROOT/infra/platform/postgres/009_custom_dashboards.sql"

echo "→ Migration tableaux de bord personnalisés"
docker compose -f "$ROOT/docker-compose.yml" exec -T platform-postgres \
  psql -U platform -d platform -f - < "$SQL"

echo "✓ Tableaux de bord personnalisés appliqué"
