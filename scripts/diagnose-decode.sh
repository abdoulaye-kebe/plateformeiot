#!/usr/bin/env bash
# Diagnostic déploiement Data Messages décodés — à lancer sur la VM.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/compose.sh
source "$ROOT/scripts/lib/compose.sh"
cd "$ROOT"

echo "=== Diagnostic décodage Data Messages ==="
echo ""
echo "1. Git"
git log -1 --oneline
echo "   Branche: $(git branch --show-current)"
echo ""

echo "2. Fichier console (doit contenir messagePreview / decodeShengdaPayload)"
if grep -q "decodeShengdaPayload" apps/console/src/components/DataMessagesPage.tsx 2>/dev/null; then
  echo "   ✓ DataMessagesPage.tsx — nouveau code présent"
else
  echo "   ✗ DataMessagesPage.tsx — ANCIEN code (git pull requis)"
fi
if grep -q 'hex: "' apps/console/src/components/DataMessagesPage.tsx 2>/dev/null; then
  echo "   ✗ Affichage { hex: ... } encore présent — code obsolète"
else
  echo "   ✓ Pas d'affichage { hex: ... } dans le source"
fi
echo ""

echo "3. Conteneurs"
compose ps console platform-api shengda-water mqtt-ingestion 2>/dev/null || docker compose ps console platform-api shengda-water mqtt-ingestion
echo ""

echo "4. Image console (date de création)"
CID=$(compose ps -q console 2>/dev/null || true)
if [[ -n "$CID" ]]; then
  docker inspect "$CID" --format '   Créé: {{.Created}}  Image: {{.Config.Image}}'
  docker inspect "$CID" --format '   {{range .Config.Env}}{{println .}}{{end}}' | grep NEXT_PUBLIC_BUILD_SHA || echo "   ⚠ NEXT_PUBLIC_BUILD_SHA absent (build sans --build-arg)"
else
  echo "   ✗ Conteneur console introuvable"
fi
echo ""

echo "5. Test shengda-water /decode"
PAYLOAD="JBaVnZDXFAILAAB4qhoAOzMAACMBwg=="
if curl -sf -X POST "http://127.0.0.1:8098/decode" \
  -H "Content-Type: application/json" \
  -d "{\"hex\":\"$PAYLOAD\"}" | head -c 200; then
  echo ""
  echo "   ✓ shengda-water répond"
else
  echo "   ✗ shengda-water inaccessible sur :8098"
fi
echo ""

echo "6. Test platform-api /health"
curl -sf "http://127.0.0.1:8081/health" && echo " ✓ API OK" || echo "   ✗ API inaccessible"
echo ""

echo "7. HTML console — recherche build SHA embarqué"
CONSOLE_PORT="${PUBLIC_HTTP_PORT:-3000}"
HTML=$(curl -sf "http://127.0.0.1:${CONSOLE_PORT}/data/messages" 2>/dev/null | head -c 50000 || true)
if echo "$HTML" | grep -q "build "; then
  echo "$HTML" | grep -o 'build [a-f0-9]\{7,\}' | head -1 | sed 's/^/   ✓ Bandeau trouvé: /'
elif echo "$HTML" | grep -q "decodeShengdaPayload\|307.09 m³"; then
  echo "   ~ Nouveau bundle possible (pas de bandeau visible dans HTML statique)"
else
  echo "   ⚠ Pas de bandeau build dans la page — console probablement ancienne"
  if echo "$HTML" | grep -q 'hex:'; then
    echo "   ✗ Ancien texte « hex: » détecté dans le HTML/JS servi"
  fi
fi
echo ""
echo "=== Si tout est ✓ sauf l'UI → Ctrl+Shift+R ou navigation privée ==="
echo "=== Rebuild console seul ==="
echo "  export NEXT_PUBLIC_BUILD_SHA=\$(git rev-parse --short HEAD)"
echo "  sudo docker compose build --no-cache --build-arg NEXT_PUBLIC_BUILD_SHA=\$NEXT_PUBLIC_BUILD_SHA console"
echo "  sudo docker compose up -d --force-recreate console"
