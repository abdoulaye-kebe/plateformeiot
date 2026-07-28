#!/usr/bin/env bash
# Installe Docker Engine + Compose plugin sur Ubuntu 22.04 (jammy)
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Exécutez en root : sudo bash $0"
  exit 1
fi

. /etc/os-release
if [[ "${VERSION_ID}" != "22.04" ]]; then
  echo "⚠ Script prévu pour Ubuntu 22.04 — détecté : ${PRETTY_NAME:-unknown}"
fi

apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release

install -m 0755 -d /etc/apt/keyrings
if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
fi

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable docker
systemctl start docker

echo "✓ Docker $(docker --version)"
echo "✓ Compose $(docker compose version)"
