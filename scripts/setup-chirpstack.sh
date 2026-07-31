#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${1:-.env}"
TENANT_ID="${CHIRPSTACK_TENANT_ID:-a9307558-82d4-4dbc-9ebc-daf565804305}"
REST_URL="${CHIRPSTACK_REST_URL:-http://localhost:8090}"

if [[ ! -f "$ENV_FILE" ]]; then
  cp .env.example "$ENV_FILE"
  echo "✓ Créé $ENV_FILE depuis .env.example"
fi

set_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    if sed --version >/dev/null 2>&1; then
      sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
    else
      sed -i '' "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
    fi
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

if ! grep -q "^CHIRPSTACK_TENANT_ID=.\+" "$ENV_FILE" 2>/dev/null; then
  set_env "CHIRPSTACK_TENANT_ID" "$TENANT_ID"
  echo "✓ Tenant ID configuré : $TENANT_ID"
fi

token_can_create_tenants() {
  local token="$1"
  [[ -n "$token" ]] || return 1
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    -H "Grpc-Metadata-Authorization: Bearer ${token}" \
    -H 'Content-Type: application/json' \
    -d '{"tenant":{"name":"__probe__","canHaveGateways":true,"maxGatewayCount":1,"maxDeviceCount":1}}' \
    "${REST_URL}/api/tenants")"
  [[ "$code" == "200" || "$code" == "201" ]]
}

create_global_api_key() {
  echo "→ Génération clé API ChirpStack globale (admin)..."
  docker compose exec -T chirpstack chirpstack --config /etc/chirpstack create-api-key --name "lorawan-platform-admin" 2>&1 \
    | awk '/^token: / { print $2; exit }'
}

CURRENT_TOKEN="$(grep '^CHIRPSTACK_API_TOKEN=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '\r\n' || true)"

if token_can_create_tenants "$CURRENT_TOKEN"; then
  echo "✓ CHIRPSTACK_API_TOKEN valide (création de tenants OK)"
else
  echo "⚠  Token ChirpStack absent ou limité à un seul tenant — génération d'une clé globale..."
  NEW_TOKEN="$(create_global_api_key)"
  if [[ -z "$NEW_TOKEN" ]]; then
    echo "✗ Impossible de créer la clé API. Vérifiez que ChirpStack tourne : docker compose up -d chirpstack"
    exit 1
  fi
  set_env "CHIRPSTACK_API_TOKEN" "$NEW_TOKEN"
  echo "✓ Clé API globale enregistrée dans $ENV_FILE"
fi

echo "✓ Configuration OK — redémarrage des services..."
docker compose up -d platform-api ai-agent console
