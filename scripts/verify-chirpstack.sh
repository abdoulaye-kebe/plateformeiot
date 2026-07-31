#!/usr/bin/env bash
# Vérifie la connectivité ChirpStack ↔ plateforme (REST + platform-api)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${1:-.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ENV_FILE"
  set +a
fi

REST_URL="${CHIRPSTACK_REST_URL:-http://localhost:8090}"
TENANT_ID="${CHIRPSTACK_TENANT_ID:-}"
API_URL="${NEXT_PUBLIC_PLATFORM_API_URL:-http://localhost:8081}"
KC_URL="${KEYCLOAK_ADMIN_URL:-http://127.0.0.1:8082}"
REALM="${KEYCLOAK_REALM:-lorawan}"
KC_CLIENT="${NEXT_PUBLIC_KEYCLOAK_CLIENT_ID:-lorawan-console}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass=0
fail=0
warn=0

ok() { echo -e "${GREEN}✓${NC} $1"; pass=$((pass + 1)); }
ko() { echo -e "${RED}✗${NC} $1"; fail=$((fail + 1)); }
warn_msg() { echo -e "${YELLOW}!${NC} $1"; warn=$((warn + 1)); }

cs_get() {
  local path="$1"
  curl -sf -H "Grpc-Metadata-Authorization: Bearer ${CHIRPSTACK_API_TOKEN}" "${REST_URL}${path}"
}

cs_code() {
  local method="$1" path="$2" body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -s -o /dev/null -w '%{http_code}' -X "$method" \
      -H "Grpc-Metadata-Authorization: Bearer ${CHIRPSTACK_API_TOKEN}" \
      -H 'Content-Type: application/json' \
      -d "$body" "${REST_URL}${path}"
  else
    curl -s -o /dev/null -w '%{http_code}' -X "$method" \
      -H "Grpc-Metadata-Authorization: Bearer ${CHIRPSTACK_API_TOKEN}" \
      "${REST_URL}${path}"
  fi
}

echo "=== Vérification ChirpStack ↔ plateforme ==="
echo "REST: $REST_URL | Tenant: ${TENANT_ID:-non défini} | API: $API_URL"
echo ""

# --- Services de base ---
if curl -sf "${API_URL}/health" | grep -q '"status":"ok"'; then
  ok "platform-api /health"
else
  ko "platform-api /health"
fi

if curl -sf "${REST_URL}/api/tenants?limit=1" -H "Grpc-Metadata-Authorization: Bearer ${CHIRPSTACK_API_TOKEN:-}" >/dev/null 2>&1; then
  ok "ChirpStack REST accessible"
else
  ko "ChirpStack REST inaccessible ($REST_URL)"
fi

if [[ -z "${CHIRPSTACK_API_TOKEN:-}" ]]; then
  ko "CHIRPSTACK_API_TOKEN absent dans $ENV_FILE"
else
  ok "CHIRPSTACK_API_TOKEN présent"
fi

probe_code="$(cs_code POST /api/tenants '{"tenant":{"name":"__verify_probe__","canHaveGateways":true,"maxGatewayCount":1,"maxDeviceCount":1}}' 2>/dev/null || echo 000)"
if [[ "$probe_code" == "200" || "$probe_code" == "201" ]]; then
  ok "Token ChirpStack global (création tenant autorisée)"
  probe_id="$(cs_get "/api/tenants?limit=50&search=__verify_probe__" 2>/dev/null | python3 -c "import sys,json; r=json.load(sys.stdin).get('result',[]); print(r[0]['id'] if r else '')" 2>/dev/null || true)"
  if [[ -n "$probe_id" ]]; then
    cs_code DELETE "/api/tenants/${probe_id}" >/dev/null 2>&1 || true
  fi
elif [[ "$probe_code" == "401" || "$probe_code" == "403" ]]; then
  warn_msg "Token ChirpStack limité (pas de création tenant) — exécutez ./scripts/setup-chirpstack.sh"
else
  warn_msg "Probe tenant HTTP $probe_code"
