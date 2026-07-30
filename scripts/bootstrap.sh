#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=== Lorawan Platform — bootstrap production ==="
docker compose up -d
echo "→ Attente Postgres..."
sleep 5
bash scripts/setup-chirpstack.sh
bash scripts/setup-keycloak.sh
bash scripts/migrate-all.sh 2>/dev/null || true
docker compose up -d platform-api console ai-agent mqtt-ingestion rule-engine anomaly-worker connector-worker
echo "✓ Bootstrap terminé"
echo "  Console : http://localhost:3000/login (admin / admin)"
echo "  Tenants : http://localhost:3000/admin/tenants"
