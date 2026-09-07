# Multi-protocole MQTT / LwM2M (LTE-M)

## Services

| Service | Port | Rôle |
|---------|------|------|
| `device-connectivity` | **1884/TCP** | Broker MQTT devices IP/cellulaire |
| `device-connectivity` | **5683/UDP** | Serveur LwM2M (CoAP) |

## Console

Menu **IoT LTE-M** → provisionner un device → copier les paramètres de connexion.

## MQTT (LTE-M)

- **Broker** : `mqtt://<CELLULAR_PUBLIC_HOST>:1884`
- **Username** : `externalId` du device
- **Password** : généré à la création
- **Topic uplink** : `devices/{externalId}/telemetry`
- **Topic commande** : `devices/{externalId}/command`

Exemple payload JSON :

```json
{"temperature": 22.5, "battery": 87, "humidity": 65}
```

## LwM2M (LTE-M)

- **Serveur** : `coap://<CELLULAR_PUBLIC_HOST>:5683`
- **Endpoint** : `externalId` provisionné
- **Registration** : `POST /rd?ep={externalId}&lt=300&lwm2m=1.0`
- **Mode sécurité MVP** : NoSec UDP (DTLS/PSK en phase suivante)

Les mises à jour ressource (POST/PUT) sont ingérées comme télémétrie.

## Déploiement VM

```bash
git pull
bash scripts/migrate-all.sh
sudo docker compose build device-connectivity platform-api console
sudo docker compose up -d device-connectivity platform-api console
```

Ouvrir le pare-feu :

```bash
sudo ufw allow 1884/tcp
sudo ufw allow 5683/udp
```

Variables `.env` :

```env
CELLULAR_PUBLIC_HOST=52.212.191.28
LNS_PUBLIC_HOST=52.212.191.28
```

## Test automatique

```bash
export PLATFORM_API_TOKEN=<jwt ou api key>
bash scripts/test-iot-provision.sh
```

## API

- `GET /api/v1/iot/connectivity`
- `GET/POST /api/v1/iot/devices`
- `GET /api/v1/iot/devices/{id}/provision`
- `GET /api/v1/iot/devices/{id}/telemetry`
