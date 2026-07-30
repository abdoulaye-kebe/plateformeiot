#!/usr/bin/env bash
# Détecte l'IP publique (AWS EC2 IMDSv2/v1, puis fallback)
detect_public_host() {
  local ip="" token=""
  # AWS EC2 IMDSv2
  token="$(curl -sf --max-time 2 -X PUT "http://169.254.169.254/latest/api/token" \
    -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" 2>/dev/null || true)"
  if [[ -n "$token" ]]; then
    ip="$(curl -sf --max-time 2 -H "X-aws-ec2-metadata-token: $token" \
      http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)"
  fi
  # AWS EC2 IMDSv1
  if [[ -z "$ip" ]]; then
    ip="$(curl -sf --max-time 2 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)"
  fi
  if [[ -n "$ip" ]]; then
    echo "$ip"
    return 0
  fi
  hostname -I 2>/dev/null | awk '{print $1}'
}

is_private_ip() {
  local ip="$1"
  [[ "$ip" =~ ^10\. ]] && return 0
  [[ "$ip" =~ ^192\.168\. ]] && return 0
  [[ "$ip" =~ ^172\.(1[6-9]|2[0-9]|3[0-1])\. ]] && return 0
  return 1
}
