# Configurations Adeunis → Orange IoT Platform

Fichiers de référence pour l'app **IoT Configurator NB-IoT / LTE-M** (Adeunis).

## Important

L'app Adeunis importe surtout des JSON **exportés depuis un capteur déjà configuré** (même référence + même firmware).  
Les fichiers ci-dessous sont des **presets de référence** : toutes les valeurs à saisir, clé PSK en **MAJUSCULES**.

Si l'import direct échoue → **Mes configurations** → **Ajouter une nouvelle configuration** → recopier les champs du fichier JSON.

## Fichiers par device

| Fichier | IMEI | PSK (hex MAJUSCULES) |
|---------|------|----------------------|
| `351034922982719-orange-iot.json` | 351034922982719 | Voir fichier / console IoT LTE-M → Connexion |
| `351034922988013-orange-iot.json` | 351034922988013 | `81AD2D4D8EA8ED97A6C7820E195C79F6` |

## Import dans l'app

1. Copier le fichier `.json` sur le téléphone (Mail, Files, AirDrop…)
2. Ouvrir l'app → onglet **Capteur** → lire le capteur en NFC
3. **Options** (⋮) → **Importer** / **Import** → choisir le fichier  
   **OU** onglet **Mes configurations** → **Ajouter** → importer si proposé
4. **Appliquer les modifications** → NFC

## Générer un nouveau preset depuis la plateforme

```bash
export PLATFORM_API_TOKEN=<jwt>
bash scripts/generate-adeunis-config.sh 351034922988013 "Mon capteur"
```

## Serveur

- LwM2M : `coaps://52.212.191.28:5684`
- Bootstrap : **vide**
- Identité PSK : `urn:imei:<IMEI>` (accepté par la plateforme)
