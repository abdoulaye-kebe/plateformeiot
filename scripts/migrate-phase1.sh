#!/usr/bin/env bash
# Applique la migration Phase 1 sur une base existante
set -euo pipefail
docker compose exec -T platform-postgres psql -U platform -d platform < infra/platform/postgres/002_phase1.sql
echo "✓ Migration Phase 1 appliquée"
