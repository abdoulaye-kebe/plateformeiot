#!/usr/bin/env bash
# Redéploie console + API + ingestion pour Data Messages décodés (Shengda / ChirpStack object).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/compose.sh
source "$ROOT/scripts/lib/compose.sh"
cd "$ROOT"

echo "=== Redéploiement décodage Data Messages ==="
git pull origin main
SHA="$(git rev-parse --short HEAD)"
echo "→ Commit : $(git log -1 --oneline)"

export NEXT_PUBLIC_BUILD_SHA="$SHA"

bash "$ROOT/scripts/migrate-all.sh" || true

build_one() {
  local svc="$1"
  echo ""
  echo "→ Build $svc (sans cache)..."
  if compose build --no-cache --build-arg "NEXT_PUBLIC_BUILD_SHA=${NEXT_PUBLIC_BUILD_SHA}" "$svc"; then
    echo "✓ $svc OK"
    return 0
  fi
  echo "✗ $svc ÉCHEC"
  return 1
}

FAILED=0
for svc in shengda-water platform-api mqtt-ingestion console; do
  build_one "$svc" || FAILED=$((FAILED + 1))
done

if [[ "$FAILED" -gt 0 ]]; then
  echo ""
  echo "⚠ $FAILED service(s) en échec — vérifiez les logs ci-dessus."
  echo "  Commit requis pour platform-api : fbb9ab3 (fix conflit decodeShengdaPayload)"
fi

compose up -d --force-recreate shengda-water platform-api mqtt-ingestion console 2>/dev/null || \
  compose up -d shengda-water platform-api mqtt-ingestion console

echo ""
echo "=== État des conteneurs ==="
compose ps shengda-water platform-api mqtt-ingestion console

echo ""
echo "✓ Redéploiement terminé (build ${NEXT_PUBLIC_BUILD_SHA})"
echo "  1. Data Messages doit afficher le bandeau « build ${NEXT_PUBLIC_BUILD_SHA} »"
echo "  2. Hard refresh : Ctrl+Shift+R"
echo "  3. Attendu : « 307.09 m³ · vanne ouverte · 3.6 V »"
echo ""
echo "Si pas de bandeau build → la console n'a pas été reconstruite :"
echo "  sudo docker compose build --no-cache --build-arg NEXT_PUBLIC_BUILD_SHA=${SHA} console"
echo "  sudo docker compose up -d --force-recreate console"
