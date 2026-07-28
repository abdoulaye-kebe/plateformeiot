#!/usr/bin/env bash
# Agent edge : exécute util_spectral_scan sur les gateways Corecell compatibles
# et remonte les résultats à la plateforme.
set -euo pipefail

GATEWAY_ID="${GATEWAY_ID:-}"
API_URL="${PLATFORM_API_URL:-http://localhost:8081}"
API_KEY="${PLATFORM_API_KEY:-}"
SCAN_BIN="${SPECTRAL_SCAN_BIN:-util_spectral_scan}"
POLL_INTERVAL="${POLL_INTERVAL:-30}"
FREQ_START="${FREQ_START:-863100000}"
FREQ_STOP="${FREQ_STOP:-869900000}"
CHANNEL_STEP="${CHANNEL_STEP:-200000}"

if [[ -z "$GATEWAY_ID" || -z "$API_KEY" ]]; then
  echo "Usage: GATEWAY_ID=... PLATFORM_API_KEY=... $0" >&2
  exit 1
fi

auth_header=(-H "Authorization: Bearer ${API_KEY}")
if [[ "$API_KEY" == pk_* ]]; then
  auth_header=(-H "X-API-Key: ${API_KEY}")
fi

poll_pending() {
  curl -sf "${auth_header[@]}" \
    "${API_URL}/api/v1/lorawan/gateways/${GATEWAY_ID}/rf-scan/pending"
}

upload_results() {
  local payload="$1"
  curl -sf "${auth_header[@]}" -H "Content-Type: application/json" \
    -X POST "${API_URL}/api/v1/lorawan/gateways/${GATEWAY_ID}/rf-scan/results" \
    -d "$payload"
}

parse_csv_to_bins() {
  local csv_file="$1"
  python3 - "$csv_file" "$FREQ_START" "$CHANNEL_STEP" <<'PY'
import csv, json, sys
csv_file, freq_start, step = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
bins = []
with open(csv_file) as f:
    reader = csv.reader(f)
    for i, row in enumerate(reader):
        if not row:
            continue
        try:
            rssi = float(row[-1])
        except ValueError:
            continue
        bins.append({"freqHz": freq_start + i * step, "rssiDbm": rssi})
print(json.dumps(bins))
PY
}

run_scan() {
  local request_id="$1"
  local tmp
  tmp="$(mktemp /tmp/rf-scan-XXXXXX.csv)"

  if ! command -v "$SCAN_BIN" >/dev/null 2>&1; then
    echo "→ $SCAN_BIN introuvable, simulation de bins pour dev"
    python3 - <<PY
import json, random
bins = []
for i, f in enumerate(range($FREQ_START, $FREQ_STOP, $CHANNEL_STEP)):
    rssi = -105 + random.uniform(-3, 3)
    if f == 868000000:
        rssi = -72 + random.uniform(-2, 2)
    bins.append({"freqHz": f, "rssiDbm": round(rssi, 1)})
print(json.dumps({
  "requestId": "$request_id",
  "freqStartHz": $FREQ_START,
  "channelStepHz": $CHANNEL_STEP,
  "region": "EU868",
  "bins": bins
}))
PY
    return
  fi

  "$SCAN_BIN" -f "$FREQ_START" -u "$FREQ_STOP" -o "$tmp"
  bins="$(parse_csv_to_bins "$tmp")"
  rm -f "$tmp"
  python3 - <<PY
import json
print(json.dumps({
  "requestId": "$request_id",
  "freqStartHz": $FREQ_START,
  "channelStepHz": $CHANNEL_STEP,
  "region": "EU868",
  "bins": json.loads('''$bins''')
}))
PY
}

echo "Agent RF scan — gateway ${GATEWAY_ID} — poll ${POLL_INTERVAL}s"
while true; do
  resp="$(poll_pending || echo '{"pending":false}')"
  pending="$(echo "$resp" | python3 -c "import json,sys; d=json.load(sys.stdin); print('true' if d.get('pending') else 'false')")"
  if [[ "$pending" == "true" ]]; then
    request_id="$(echo "$resp" | python3 -c "import json,sys; print(json.load(sys.stdin)['request']['id'])")"
    echo "→ Scan demandé ($request_id)"
    payload="$(run_scan "$request_id")"
    upload_results "$payload"
    echo "✓ Résultats envoyés"
  fi
  sleep "$POLL_INTERVAL"
done
