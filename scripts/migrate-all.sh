#!/usr/bin/env bash
# Applique toutes les migrations SQL (base déjà initialisée)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG="docker compose -f $ROOT/docker-compose.yml exec -T platform-postgres psql -U platform -d platform -f -"

run() {
  local label="$1" file="$2"
  if [[ -f "$file" ]]; then
    echo "→ $label"
    $PG < "$file"
  fi
}

echo "=== Migrations plateforme ==="
run "Phase 1" "$ROOT/infra/platform/postgres/002_phase1.sql"
run "Phase 2" "$ROOT/infra/platform/postgres/003_phase2.sql"
run "Phase 3" "$ROOT/infra/platform/postgres/005_phase3_features.sql"
run "Payload fix" "$ROOT/infra/platform/postgres/005b_payload_archives_fix.sql"
run "Isolation tenant" "$ROOT/infra/platform/postgres/004_tenant_isolation.sql"
run "Licensing" "$ROOT/infra/platform/postgres/006_plans_licensing.sql"
run "Billing interval" "$ROOT/infra/platform/postgres/007_billing_interval.sql"
run "RF scan" "$ROOT/infra/platform/postgres/008_gateway_rf_scan.sql"
run "Custom dashboards" "$ROOT/infra/platform/postgres/009_custom_dashboards.sql"
run "Starter agent" "$ROOT/infra/platform/postgres/010_starter_agent_feature.sql"

echo "✓ Toutes les migrations appliquées"
