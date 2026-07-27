#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL="$ROOT/infra/platform/postgres/006_plans_licensing.sql"

echo "→ Migration Phase 4 (plans & licensing)"
docker compose -f "$ROOT/docker-compose.yml" exec -T platform-postgres \
  psql -U platform -d platform -f - < "$SQL"

echo "✓ Phase 4 licensing appliquée"
