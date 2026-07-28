#!/usr/bin/env bash
# Reprend un déploiement interrompu (ex. platform-postgres unhealthy)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=== Réparation déploiement ==="

echo "→ État actuel"
docker compose ps || true

echo ""
echo "→ Logs platform-postgres (dernières 50 lignes)"
docker compose logs --tail=50 platform-postgres || true

PG_STATUS="$(docker compose ps platform-postgres --format '{{.Status}}' 2>/dev/null || true)"
if echo "$PG_STATUS" | grep -qiE 'exited|dead|unhealthy| restarting'; then
  echo ""
  echo "→ Redémarrage platform-postgres..."
  docker compose up -d platform-postgres
fi

bash "$ROOT/scripts/wait-postgres.sh" 180

echo "→ Démarrage ChirpStack + Keycloak..."
docker compose up -d postgres redis mosquitto \
  chirpstack chirpstack-rest-api \
  chirpstack-gateway-bridge chirpstack-gateway-bridge-basicstation \
  keycloak

sleep 15

echo "→ Démarrage services applicatifs..."
docker compose up -d platform-api console ai-agent mqtt-ingestion rule-engine anomaly-worker

bash "$ROOT/scripts/setup-chirpstack.sh" 2>/dev/null || true
bash "$ROOT/scripts/setup-keycloak.sh" 2>/dev/null || true
bash "$ROOT/scripts/migrate-all.sh" 2>/dev/null || true

echo ""
docker compose ps
echo ""
echo "✓ Réparation terminée — testez : curl -s http://localhost:8081/health"
