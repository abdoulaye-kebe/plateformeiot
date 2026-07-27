#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL="$ROOT/infra/platform/postgres/005_phase3_features.sql"

echo "→ Migration Phase 3 features (MinIO, anomalies, FUOTA, Stripe)"
docker compose -f "$ROOT/docker-compose.yml" exec -T platform-postgres \
  psql -U platform -d platform -f - < "$SQL"

echo "✓ Phase 3 features appliquée"
