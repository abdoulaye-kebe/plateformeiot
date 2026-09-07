# ADR-002 : Support multiprotocole MQTT et LwM2M (LTE-M)

## Statut

Accepté — Phase multiprotocole v1

## Contexte

Des devices LTE-M utilisent MQTT natif et LwM2M en plus du parc LoRaWAN existant (ChirpStack, ADR-001).

## Décision

- Conserver ChirpStack pour LoRaWAN
- Ajouter `device-connectivity` : broker MQTT dédié (1884) + serveur LwM2M CoAP (5683)
- Registre platform `device_endpoints` + hypertable `telemetry_messages`
- API `/api/v1/iot/*` et console **IoT LTE-M**
- Événements NATS `platform.events.telemetry`

## Conséquences

**Positives :**
- Ingestion unifiée tenant-aware pour capteurs IP/cellulaire
- Provisioning self-service via console

**Limites v1 :**
- LwM2M NoSec UDP (DTLS/PSK en v2)
- Pas de downlink MQTT/LwM2M automatisé en console (topics documentés)
