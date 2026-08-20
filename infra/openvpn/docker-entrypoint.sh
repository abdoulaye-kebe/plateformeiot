#!/bin/bash
set -euo pipefail

PKI_DIR="${PKI_DIR:-/pki/easy-rsa}"
OVPN_PORT="${OVPN_PORT:-1194}"
OVPN_NET="${OVPN_NET:-10.8.0.0}"
OVPN_MASK="${OVPN_MASK:-255.255.255.0}"
OVPN_GATEWAY_IP="${OVPN_GATEWAY_IP:-10.8.0.1}"
SEMTECH_HOST="${SEMTECH_HOST:-chirpstack-gateway-bridge}"
SEMTECH_PORT="${SEMTECH_PORT:-1700}"
BASICSTATION_HOST="${BASICSTATION_HOST:-chirpstack-gateway-bridge-basicstation}"
BASICSTATION_PORT="${BASICSTATION_PORT:-3001}"

mkdir -p /pki/clients

echo "==> Attente PKI (service vpn-pki)…"
for _ in $(seq 1 90); do
  if [[ -f "$PKI_DIR/pki/ca.crt" ]]; then
    break
  fi
  sleep 1
done
if [[ ! -f "$PKI_DIR/pki/ca.crt" ]]; then
  echo "ERROR: PKI non initialisée — démarrez vpn-pki avant openvpn-lns" >&2
  exit 1
fi

cd "$PKI_DIR"

export OVPN_PORT OVPN_NET OVPN_MASK
envsubst '${OVPN_PORT} ${OVPN_NET} ${OVPN_MASK}' < /etc/openvpn/server.conf.tpl > /etc/openvpn/server.conf

sysctl -w net.ipv4.ip_forward=1 >/dev/null 2>&1 || true

# Relais LNS vers ChirpStack Gateway Bridge (accessible depuis le tunnel VPN)
iptables -t nat -C PREROUTING -i tun0 -p udp --dport "$SEMTECH_PORT" -j DNAT \
  --to-destination "${SEMTECH_HOST}:${SEMTECH_PORT}" 2>/dev/null || \
  iptables -t nat -A PREROUTING -i tun0 -p udp --dport "$SEMTECH_PORT" -j DNAT \
  --to-destination "${SEMTECH_HOST}:${SEMTECH_PORT}"

iptables -t nat -C PREROUTING -i tun0 -p tcp --dport "$BASICSTATION_PORT" -j DNAT \
  --to-destination "${BASICSTATION_HOST}:${BASICSTATION_PORT}" 2>/dev/null || \
  iptables -t nat -A PREROUTING -i tun0 -p tcp --dport "$BASICSTATION_PORT" -j DNAT \
  --to-destination "${BASICSTATION_HOST}:${BASICSTATION_PORT}"

iptables -C FORWARD -i tun0 -j ACCEPT 2>/dev/null || iptables -A FORWARD -i tun0 -j ACCEPT
iptables -C FORWARD -o tun0 -j ACCEPT 2>/dev/null || iptables -A FORWARD -o tun0 -j ACCEPT

echo "==> OpenVPN LNS — tunnel ${OVPN_NET}/24, relais Semtech :${SEMTECH_PORT} + Basic Station :${BASICSTATION_PORT}"
echo "==> Gateways VPN : cible LNS interne ${OVPN_GATEWAY_IP}:${SEMTECH_PORT} (UDP) ou :${BASICSTATION_PORT} (TCP)"

exec openvpn --config /etc/openvpn/server.conf
