#!/usr/bin/env bash
# Simule du trafic LoRaWAN pour les dashboards (ChirpStack + plateforme Lorawan).
# Usage : ./scripts/simulate-demo-traffic.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
[ -f "$ROOT/.env" ] && source "$ROOT/.env"

MQTT_HOST="${MQTT_HOST:-localhost}"
MQTT_PORT="${MQTT_HOST_PORT:-1884}"
APP_ID="${CHIRPSTACK_APPLICATION_ID:-bc0328f2-e02f-4ef0-b214-375a6fb13ccb}"
GATEWAYS=("aabbccdd00112233:GW-Paris" "aabbccdd00112234:GW-Lyon")
DEVICES=("0102030405060708" "70b3d57ed006abce")

if ! command -v mosquitto_pub >/dev/null 2>&1; then
  echo "Erreur : mosquitto_pub requis (brew install mosquitto)" >&2
  exit 1
fi

NOW="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
echo "=== Simulation trafic LoRaWAN ($NOW) ==="
echo "MQTT : $MQTT_HOST:$MQTT_PORT"
echo ""

publish() {
  mosquitto_pub -h "$MQTT_HOST" -p "$MQTT_PORT" -t "$1" -m "$2"
}

# 1. Stats gateways → ChirpStack lastSeen + analytics plateforme
echo "→ Stats gateways (ChirpStack : gateways Online)…"
for entry in "${GATEWAYS[@]}"; do
  gw_id="${entry%%:*}"
  gw_name="${entry##*:}"
  payload=$(cat <<EOF
{"gatewayId":"$gw_id","time":"$NOW","stats":{"rxPacketsReceived":42,"txPacketsReceived":3,"rxPacketsReceivedOk":40,"txPacketsEmitted":3}}
EOF
)
  publish "eu868/gateway/$gw_id/event/stats" "$payload"
  echo "   ✓ $gw_name ($gw_id)"
done

# 2. Uplinks devices → analytics / NOC plateforme Lorawan
echo ""
echo "→ Uplinks devices (console Lorawan : Analytics / NOC)…"
dr=5
fcnt=1
for dev in "${DEVICES[@]}"; do
  gw_id="${GATEWAYS[0]%%:*}"
  payload=$(cat <<EOF
{"time":"$NOW","dr":$dr,"fCnt":$fcnt,"fPort":1,"data":"0102AABB","deviceInfo":{"devEui":"$dev","applicationId":"$APP_ID","deviceName":"device-${dev: -6}"},"rxInfo":[{"gatewayId":"$gw_id","rssi":-95,"snr":9.5,"location":{"latitude":48.8566,"longitude":2.3522}}],"txInfo":{"frequency":868100000}}
EOF
)
  publish "application/$APP_ID/device/$dev/event/up" "$payload"
  echo "   ✓ device $dev"
  fcnt=$((fcnt + 1))
done

echo ""
echo "=== Terminé ==="
echo ""
echo "Vérifications :"
echo "  • ChirpStack gateways : http://localhost:8080 → Gateways (last seen mis à jour)"
echo "  • Console Lorawan     : http://localhost:3000/analytics"
echo "  • API overview        : curl http://localhost:8081/api/v1/analytics/overview"
echo ""
echo "Note : les devices ChirpStack restent « Never seen » tant qu'aucun"
echo "       join/uplink LoRaWAN réel n'est reçu via le Gateway Bridge (UDP :1700)."
echo "       Les uplinks ci-dessus alimentent la plateforme Lorawan (TimescaleDB)."
