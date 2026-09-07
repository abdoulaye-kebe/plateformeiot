#!/usr/bin/env bash
# Provisionne un device MQTT + LwM2M et envoie des messages de test
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/compose.sh
source "$ROOT/scripts/lib/compose.sh"

API="${PLATFORM_API_URL:-http://localhost:8081}"
TOKEN="${PLATFORM_API_TOKEN:-}"
TENANT_SLUG="${TENANT_SLUG:-demo}"
MQTT_HOST="${MQTT_IOT_HOST:-localhost}"
MQTT_PORT="${MQTT_IOT_PORT:-1885}"
LWM2M_HOST="${LWM2M_HOST:-localhost}"
LWM2M_PORT="${LWM2M_PORT:-5683}"

auth_header=()
if [[ -n "$TOKEN" ]]; then
  auth_header=(-H "Authorization: Bearer $TOKEN")
fi

api_post() {
  local path="$1" body="$2"
  curl -sf "${auth_header[@]}" -H "Content-Type: application/json" -X POST "$API$path" -d "$body"
}

echo "=== Connectivité IoT ==="
curl -sf "${auth_header[@]}" "$API/api/v1/iot/connectivity" | python3 -m json.tool || true

TS=$(date +%s)
MQTT_ID="lte-mqtt-test-$TS"
LWM2M_ID="lte-lwm2m-test-$TS"

echo ""
echo "=== Provision MQTT device: $MQTT_ID ==="
MQTT_RESP=$(api_post "/api/v1/iot/devices" "{\"name\":\"Test MQTT $TS\",\"protocol\":\"mqtt\",\"externalId\":\"$MQTT_ID\"}")
echo "$MQTT_RESP" | python3 -m json.tool
MQTT_PASS=$(echo "$MQTT_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['credentials']['mqttPassword'])")

echo ""
echo "=== Provision LwM2M device: $LWM2M_ID ==="
LWM2M_RESP=$(api_post "/api/v1/iot/devices" "{\"name\":\"Test LwM2M $TS\",\"protocol\":\"lwm2m\",\"externalId\":\"$LWM2M_ID\"}")
echo "$LWM2M_RESP" | python3 -m json.tool

echo ""
echo "=== Test MQTT publish ==="
PAYLOAD="{\"temperature\":23.1,\"battery\":91,\"test\":true}"
if command -v mosquitto_pub >/dev/null 2>&1; then
  mosquitto_pub -h "$MQTT_HOST" -p "$MQTT_PORT" -u "$MQTT_ID" -P "$MQTT_PASS" \
    -t "devices/$MQTT_ID/telemetry" -m "$PAYLOAD"
  echo "✓ MQTT publié via mosquitto_pub"
else
  echo "mosquitto_pub absent — test via conteneur docker"
  docker run --rm --network host eclipse-mosquitto:2 \
    mosquitto_pub -h "$MQTT_HOST" -p "$MQTT_PORT" -u "$MQTT_ID" -P "$MQTT_PASS" \
    -t "devices/$MQTT_ID/telemetry" -m "$PAYLOAD" || echo "⚠ MQTT test skipped"
fi

sleep 2

echo ""
echo "=== Test LwM2M registration (CoAP) ==="
if command -v coap-client >/dev/null 2>&1; then
  coap-client -m post "coap://$LWM2M_HOST:$LWM2M_PORT/rd?ep=$LWM2M_ID&lt=300&lwm2m=1.0" -e '{"3":{"0":{"11":"86"}}}'
  echo "✓ LwM2M register via coap-client"
else
  echo "coap-client absent — envoi UDP brut via python"
  python3 - <<PY || echo "⚠ LwM2M test skipped"
import socket, struct
# Minimal CoAP POST /rd (non strict — certains modules retenteront)
host, port = "$LWM2M_HOST", int("$LWM2M_PORT")
msg = bytes([0x50, 0x02, 0x00, 0x01]) + bytes([0xB5, len("/rd"), ord('/'), ord('r'), ord('d')])
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
s.settimeout(3)
try:
    s.sendto(msg, (host, port))
    data, _ = s.recvfrom(4096)
    print("LwM2M UDP response bytes:", len(data))
except Exception as e:
    print("LwM2M UDP:", e)
finally:
    s.close()
PY
fi

sleep 2

echo ""
echo "=== Télémétrie en base ==="
$COMPOSE_CMD exec -T platform-postgres psql -U platform -d platform -c \
  "SELECT protocol, external_id, time, left(coalesce(payload_raw, payload_json::text), 80) AS preview
   FROM telemetry_messages ORDER BY time DESC LIMIT 5;"

echo ""
echo "✓ Test terminé — vérifiez la console: /iot-devices"