fi

echo ""
echo "--- ChirpStack REST (tenant ${TENANT_ID:-*}) ---"

if [[ -n "$TENANT_ID" ]]; then
  for entry in \
    "Applications|/api/applications?tenantId=${TENANT_ID}&limit=5" \
    "Device profiles|/api/device-profiles?tenantId=${TENANT_ID}&limit=5" \
    "Gateways|/api/gateways?tenantId=${TENANT_ID}&limit=5"; do
    label="${entry%%|*}"
    path="${entry#*|}"
    if cs_get "$path" >/dev/null 2>&1; then
      ok "GET $label"
    else
      ko "GET $label"
    fi
  done

  # Devices agrégés (comme platform-api)
  app_count="$(cs_get "/api/applications?tenantId=${TENANT_ID}&limit=1" | python3 -c "import sys,json; print(json.load(sys.stdin).get('totalCount',0))" 2>/dev/null || echo 0)"
  if [[ "$app_count" -gt 0 ]]; then
    app_id="$(cs_get "/api/applications?tenantId=${TENANT_ID}&limit=1" | python3 -c "import sys,json; r=json.load(sys.stdin).get('result',[]); print(r[0].get('id','') if r else '')" 2>/dev/null || true)"
    if [[ -n "$app_id" ]] && cs_get "/api/devices?applicationId=${app_id}&limit=5" >/dev/null 2>&1; then
      ok "GET Devices (via application $app_id)"
    else
      ko "GET Devices"
    fi
  else
    warn_msg "Aucune application — devices non testés"
  fi
else
  warn_msg "CHIRPSTACK_TENANT_ID absent — skip listes tenant"
fi

echo ""
echo "--- platform-api (JWT operator) ---"

TOKEN="$(curl -sf -X POST "${KC_URL}/realms/${REALM}/protocol/openid-connect/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d "grant_type=password&client_id=${KC_CLIENT}&username=operator&password=operator" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || true)"

if [[ -z "$TOKEN" ]]; then
  warn_msg "Impossible d'obtenir un JWT Keycloak (operator/operator) — skip routes authentifiées"
else
  ok "JWT Keycloak obtenu"

  pa_check() {
    local label="$1" path="$2" expect="${3:-200}"
    local code
    code="$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "${API_URL}${path}")"
    if [[ "$code" == "$expect" ]]; then
      ok "$label ($code)"
    else
      ko "$label (HTTP $code, attendu $expect)"
    fi
  }

  pa_check "GET /api/v1/status" "/api/v1/status"
  pa_check "GET applications" "/api/v1/lorawan/applications?limit=5"
  pa_check "GET device-profiles" "/api/v1/lorawan/device-profiles?limit=5"
  pa_check "GET devices" "/api/v1/lorawan/devices?limit=5"
  pa_check "GET gateways" "/api/v1/lorawan/gateways?limit=5"
  pa_check "GET onboarding/status" "/api/v1/onboarding/status"
  pa_check "GET decoders" "/api/v1/decoders"

  net_ok="$(curl -sf -H "Authorization: Bearer $TOKEN" "${API_URL}/api/v1/status" | python3 -c "import sys,json; print(json.load(sys.stdin).get('networkConnected', False))" 2>/dev/null || echo False)"
  if [[ "$net_ok" == "True" ]]; then
    ok "ChirpStack ping via platform-api (networkConnected)"
  else
    ko "ChirpStack ping via platform-api"
  fi
fi

echo ""
echo "--- Résumé ---"
echo -e "OK: ${GREEN}${pass}${NC} | Échecs: ${RED}${fail}${NC} | Avertissements: ${YELLOW}${warn}${NC}"

if [[ "$fail" -gt 0 ]]; then
  echo ""
  echo "Actions suggérées :"
  echo "  ./scripts/setup-chirpstack.sh"
  echo "  ./scripts/migrate-all.sh"
  echo "  docker compose build platform-api && docker compose up -d --force-recreate platform-api"
  exit 1
fi

exit 0
