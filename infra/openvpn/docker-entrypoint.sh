#!/bin/bash
set -euo pipefail

PKI_DIR="${PKI_DIR:-/pki/easy-rsa}"
OVPN_PORT="${OVPN_PORT:-1194}"
OVPN_NET="${OVPN_NET:-10.8.0.0}"
OVPN_MASK="${OVPN_MASK:-255.255.255.0}"
OVPN_GATEWAY_IP="${OVPN_GATEWAY_IP:-10.8.0.1}"

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

echo "==> OpenVPN LNS — tunnel ${OVPN_NET}/24"
echo "==> Gateways VPN : après connexion, cible LNS ${OVPN_GATEWAY_IP}:1700 (UDP) ou :3001 (TCP)"

exec openvpn --config /etc/openvpn/server.conf
