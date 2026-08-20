#!/bin/bash
# Relais LNS démarré quand tun0 est prêt (script-up OpenVPN).
set -uo pipefail

SEMTECH_HOST="${SEMTECH_HOST:-chirpstack-gateway-bridge}"
SEMTECH_PORT="${SEMTECH_PORT:-1700}"
BASICSTATION_HOST="${BASICSTATION_HOST:-chirpstack-gateway-bridge-basicstation}"
BASICSTATION_PORT="${BASICSTATION_PORT:-3001}"
OVPN_GATEWAY_IP="${OVPN_GATEWAY_IP:-10.8.0.1}"

resolve_host() {
  local host="$1"
  local ip=""
  local i
  for i in $(seq 1 30); do
    ip="$(getent hosts "$host" 2>/dev/null | awk '{print $1}' | head -1)"
    if [[ -n "$ip" ]]; then
      echo "$ip"
      return 0
    fi
    sleep 1
  done
  echo "ERROR: impossible de résoudre $host" >&2
  return 1
}

SEMTECH_IP="$(resolve_host "$SEMTECH_HOST")" || exit 1
BASICSTATION_IP="$(resolve_host "$BASICSTATION_HOST")" || exit 1

echo "==> Relais LNS VPN : ${OVPN_GATEWAY_IP}:${SEMTECH_PORT} → ${SEMTECH_IP}:${SEMTECH_PORT}"
echo "==> Relais LNS VPN : ${OVPN_GATEWAY_IP}:${BASICSTATION_PORT} → ${BASICSTATION_IP}:${BASICSTATION_PORT}"

socat "UDP4-LISTEN:${SEMTECH_PORT},bind=${OVPN_GATEWAY_IP},fork,reuseaddr" "UDP4:${SEMTECH_IP}:${SEMTECH_PORT}" &
socat "TCP4-LISTEN:${BASICSTATION_PORT},bind=${OVPN_GATEWAY_IP},fork,reuseaddr" "TCP4:${BASICSTATION_IP}:${BASICSTATION_PORT}" &

exit 0
