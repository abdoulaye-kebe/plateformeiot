#!/usr/bin/env bash
# Redéploie console + API + ingestion pour Data Messages décodés (Shengda / ChirpStack object).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/compose.sh
source "$ROOT/scripts/lib/compose.sh"
cd "$ROOT"

echo "=== Redéploiement décodage Data Messages ==="
git pull origin main
echo "→ Commit : $(git log -1 --oneline)"

export NEXT_PUBLIC_BUILD_SHA="$(git rev-parse --short HEAD)"

bash "$ROOT/scripts/migrate-all.sh"

echo "→ Build (sans cache) : console platform-api mqtt-ingestion shengda-water"
compose build --no-cache \
  --build-arg "NEXT_PUBLIC_BUILD_SHA=${NEXT_PUBLIC_BUILD_SHA}" \
  console platform-api mqtt-ingestion shengda-water

compose up -d --force-recreate console platform-api mqtt-ingestion shengda-water

echo ""
echo "✓ Redéploiement terminé (build ${NEXT_PUBLIC_BUILD_SHA})"
echo "  1. Ouvrez Data Messages et vérifiez le bandeau « build ${NEXT_PUBLIC_BUILD_SHA} »"
echo "  2. Hard refresh : Ctrl+Shift+R"
echo "  3. Attendu dans la colonne Data : « 307.09 m³ · vanne ouverte · 3.6 V »"
