#!/usr/bin/env bash
# Reprend un déploiement interrompu (ex. platform-postgres unhealthy)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/compose.sh
source "$ROOT/scripts/lib/compose.sh"
cd "$ROOT"

echo "=== Réparation déploiement ==="

echo "→ État actuel"
compose ps || true

echo ""
echo "→ Logs platform-postgres (dernières 30 lignes)"
compose logs --tail=30 platform-postgres || true

PG_STATUS="$(compose ps platform-postgres --format '{{.Status}}' 2>/dev/null || true)"
if echo "$PG_STATUS" | grep -qiE 'exited|dead|unhealthy|restarting'; then
  echo ""
  echo "→ Redémarrage platform-postgres..."
  compose up -d platform-postgres
fi

bash "$ROOT/scripts/wait-postgres.sh" 180

echo "→ Migrations SQL..."
bash "$ROOT/scripts/migrate-all.sh"

echo "→ Démarrage ChirpStack + Keycloak..."
compose up -d postgres redis mosquitto \
  chirpstack chirpstack-rest-api \
  chirpstack-gateway-bridge chirpstack-gateway-bridge-basicstation \
  keycloak

sleep 15

bash "$ROOT/scripts/setup-chirpstack.sh" || true
bash "$ROOT/scripts/setup-keycloak.sh" || true

echo "→ Rebuild console (URLs publiques)..."
bash "$ROOT/scripts/rebuild-console.sh"

echo "→ Démarrage services applicatifs..."
compose up -d platform-api console ai-agent mqtt-ingestion rule-engine anomaly-worker connector-worker connector-mcp-worker

echo ""
compose ps
echo ""
echo "✓ Réparation terminée — testez : curl -s http://localhost:8081/health"
