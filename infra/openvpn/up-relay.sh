#!/bin/bash
# Relais LNS démarré quand tun0 est prêt (script-up OpenVPN).
# Semtech UDP exige un relais stateful : socat casse les PULL_ACK retour.
set -uo pipefail

SEMTECH_HOST="${SEMTECH_HOST:-chirpstack-gateway-bridge}"
SEMTECH_PORT="${SEMTECH_PORT:-1700}"
BASICSTATION_HOST="${BASICSTATION_HOST:-chirpstack-gateway-bridge-basicstation}"
BASICSTATION_PORT="${BASICSTATION_PORT:-3001}"
OVPN_NET="${OVPN_NET:-10.8.0.0/24}"

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
WAN_IF="$(ip route show default 2>/dev/null | awk '{print $5}' | head -1)"
WAN_IF="${WAN_IF:-eth0}"

echo "==> Relais LNS VPN (iptables) : tun0:${SEMTECH_PORT} → ${SEMTECH_IP}:${SEMTECH_PORT}"
echo "==> Relais LNS VPN (iptables) : tun0:${BASICSTATION_PORT} → ${BASICSTATION_IP}:${BASICSTATION_PORT}"
echo "==> Interface sortie Docker : ${WAN_IF}"

sysctl -w net.ipv4.ip_forward=1 >/dev/null 2>&1 || true

add_rule() {
  local table=$1 chain=$2
  shift 2
  if ! iptables -t "$table" -C "$chain" "$@" 2>/dev/null; then
    iptables -t "$table" -A "$chain" "$@"
  fi
}

# DNAT : trafic gateway VPN (dest 10.8.0.1) → ChirpStack Gateway Bridge
add_rule nat PREROUTING -i tun0 -p udp --dport "$SEMTECH_PORT" -j DNAT --to-destination "${SEMTECH_IP}:${SEMTECH_PORT}"
add_rule nat PREROUTING -i tun0 -p tcp --dport "$BASICSTATION_PORT" -j DNAT --to-destination "${BASICSTATION_IP}:${BASICSTATION_PORT}"

# SNAT : réponses du bridge retournent via le tunnel vers 10.8.0.x
add_rule nat POSTROUTING -s "$OVPN_NET" -o "$WAN_IF" -j MASQUERADE

add_rule filter FORWARD -i tun0 -j ACCEPT
add_rule filter FORWARD -o tun0 -m state --state RELATED,ESTABLISHED -j ACCEPT

exit 0
