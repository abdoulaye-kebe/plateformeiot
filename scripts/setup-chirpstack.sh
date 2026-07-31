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

# shellcheck source=lib/compose.sh
source "$ROOT/scripts/lib/compose.sh"

align_platform_tenant() {
  local cs_tenant
  cs_tenant="$(grep '^CHIRPSTACK_TENANT_ID=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '\r\n' || true)"
  [[ -n "$cs_tenant" ]] || return 0

  echo "→ Alignement tenant plateforme (chirpstack-default → $cs_tenant)..."
  $COMPOSE_CMD exec -T platform-postgres psql -U platform -d platform -c \
    "UPDATE tenants SET chirpstack_tenant_id = '${cs_tenant}'::uuid WHERE slug = 'chirpstack-default';" \
    >/dev/null 2>&1 || echo "⚠  Mise à jour PostgreSQL ignorée (postgres indisponible)"

  KC_URL="${KEYCLOAK_ADMIN_URL:-http://127.0.0.1:8082}"
  REALM="${KEYCLOAK_REALM:-lorawan}"
  ADMIN_USER="${KEYCLOAK_ADMIN_USER:-admin}"
  ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"

  kc_admin_token() {
    curl -sf -X POST "$KC_URL/realms/master/protocol/openid-connect/token" \
      -H "Content-Type: application/x-www-form-urlencoded" \
      -d "grant_type=password&client_id=admin-cli&username=${ADMIN_USER}&password=${ADMIN_PASS}" \
      | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || true
  }

  sync_kc_user_tenant() {
    local username="$1" token="$2"
    local users_json user_id user_json patched
    users_json="$(curl -sf "$KC_URL/admin/realms/$REALM/users?username=${username}" -H "Authorization: Bearer $token" 2>/dev/null || true)"
    user_id="$(python3 -c "import json,sys; d=json.loads(sys.argv[1] or '[]'); print(d[0]['id'] if d else '')" "$users_json" 2>/dev/null || true)"
    [[ -n "$user_id" ]] || return 0
    user_json="$(curl -sf "$KC_URL/admin/realms/$REALM/users/$user_id" -H "Authorization: Bearer $token" 2>/dev/null || true)"
    patched="$(python3 - <<PY "$user_json" "$cs_tenant"
import json, sys
u = json.loads(sys.argv[1] or '{}')
attrs = u.get('attributes') or {}
attrs['tenant_id'] = [sys.argv[2]]
u['attributes'] = attrs
print(json.dumps(u))
PY
)"
    curl -sf -X PUT "$KC_URL/admin/realms/$REALM/users/$user_id" \
      -H "Authorization: Bearer $token" \
      -H "Content-Type: application/json" \
      -d "$patched" >/dev/null 2>&1 || true
  }

  KTOKEN="$(kc_admin_token)"
  if [[ -n "$KTOKEN" ]]; then
    for u in operator admin viewer tenant-admin; do
      sync_kc_user_tenant "$u" "$KTOKEN"
    done
    echo "✓ Attribut Keycloak tenant_id synchronisé pour operator/admin/viewer"
  else
    echo "⚠  Keycloak indisponible — tenant_id utilisateurs non mis à jour"
  fi
}

if [[ -f "$ENV_FILE" ]]; then
  align_platform_tenant
fi

echo "✓ Configuration OK — redémarrage des services..."
docker compose up -d platform-api ai-agent console
