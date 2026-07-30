#!/usr/bin/env bash
# Déploiement production sur Ubuntu 22.04
#
# Usage :
#   git clone https://github.com/abdoulaye-kebe/plateformeiot.git lorawan-platform
#   cd lorawan-platform
#   PUBLIC_HOST=203.0.113.10 sudo -E bash scripts/deploy-ubuntu-22.04.sh
#
# Ou avec un nom de domaine :
#   PUBLIC_HOST=iot.example.com bash scripts/deploy-ubuntu-22.04.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PUBLIC_HOST="${PUBLIC_HOST:-}"
PUBLIC_HTTP_PORT="${PUBLIC_HTTP_PORT:-3000}"
API_PORT="${API_PORT:-8081}"
KEYCLOAK_PORT="${KEYCLOAK_PORT:-8082}"
CHIRPSTACK_UI_PORT="${CHIRPSTACK_UI_PORT:-8080}"

echo "=== Lorawan Platform — déploiement Ubuntu 22.04 ==="

if [[ -f /etc/os-release ]]; then
  . /etc/os-release
  echo "OS : ${PRETTY_NAME:-unknown}"
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "→ Docker absent — installation..."
  if [[ "${EUID}" -ne 0 ]]; then
    echo "Relancez avec sudo ou installez Docker : sudo bash scripts/install-docker-ubuntu-22.04.sh"
    exit 1
  fi
  bash "$ROOT/scripts/install-docker-ubuntu-22.04.sh"
fi

# shellcheck source=lib/public-host.sh
source "$ROOT/scripts/lib/public-host.sh"

if [[ -z "$PUBLIC_HOST" ]]; then
  PUBLIC_HOST="$(detect_public_host)"
  echo "→ PUBLIC_HOST auto-détecté : $PUBLIC_HOST"
fi

if is_private_ip "$PUBLIC_HOST"; then
  echo "⚠ IP privée ($PUBLIC_HOST) — les clients externes ne pourront pas se connecter."
  echo "  Sur AWS EC2, relancez avec : export PUBLIC_HOST=<ip-publique>"
  AWS_PUB="$(curl -sf --max-time 2 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)"
  if [[ -n "$AWS_PUB" ]]; then
    PUBLIC_HOST="$AWS_PUB"
    echo "→ Utilisation IP publique AWS : $PUBLIC_HOST"
  fi
fi

if [[ ! -f .env ]]; then
  echo "→ Création .env depuis .env.example"
  cp .env.example .env
fi

# Met à jour les URLs publiques dans .env
set_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" .env 2>/dev/null; then
    sed -i.bak "s|^${key}=.*|${key}=${val}|" .env
  else
    echo "${key}=${val}" >> .env
  fi
}

BASE="http://${PUBLIC_HOST}"
set_env "CONSOLE_PUBLIC_URL" "${BASE}:${PUBLIC_HTTP_PORT}"
set_env "KEYCLOAK_ISSUER" "${BASE}:${KEYCLOAK_PORT}/realms/lorawan"
set_env "KEYCLOAK_PUBLIC_HOST" "${PUBLIC_HOST}"
set_env "KEYCLOAK_PUBLIC_PORT" "${KEYCLOAK_PORT}"
set_env "NEXT_PUBLIC_PLATFORM_API_URL" "${BASE}:${API_PORT}"
set_env "NEXT_PUBLIC_KEYCLOAK_URL" "${BASE}:${KEYCLOAK_PORT}"
set_env "NEXT_PUBLIC_CHIRPSTACK_URL" "${BASE}:${CHIRPSTACK_UI_PORT}"
set_env "STRIPE_SUCCESS_URL" "${BASE}:${PUBLIC_HTTP_PORT}/billing?paid=1"
set_env "STRIPE_CANCEL_URL" "${BASE}:${PUBLIC_HTTP_PORT}/billing"
set_env "AUTH_MODE" "required"

echo "→ URLs publiques configurées pour ${PUBLIC_HOST}"

if [[ ! -f infra/chirpstack/docker-compose.yml ]]; then
  echo "→ Clone ChirpStack docker..."
  git clone --depth 1 https://github.com/chirpstack/chirpstack-docker.git infra/chirpstack
fi

echo "→ Build des images (console avec URLs publiques)..."
export NEXT_PUBLIC_PLATFORM_API_URL="${BASE}:${API_PORT}"
export NEXT_PUBLIC_KEYCLOAK_URL="${BASE}:${KEYCLOAK_PORT}"
export NEXT_PUBLIC_CHIRPSTACK_URL="${BASE}:${CHIRPSTACK_UI_PORT}"

docker compose build --pull console platform-api ai-agent mqtt-ingestion rule-engine anomaly-worker connector-worker

echo "→ Phase 1 : bases de données et infra..."
docker compose up -d platform-postgres postgres redis platform-redis mosquitto nats minio mailpit

bash "$ROOT/scripts/wait-postgres.sh" 180

echo "→ Phase 2 : ChirpStack + Keycloak..."
docker compose up -d chirpstack chirpstack-rest-api \
  chirpstack-gateway-bridge chirpstack-gateway-bridge-basicstation keycloak

sleep 15

echo "→ Phase 3 : services applicatifs..."
docker compose up -d platform-api console ai-agent mqtt-ingestion rule-engine anomaly-worker

echo "→ Attente Postgres (vérif)..."
bash "$ROOT/scripts/wait-postgres.sh" 60 || true

bash "$ROOT/scripts/setup-chirpstack.sh" || true
bash "$ROOT/scripts/setup-keycloak.sh" || true
bash "$ROOT/scripts/migrate-all.sh"

echo "→ Rebuild console (URLs publiques)..."
bash "$ROOT/scripts/rebuild-console.sh"

echo ""
echo "============================================"
echo "✓ Déploiement terminé"
echo "============================================"
echo "  Console      : ${BASE}:${PUBLIC_HTTP_PORT}/login"
echo "  API          : ${BASE}:${API_PORT}/health"
echo "  Keycloak     : ${BASE}:${KEYCLOAK_PORT}"
echo "  ChirpStack   : ${BASE}:${CHIRPSTACK_UI_PORT}"
echo ""
echo "Prochaines étapes :"
echo "  1. ChirpStack UI → créer un API token (Administration → API keys)"
echo "  2. Éditer .env : CHIRPSTACK_API_TOKEN et CHIRPSTACK_TENANT_ID"
echo "  3. Redémarrer : docker compose up -d platform-api ai-agent"
echo "  4. Se connecter : admin / admin (changez le mot de passe en prod)"
echo ""
echo "Ports UDP gateway LoRaWAN : 1700 (Packet Forwarder)"
echo "Firewall (ufw) :"
echo "  sudo ufw allow ${PUBLIC_HTTP_PORT}/tcp"
echo "  sudo ufw allow ${API_PORT}/tcp"
echo "  sudo ufw allow ${KEYCLOAK_PORT}/tcp"
echo "  sudo ufw allow 1700/udp"
