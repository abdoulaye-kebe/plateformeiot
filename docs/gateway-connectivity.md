# Connectivité gateway ↔ LNS

La plateforme supporte **trois modes** pour relier une gateway physique au ChirpStack LNS.

## Modes supportés

| Mode | Port | Protocole | Cas d'usage |
|------|------|-----------|-------------|
| **Semtech UDP** | 1700 | UDP | Packet Forwarder v2 — universel, gateways cellulaires |
| **Basic Station** | 3001 | TCP/TLS | Gateways récentes (RAK, Semtech) — plus compact |
| **OpenVPN + PKI** | 1194 | UDP | Gateways avec client OpenVPN embarqué, réseau opérateur privé |

## Configuration VM (`.env`)

```bash
LNS_PUBLIC_HOST=52.212.191.28          # IP ou DNS publique de la VM
OPENVPN_PUBLIC_HOST=52.212.191.28      # souvent identique
OPENVPN_ENABLED=true
```

## Semtech UDP (direct)

```
Gateway → <LNS_PUBLIC_HOST>:1700/udp → chirpstack-gateway-bridge
```

Activez les **STATS** toutes les 30 s dans le packet forwarder.

## Basic Station (direct)

```
Gateway → <LNS_PUBLIC_HOST>:3001/tcp → chirpstack-gateway-bridge-basicstation
```

## OpenVPN (tunnel sécurisé)

1. Console → **Gateways** → fiche gateway → **Connectivité LNS**
2. Téléchargez le profil `{gatewayId}.ovpn` (certificat unique PKI)
3. Importez dans le client OpenVPN de la gateway
4. Après montée du tunnel, configurez le forwarder :
   - Semtech : `10.8.0.1:1700`
   - Basic Station : `10.8.0.1:3001`

Architecture :

```
Gateway ──OpenVPN──► openvpn-lns (10.8.0.1) ──► gateway-bridge ──► ChirpStack
```

Services Docker : `vpn-pki` (CA + émission certificats), `openvpn-lns` (serveur + relais LNS).

## API

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/v1/lorawan/connectivity` | Config LNS globale |
| GET | `/api/v1/lorawan/gateways/{id}/connectivity` | Modes + préférence tenant |
| PUT | `/api/v1/lorawan/gateways/{id}/connectivity` | `{ "preferredMode": "openvpn" }` |
| POST | `/api/v1/lorawan/gateways/{id}/vpn/profile` | Télécharger `.ovpn` |
| DELETE | `/api/v1/lorawan/gateways/{id}/vpn/profile` | Révoquer certificat |

## Déploiement

```bash
bash scripts/migrate-all.sh
docker compose build vpn-pki openvpn-lns platform-api console
docker compose up -d vpn-pki openvpn-lns platform-api console
```

Migration SQL : `infra/platform/postgres/019_gateway_connectivity.sql`
