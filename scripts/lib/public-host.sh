#!/usr/bin/env bash
# Détecte l'IP publique (AWS EC2, puis fallback)
detect_public_host() {
  local ip=""
  # AWS EC2 metadata (IP publique)
  ip="$(curl -sf --max-time 2 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)"
  if [[ -n "$ip" ]]; then
    echo "$ip"
    return 0
  fi
  # Fallback : première IP non loopback (peut être privée)
  hostname -I 2>/dev/null | awk '{print $1}'
}

is_private_ip() {
  local ip="$1"
  [[ "$ip" =~ ^10\. ]] && return 0
  [[ "$ip" =~ ^192\.168\. ]] && return 0
  [[ "$ip" =~ ^172\.(1[6-9]|2[0-9]|3[0-1])\. ]] && return 0
  return 1
}
