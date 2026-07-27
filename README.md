# Lorawan Platform

Plateforme IoT LoRaWAN SaaS cloud-native, bâtie **sur ChirpStack v4** avec une couche multi-tenant, analytics et agent IA via **MCP** (Model Context Protocol).

## Architecture Phase 0

```
┌─────────────────────────────────────────────────────────────┐
│  Console Next.js (:3000)                                     │
└───────────────────────────┬─────────────────────────────────┘
                            │ REST
┌───────────────────────────▼─────────────────────────────────┐
│  Platform API Go (:8081) — tenants SaaS, proxy ChirpStack   │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  ChirpStack v4 (:8080) + REST API (:8090) + Gateway Bridge  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Agent IA — MCP Server (:8095) ←→ MCP Client (LLM)          │
│  Tools: devices, gateways, diagnostics, batterie, réseau    │
└─────────────────────────────────────────────────────────────┘
```

## Démarrage rapide

### 1. Prérequis

- Docker & Docker Compose
- Go 1.22+ (dev local)
- Python 3.11+ (agent MCP)
- Node 20+ (console)

### 2. Configuration

```bash
cp .env.example .env
# Éditer CHIRPSTACK_API_TOKEN et CHIRPSTACK_TENANT_ID après le premier lancement
```

### 3. Lancer la stack

```bash
make up
# ou
docker compose up -d
```

| Service | URL |
|---------|-----|
| ChirpStack UI | http://localhost:8080 (admin / admin) |
| ChirpStack REST | http://localhost:8090 |
| Platform API | http://localhost:8081/health |
| Console | http://localhost:3000 |
| Keycloak | http://localhost:8082 |
| MCP Server (SSE) | http://localhost:8095/sse |
| NATS | nats://localhost:4222 |
| Platform Postgres | localhost:5433 |

### 4. Configurer ChirpStack

1. Se connecter à http://localhost:8080
2. Créer un **API key** (Administration → API keys)
3. Copier le **Tenant ID** via `GET /api/tenants?limit=10` ou l'UI
4. Mettre à jour `.env` :

```env
CHIRPSTACK_API_TOKEN=<votre-token>
CHIRPSTACK_TENANT_ID=<uuid-tenant>
```

5. Redémarrer : `docker compose up -d platform-api ai-agent`

## Agent IA (MCP + Ollama CPU)

### Serveur MCP — 19 outils

| Catégorie | Tools |
|-----------|-------|
| **Lecture** | `list_applications`, `list_devices`, `get_device`, `list_gateways`, `get_gateway`, `get_device_events` |
| **Écriture** | `create_gateway`, `update_gateway`, `delete_gateway`, `create_device`, `update_device`, `delete_device` |
| **Métriques** | `get_device_radio_info` (RSSI/SNR/SF), `get_device_link_metrics`, `get_device_metrics`, `get_gateway_metrics` |
| **Diagnostic** | `diagnose_device`, `diagnose_gateway`, `find_low_battery_devices`, `network_overview` |

> `delete_*` exige `confirm=true` pour éviter les suppressions accidentelles.

### LLM local (Ollama — CPU)

```bash
# Prérequis : Ollama installé + modèle
ollama serve
ollama pull mistral:latest   # ou llama3.2:3b (plus léger, ~2 Go)

cd services/ai-agent
python -m venv .venv && source .venv/bin/activate
pip install -e .

export CHIRPSTACK_REST_URL=http://localhost:8090
export CHIRPSTACK_API_TOKEN=<token>
export CHIRPSTACK_TENANT_ID=<tenant-id>
export LLM_PROVIDER=ollama
export LLM_MODEL=mistral:latest
export MCP_SERVER_URL=http://127.0.0.1:8095/sse

# Exemples langage naturel
python -m mcp_client.cli "Donne-moi une vue d'ensemble du réseau"
python -m mcp_client.cli "Liste les applications LoRaWAN"
python -m mcp_client.cli "Crée une gateway aa555a0000000001 nommée Gateway-Test"
python -m mcp_client.cli "Quel est le SNR du device <dev_eui> ?"
python -m mcp_client.cli --list-tools
```

Le client utilise un **mode hybride** pour Ollama (plan JSON + exécution MCP + synthèse), compatible modèles CPU sans tool_calls natifs.

### OpenAI (optionnel)

```bash
export LLM_PROVIDER=openai
export OPENAI_API_KEY=<key>
export LLM_MODEL=gpt-4o-mini
```

### Serveur MCP

```bash
# SSE (Docker / client distant)
MCP_TRANSPORT=sse MCP_PORT=8095 python -m mcp_server.server

# stdio (Cursor)
python -m mcp_server.server
```

## Phase 1 — Ingestion & Rule Engine

### Architecture

```
ChirpStack → MQTT (Mosquitto) → mqtt-ingestion → TimescaleDB
                              ↘ NATS → rule-engine → webhooks / logs
                              ↗
                        platform-api (/analytics, /rules)
```

### Services ajoutés

| Service | Rôle |
|---------|------|
| `mqtt-ingestion` | Écoute `application/+/device/+/event/up`, stocke RSSI/SNR/DR |
| `rule-engine` | Évalue règles IF/THEN sur chaque uplink (NATS) |
| `/analytics` | KPI trafic, radio par device |
| `/rules` | CRUD règles |

