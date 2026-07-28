# Déploiement sur VM Ubuntu 22.04

Guide pour installer la plateforme LoRaWAN SaaS sur une machine **Ubuntu 22.04 LTS** (jammy).

## Prérequis VM

| Ressource | Minimum recommandé |
|-----------|-------------------|
| CPU | 4 vCPU |
| RAM | 8 Go (16 Go si Ollama local) |
| Disque | 40 Go SSD |
| OS | Ubuntu 22.04 LTS |

Ports à ouvrir (pare-feu / security group) :

| Port | Protocole | Service |
|------|-----------|---------|
| 3000 | TCP | Console web |
| 8081 | TCP | Platform API |
| 8082 | TCP | Keycloak (auth) |
| 8080 | TCP | ChirpStack UI (admin) |
| 1700 | UDP | Gateway LoRaWAN (Packet Forwarder) |
| 1884 | TCP | MQTT (optionnel, interne) |

## Installation rapide (automatisée)

```bash
# Sur la VM Ubuntu 22.04
sudo apt-get update && sudo apt-get install -y git

git clone https://github.com/abdoulaye-kebe/plateformeiot.git lorawan-platform
cd lorawan-platform

# Remplacez par l'IP publique ou le domaine de la VM
export PUBLIC_HOST=203.0.113.10

sudo -E bash scripts/deploy-ubuntu-22.04.sh
```

Le script :

1. Installe **Docker Engine + Compose** (si absent)
2. Clone la config **ChirpStack**
3. Génère `.env` avec les URLs publiques de la VM
4. Build et démarre toute la stack
5. Applique les migrations SQL

## Installation manuelle (étape par étape)

### 1. Docker

```bash
sudo bash scripts/install-docker-ubuntu-22.04.sh
sudo usermod -aG docker $USER
# Reconnectez-vous pour utiliser docker sans sudo
```

### 2. Configuration

```bash
cp .env.example .env
nano .env
```

Variables importantes pour la VM :

```env
PUBLIC_HOST=203.0.113.10
CONSOLE_PUBLIC_URL=http://203.0.113.10:3000
KEYCLOAK_ISSUER=http://203.0.113.10:8082/realms/lorawan
KEYCLOAK_PUBLIC_HOST=203.0.113.10
KEYCLOAK_PUBLIC_PORT=8082
NEXT_PUBLIC_PLATFORM_API_URL=http://203.0.113.10:8081
NEXT_PUBLIC_KEYCLOAK_URL=http://203.0.113.10:8082
NEXT_PUBLIC_CHIRPSTACK_URL=http://203.0.113.10:8080
CHIRPSTACK_API_TOKEN=
CHIRPSTACK_TENANT_ID=
AUTH_MODE=required
```

### 3. Lancer la stack

```bash
make setup-chirpstack   # une seule fois
docker compose build
docker compose up -d
bash scripts/bootstrap.sh
```

### 4. Configurer ChirpStack

1. Ouvrir `http://<VM>:8080` — login `admin` / `admin`
2. **Administration → API keys** → créer une clé
3. Copier le **Tenant ID** (Administration → Tenants)
4. Mettre à jour `.env` :

```bash
nano .env   # CHIRPSTACK_API_TOKEN et CHIRPSTACK_TENANT_ID
docker compose up -d platform-api ai-agent
```

### 5. Pare-feu UFW

```bash
sudo ufw allow OpenSSH
sudo ufw allow 3000/tcp
sudo ufw allow 8081/tcp
sudo ufw allow 8082/tcp
sudo ufw allow 8080/tcp
sudo ufw allow 1700/udp
sudo ufw enable
```

## Mise à jour

```bash
cd lorawan-platform
git pull
docker compose build
docker compose up -d
bash scripts/migrate-all.sh
```

## Agent IA sur la VM

Par défaut l'agent utilise **Ollama** (CPU). Sur la VM :

```bash
# Installer Ollama (Ubuntu 22.04)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull mistral:latest

# L'agent Docker accède à Ollama via host.docker.internal
# Vérifiez OLLAMA_BASE_URL dans .env
docker compose up -d ai-agent
```

Alternative : `LLM_PROVIDER=openai` + `OPENAI_API_KEY` dans `.env`.

## HTTPS (production)

Pour un domaine public avec TLS, placez **Nginx** ou **Caddy** devant la console :

```nginx
# Exemple Nginx — /etc/nginx/sites-available/lorawan
server {
    listen 443 ssl;
    server_name iot.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
    }
}
```

Mettez à jour `.env` avec `https://iot.example.com` et rebuild la console :

```bash
export PUBLIC_HOST=iot.example.com
export NEXT_PUBLIC_PLATFORM_API_URL=https://iot.example.com/api
# … puis docker compose build console && docker compose up -d
```

## Dépannage

```bash
docker compose ps
docker compose logs -f platform-api
curl http://localhost:8081/health
curl http://localhost:3000/login
```

| Problème | Solution |
|----------|----------|
| Console ne se connecte pas | Vérifier `KEYCLOAK_ISSUER` et rebuild console |
| API 401 | Token Keycloak expiré — reconnectez-vous |
| ChirpStack vide | Configurer `CHIRPSTACK_API_TOKEN` dans `.env` |
| Gateway ne remonte pas | Port UDP 1700 ouvert + Gateway ID correct |

## Support

Repository : https://github.com/abdoulaye-kebe/plateformeiot
