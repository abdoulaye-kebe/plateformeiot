#!/usr/bin/env bash
# Corrige .env + Keycloak + console pour utiliser l'IP publique (AWS EC2)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/compose.sh
source "$ROOT/scripts/lib/compose.sh"
# shellcheck source=lib/public-host.sh
source "$ROOT/scripts/lib/public-host.sh"
cd "$ROOT"

PUBLIC_HOST="${PUBLIC_HOST:-}"
if [[ -z "$PUBLIC_HOST" ]]; then
  PUBLIC_HOST="$(detect_public_host)"
fi

if [[ -z "$PUBLIC_HOST" ]]; then
  echo "✗ Impossible de détecter l'IP publique — exportez PUBLIC_HOST=52.212.191.28"
  exit 1
fi

if is_private_ip "$PUBLIC_HOST"; then
  echo "⚠ IP privée détectée ($PUBLIC_HOST) — spécifiez l'IP publique :"
  echo "  export PUBLIC_HOST=52.212.191.28 && sudo -E bash scripts/fix-public-host.sh"
  exit 1
fi

HTTP_PORT="${PUBLIC_HTTP_PORT:-3000}"
API_PORT="${API_PORT:-8081}"
KEYCLOAK_PORT="${KEYCLOAK_PORT:-8082}"
CHIRPSTACK_UI_PORT="${CHIRPSTACK_UI_PORT:-8080}"
BASE="http://${PUBLIC_HOST}"

set_env() {
  local key="$1" val="$2"
  if [[ -f .env ]] && grep -q "^${key}=" .env; then
    sed -i.bak "s|^${key}=.*|${key}=${val}|" .env
  else
    echo "${key}=${val}" >> .env
  fi
}

[[ -f .env ]] || cp .env.example .env

echo "→ Configuration IP publique : $PUBLIC_HOST"
set_env "PUBLIC_HOST" "$PUBLIC_HOST"
set_env "CONSOLE_PUBLIC_URL" "${BASE}:${HTTP_PORT}"
set_env "KEYCLOAK_ISSUER" "${BASE}:${KEYCLOAK_PORT}/realms/lorawan"
set_env "KEYCLOAK_PUBLIC_HOST" "$PUBLIC_HOST"
set_env "KEYCLOAK_PUBLIC_PORT" "$KEYCLOAK_PORT"
set_env "NEXT_PUBLIC_PLATFORM_API_URL" "${BASE}:${API_PORT}"
set_env "NEXT_PUBLIC_KEYCLOAK_URL" "${BASE}:${KEYCLOAK_PORT}"
set_env "NEXT_PUBLIC_CHIRPSTACK_URL" "${BASE}:${CHIRPSTACK_UI_PORT}"
set_env "STRIPE_SUCCESS_URL" "${BASE}:${HTTP_PORT}/billing?paid=1"
set_env "STRIPE_CANCEL_URL" "${BASE}:${HTTP_PORT}/billing"

echo "→ Redémarrage Keycloak + API avec hostname public..."
compose up -d keycloak platform-api

sleep 10
bash "$ROOT/scripts/setup-keycloak.sh"
bash "$ROOT/scripts/rebuild-console.sh"

echo ""
echo "✓ Keycloak admin : ${BASE}:${KEYCLOAK_PORT}/admin/  (admin / admin)"
echo "✓ Console        : ${BASE}:${HTTP_PORT}/login"
