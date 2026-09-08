#!/usr/bin/env bash
# Génère un fichier preset Adeunis JSON pour Orange IoT Platform
set -euo pipefail

IMEI="${1:?Usage: $0 <IMEI> [nom-capteur]}"
NAME="${2:-Dry Contacts $IMEI}"
API="${PLATFORM_API_URL:-http://localhost:8081}"
TOKEN="${PLATFORM_API_TOKEN:-}"
HOST="${CELLULAR_PUBLIC_HOST:-52.212.191.28}"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/configs/adeunis"

auth=()
[[ -n "$TOKEN" ]] && auth=(-H "Authorization: Bearer $TOKEN")

echo "=== Provision LwM2M $IMEI ==="
RESP=$(curl -sf "${auth[@]}" -H "Content-Type: application/json" \
  -X POST "$API/api/v1/iot/devices" \
  -d "{\"name\":\"$NAME\",\"protocol\":\"lwm2m\",\"externalId\":\"$IMEI\"}" 2>/dev/null || true)

if [[ -z "$RESP" ]]; then
  echo "Erreur API — provision manuelle ou token manquant (PLATFORM_API_TOKEN)" >&2
  exit 1
fi

PSK_UPPER=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('provision',{}).get('lwm2m',{}).get('pskKeyHex','').upper())")

OUT="$OUT_DIR/${IMEI}-orange-iot.json"
mkdir -p "$OUT_DIR"

IMEI="$IMEI" NAME="$NAME" HOST="$HOST" PSK_UPPER="$PSK_UPPER" OUT="$OUT" python3 - <<'PY'
import json
import os
from pathlib import Path

imei = os.environ["IMEI"]
name = os.environ["NAME"]
host = os.environ["HOST"]
psk = os.environ["PSK_UPPER"]
out = os.environ["OUT"]

data = {
    "configName": f"Orange IoT Platform - {name}",
    "productReference": "ARF8420A",
    "platform": "Orange IoT Platform",
    "connectivity": {
        "protocols": {"dataTransferProtocol": "LwM2M", "productServerCommunication": "PUSH"},
        "network": {"apn": "nbiot", "connectionPreference": "LTE-Cat-M1 first, NB-IoT next"},
        "lwm2m": {
            "serverUri": f"coaps://{host}:5684",
            "shortServerId": "1",
            "lifetimeSeconds": 1800,
            "pskIdentity": f"urn:imei:{imei}",
            "pskKeyHex": psk,
            "bootstrapServerUri": "",
            "bootstrapPskIdentity": "",
            "bootstrapPskKeyHex": "",
            "uniqueDeviceName": f"urn:imei:{imei}",
            "reliableNotifications": "Activated",
        },
    },
    "application": {
        "sensorsSamplingFrequencySeconds": 60,
        "transmissionFrequencySeconds": 60,
        "dryContactInput1": "Enabled",
    },
    "adeunisAppFieldsFr": {
        "URI du serveur LwM2M": f"coaps://{host}:5684",
        "Identité PSK (serveur LwM2M)": f"urn:imei:{imei}",
        "Clé PSK (serveur LwM2M)": psk,
        "Identifiant court du serveur LwM2M": "1",
        "Lifetime LwM2M": "1800",
        "URI du serveur de bootstrap": "",
        "Nom unique du produit": f"urn:imei:{imei}",
    },
}
Path(out).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
print("Écrit:", out)
print("PSK:", psk)
PY

echo ""
echo "Copiez $OUT sur le téléphone → app Adeunis → Import ou recopiez adeunisAppFieldsFr"
