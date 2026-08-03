#!/usr/bin/env bash
# Vérifie l'état downlink / ACK pour un compteur Shengda sur la VM.
set -euo pipefail

DEV_EUI="${1:-8254812510001415}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Downlink ACK — DevEUI $DEV_EUI ==="
echo ""

echo "1. Commandes Shengda (dernières 5)"
docker compose exec -T platform-postgres psql -U platform -d platform -c "
SELECT command_type, status, payload_hex,
       to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created,
       to_char(sent_at, 'YYYY-MM-DD HH24:MI:SS') AS sent,
       to_char(ack_at, 'YYYY-MM-DD HH24:MI:SS') AS ack,
       detail
FROM shengda_downlink_commands
WHERE dev_eui = lower('$DEV_EUI')
ORDER BY created_at DESC
LIMIT 5;
" 2>/dev/null || echo "(postgres indisponible)"

echo ""
echo "2. Queue ChirpStack (via shengda-water / API interne)"
echo "   Utilisez la console : Devices → $DEV_EUI → Queue downlink"
echo "   Ou : curl -H \"Authorization: Bearer \$TOKEN\" http://localhost:8081/api/v1/lorawan/devices/$DEV_EUI/downlink"

echo ""
echo "3. Logs mqtt-ingestion (événements ack MQTT)"
docker compose logs mqtt-ingestion --tail=30 2>/dev/null | grep -i "ack\|$DEV_EUI" || echo "(aucun ack récent dans les logs)"

echo ""
echo "4. Logs shengda-water (ACK enregistré)"
docker compose logs shengda-water --tail=30 2>/dev/null | grep -i "acknowledg\|$DEV_EUI" || echo "(aucun ACK shengda récent)"

echo ""
echo "Interprétation :"
echo "  - status=sent, queue vide     → downlink transmis, ACK pas encore reçu"
echo "  - status=acknowledged         → device a confirmé (Class A confirmed DL)"
echo "  - queue > 0                   → en attente du prochain uplink device"
