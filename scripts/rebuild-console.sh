#!/usr/bin/env bash
# Rebuild la console avec les URLs publiques du .env (fix "Failed to fetch" en prod)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/compose.sh
source "$ROOT/scripts/lib/compose.sh"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

PUBLIC_HOST="${PUBLIC_HOST:-}"
if [[ -z "$PUBLIC_HOST" && -n "${CONSOLE_PUBLIC_URL:-}" ]]; then
  PUBLIC_HOST="$(echo "$CONSOLE_PUBLIC_URL" | sed -E 's|https?://([^:/]+).*|\1|')"
fi
if [[ -z "$PUBLIC_HOST" ]]; then
  echo "✗ Définissez PUBLIC_HOST ou CONSOLE_PUBLIC_URL dans .env"
  exit 1
fi

HTTP_PORT="${PUBLIC_HTTP_PORT:-3000}"
API_PORT="${API_PORT:-8081}"
KEYCLOAK_PORT="${KEYCLOAK_PORT:-8082}"
CHIRPSTACK_UI_PORT="${CHIRPSTACK_UI_PORT:-8080}"
BASE="http://${PUBLIC_HOST}"

export NEXT_PUBLIC_PLATFORM_API_URL="${NEXT_PUBLIC_PLATFORM_API_URL:-${BASE}:${API_PORT}}"
export NEXT_PUBLIC_KEYCLOAK_URL="${NEXT_PUBLIC_KEYCLOAK_URL:-${BASE}:${KEYCLOAK_PORT}}"
export NEXT_PUBLIC_CHIRPSTACK_URL="${NEXT_PUBLIC_CHIRPSTACK_URL:-${BASE}:${CHIRPSTACK_UI_PORT}}"

echo "→ Rebuild console avec :"
echo "   API       : $NEXT_PUBLIC_PLATFORM_API_URL"
echo "   Keycloak  : $NEXT_PUBLIC_KEYCLOAK_URL"
echo "   ChirpStack: $NEXT_PUBLIC_CHIRPSTACK_URL"

compose build --no-cache console
compose up -d console

echo "✓ Console redémarrée — ouvrez ${CONSOLE_PUBLIC_URL:-${BASE}:${HTTP_PORT}/login}"
