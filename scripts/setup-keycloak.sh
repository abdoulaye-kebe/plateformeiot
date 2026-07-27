#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KC_URL="${KEYCLOAK_ADMIN_URL:-http://localhost:8082}"
REALM="${KEYCLOAK_REALM:-lorawan}"
ADMIN_USER="${KEYCLOAK_ADMIN_USER:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
SMTP_HOST="${KEYCLOAK_SMTP_HOST:-mailpit}"
SMTP_PORT="${KEYCLOAK_SMTP_PORT:-1025}"
SMTP_FROM="${KEYCLOAK_SMTP_FROM:-noreply@lorawan.local}"

echo "→ Attente Keycloak (port 8082)..."
for i in {1..60}; do
  if curl -sf "$KC_URL/realms/$REALM/.well-known/openid-configuration" >/dev/null 2>&1; then
    echo "✓ Keycloak realm $REALM prêt"
    break
  fi
  if [[ $i -eq 60 ]]; then
    echo "✗ Keycloak non disponible après 120s"
    exit 1
  fi
  sleep 2
done

admin_token() {
  curl -sf -X POST "$KC_URL/realms/master/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=password&client_id=admin-cli&username=${ADMIN_USER}&password=${ADMIN_PASS}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])"
}

echo "→ Configuration profil utilisateur (attribut tenant_id)..."
TOKEN="$(admin_token)"
PROFILE="$(curl -sf "$KC_URL/admin/realms/$REALM/users/profile" -H "Authorization: Bearer $TOKEN")"
UPDATED="$(python3 - <<'PY' "$PROFILE"
import json, sys
profile = json.loads(sys.argv[1])
names = {a.get("name") for a in profile.get("attributes", [])}
if "tenant_id" in names:
    print("")
    sys.exit(0)
profile.setdefault("attributes", []).append({
    "name": "tenant_id",
    "displayName": "ChirpStack Tenant ID",
    "permissions": {"view": ["admin"], "edit": ["admin"]},
    "multivalued": False,
})
print(json.dumps(profile))
PY
)"

if [[ -n "$UPDATED" ]]; then
  curl -sf -X PUT "$KC_URL/admin/realms/$REALM/users/profile" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$UPDATED" >/dev/null
  echo "✓ Attribut tenant_id ajouté au profil Keycloak"
else
  echo "✓ Attribut tenant_id déjà présent"
fi

echo "→ Configuration SMTP (invitations email via Mailpit)..."
REALM_JSON="$(curl -sf "$KC_URL/admin/realms/$REALM" -H "Authorization: Bearer $TOKEN")"
SMTP_PATCH="$(python3 - <<'PY' "$REALM_JSON" "$SMTP_HOST" "$SMTP_PORT" "$SMTP_FROM"
import json, sys
realm = json.loads(sys.argv[1])
host, port, from_addr = sys.argv[2], sys.argv[3], sys.argv[4]
realm["smtpServer"] = {
    "host": host,
    "port": port,
    "from": from_addr,
    "fromDisplayName": "Lorawan Platform",
    "ssl": "false",
    "starttls": "false",
    "auth": "false",
}
print(json.dumps(realm))
PY
)"
curl -sf -X PUT "$KC_URL/admin/realms/$REALM" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$SMTP_PATCH" >/dev/null
echo "✓ SMTP configuré ($SMTP_FROM via $SMTP_HOST:$SMTP_PORT — UI Mailpit http://localhost:8025)"

echo "✓ Setup Keycloak terminé"
