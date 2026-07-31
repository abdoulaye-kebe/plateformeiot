# Application métier Shengda — télérelevé eau & contrôle vanne

Application LoRaWAN pour compteurs d'eau **Shengda** (protocole Application Layer V1.6).

## Fonctionnalités

- **Décodage uplink** automatique (format TV, index eau, batterie, mot d'état vanne, alarmes)
- **Persistance** des compteurs et historique de relevés (TimescaleDB)
- **Commandes downlink** vanne : ouvrir, fermer, débourrer, télérelevé forcé
- **API REST** consommée par la console (`/api/v1/shengda/*` via platform-api)
- **Worker NATS** abonné à `platform.events.uplink`

## Protocole

| Action | Port | Payload hex | Base64 |
|--------|------|-------------|--------|
| Ouvrir vanne | 2 | `261F0045` | `Jh8ARQ==` |
| Fermer vanne | 2 | `261F0146` | `Jh8BRg==` |
| Débourrer | 2 | `261F0247` | — |

Le device doit être **connecté** au réseau pour recevoir le downlink.

## Structure

```
apps/shengda-water/
  shengda_water/
    protocol/     # decoder.py, encoder.py (V1.6)
    store.py      # Postgres métier
    worker.py     # NATS + FastAPI (:8098)
  tests/
  Dockerfile
```

## Démarrage

```bash
# Migration
./scripts/migrate-all.sh

# Stack complète
docker compose up -d shengda-water platform-api console
```

## Codec JavaScript ChirpStack

Fichier : `chirpstack/shengda-v1.6.codec.js`

- `decodeUplink` — index m³, vanne, batterie, alarmes
- `encodeDownlink` — `{ action: "open"|"close"|"dredge"|"read" }` sur port 2

**Console** : Eau / Vannes → section « Décodeur device JavaScript »

- Tester un payload hex
- Appliquer au device profile ChirpStack
- Créer un profile « Shengda Water Meter V1.6 »

**API** :
- `GET /api/v1/shengda/codec`
- `POST /api/v1/shengda/codec/apply` — `{ "deviceProfileId": "...", "create": false }` ou `{ "create": true }`


| Service | Port | Rôle |
|---------|------|------|
| **shengda-water** | **8098** | API REST + interface web autonome |
| console LoRaWAN | 3000 | Console plateforme (option `/water-meters`) |
| platform-api | 8081 | Proxy authentifié `/api/v1/shengda/*` |

L'application métier **n'utilise pas le port 3000**. Accès direct :

- Interface : http://localhost:**8098**/
- API : http://localhost:**8098**/meters?tenantId=...

Via la console existante (même port 3000 qu'avant) : `/water-meters`

## API (via platform-api)

- `GET /api/v1/shengda/meters`
- `GET /api/v1/shengda/meters/{devEui}`
- `GET /api/v1/shengda/meters/{devEui}/readings`
- `POST /api/v1/shengda/meters/{devEui}/commands` — body `{ "action": "open" | "close" | "dredge" | "read" }`
- `POST /api/v1/lorawan/devices/{devEui}/downlink` — downlink générique ChirpStack

## Tests

```bash
cd apps/shengda-water
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
pip install pytest
pytest tests/
```