### Activer l'ingestion MQTT

```bash
./scripts/setup-mqtt-integration.sh   # guide pas-à-pas
./scripts/migrate-phase1.sh           # si base déjà existante
docker compose up -d mqtt-ingestion rule-engine
```

Dans ChirpStack : **Application → Integrations → MQTT** (topic JSON standard).

### API exemples

```bash
curl http://localhost:8081/api/v1/analytics/overview
curl http://localhost:8081/api/v1/analytics/traffic?hours=24
curl http://localhost:8081/api/v1/rules/

# Créer une règle
curl -X POST http://localhost:8081/api/v1/rules/ -H 'Content-Type: application/json' -d '{
  "name": "SNR faible",
  "condition": {"field":"snr","op":"lt","value":0},
  "actions": [{"type":"log","message":"SNR dégradé"}]
}'
```

Console analytics : http://localhost:3000/analytics

### Intégration Cursor

Ajouter dans la config MCP (voir `services/ai-agent/mcp-config.example.json`) :

```json
{
  "mcpServers": {
    "lorawan-platform": {
      "command": "python",
      "args": ["-m", "mcp_server.server"],
      "cwd": "/chemin/vers/lorawan-platform/services/ai-agent",
      "env": {
        "CHIRPSTACK_REST_URL": "http://localhost:8090",
        "CHIRPSTACK_API_TOKEN": "..."
      }
    }
  }
}
```

## Structure du monorepo

```
lorawan-platform/
├── docker-compose.yml          # ChirpStack + plateforme
├── infra/
│   ├── chirpstack/             # Config officielle ChirpStack Docker
│   └── platform/postgres/      # Schéma SaaS (tenants, events)
├── services/
│   ├── platform-api/           # Go — API SaaS
│   └── ai-agent/               # Python — MCP server + client
├── apps/
│   └── console/                # Next.js dashboard
└── docs/architecture/
```

## Phase 2 — IAM Keycloak + NOC + Billing

### Architecture

```
Console (:3000) ──login──► Keycloak (:8082) realm lorawan
       │
       └── Bearer JWT ──► Platform API (:8081)
                              ├── /api/v1/auth/me
                              ├── /api/v1/noc/alerts
                              └── /api/v1/billing/usage
```

### Services ajoutés

| Service | Rôle |
|---------|------|
| `keycloak` | IAM — realm `lorawan`, rôles platform/tenant/operator/viewer |
| `/noc` | Dashboard NOC style Datadog (widgets, alertes, billing) |
| Auth JWT | Validation JWKS Keycloak, isolation tenant via claim `tenant_id` |

### Comptes démo Keycloak

| User | Password | Rôles |
|------|----------|-------|
| admin | admin | platform-admin, tenant-admin, operator |
| operator | operator | operator |
| viewer | viewer | viewer |

Keycloak admin : http://localhost:8082 (admin / admin)

### Démarrage Phase 2

```bash
docker compose up -d keycloak platform-api console
./scripts/setup-keycloak.sh      # attend le realm
./scripts/migrate-phase2.sh      # si Postgres déjà initialisé sans 003
```

Console : http://localhost:3000/login → redirection `/devices`

### Portail multi-tenant (Phase 2.5)

| Rôle | Pages |
|------|-------|
| `platform-admin` | `/admin/tenants` — créer tenants (+ ChirpStack auto) |
| `tenant-admin`, `operator` | `/devices`, `/gateways`, `/rules` — CRUD |
| `viewer` | Lecture devices, gateways, rules, analytics, NOC |

**Règles & routage** : action `webhook` → envoi HTTP vers plateforme cliente à chaque match.

```bash
# Créer un tenant (admin)
curl -X POST http://localhost:8081/api/v1/tenants -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Client ACME","slug":"acme","plan":"operator","provisionChirpstack":true}'
```

Variables auth (platform-api) :

```env
AUTH_MODE=optional   # optional | required | disabled
KEYCLOAK_ISSUER=http://localhost:8082/realms/lorawan
```

### API exemples (avec token)

```bash
TOKEN=$(curl -s -X POST http://localhost:8082/realms/lorawan/protocol/openid-connect/token \
  -d grant_type=password -d client_id=lorawan-console \
  -d username=operator -d password=operator | jq -r .access_token)

curl -H "Authorization: Bearer $TOKEN" http://localhost:8081/api/v1/auth/me
curl -H "Authorization: Bearer $TOKEN" http://localhost:8081/api/v1/noc/alerts
curl -H "Authorization: Bearer $TOKEN" http://localhost:8081/api/v1/billing/usage
```

## Roadmap

- **Phase 0** ✅ ChirpStack + Platform API + MCP Agent + Console skeleton
- **Phase 1** ✅ Ingestion MQTT → TimescaleDB + Rule Engine + Analytics API
- **Phase 2** ✅ IAM Keycloak, dashboard NOC, billing metering, isolation tenant
- **Phase 2.5** ✅ Provisioning Keycloak/ChirpStack, API keys, suspend/delete tenant, billing history
- **Phase 3** MinIO (archivage payloads), détection anomalies ML, FUOTA multicast, Stripe Checkout, invitations email Keycloak

## Licence

Propriétaire — produit SaaS commercial.
