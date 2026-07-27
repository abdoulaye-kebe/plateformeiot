#!/usr/bin/env bash
# Guide : activer l'intégration MQTT ChirpStack pour alimenter mqtt-ingestion
set -euo pipefail

echo "=== Configuration MQTT ChirpStack (Phase 1) ==="
echo ""
echo "1. Ouvrir http://localhost:8080"
echo "2. Créer une Application (ex: sensors)"
echo "3. Application → Integrations → Add → MQTT"
echo "4. Paramètres :"
echo "   - Event endpoint topic : application/{{application_id}}/device/{{dev_eui}}/event/{{event}}"
echo "   - Server : mosquitto (ou localhost:1884 depuis l'hôte)"
echo "   - Port : 1883 (interne Docker) / 1884 (hôte)"
echo "   - JSON marshaler"
echo ""
echo "5. Les uplinks seront ingérés par mqtt-ingestion → TimescaleDB → rule-engine"
echo ""
echo "Vérifier l'ingestion :"
echo "  curl http://localhost:8081/api/v1/analytics/overview"
echo "  docker compose logs -f mqtt-ingestion"
