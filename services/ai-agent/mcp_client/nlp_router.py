"""Routage langage naturel → appels MCP directs (sans LLM)."""

from __future__ import annotations

import re
from typing import Any

GATEWAY_WORDS = ("gateway", "gateways", "passerelle", "passerelles")
DEVICE_WORDS = ("device", "devices", "appareil", "appareils", "capteur", "capteurs", "collier", "colliers")
METER_WORDS = ("compteur", "compteurs", "meter", "meters", "eau", "shengda")
METER_TELEMETRY_WORDS = (
    "m3",
    "m³",
    "remont",
    "relev",
    "index",
    "consommation",
    "vanne",
    "batterie",
    "mesure",
    "mesures",
    "télémétrie",
    "telemetrie",
    "dernière",
    "derniere",
    "valeur",
    "litre",
    "litres",
)
CREATE_WORDS = ("cré", "cre", "create", "ajout", "ajoute", "ajouter", "nouveau", "new", "add ")
COUNT_WORDS = ("combien", "nombre", "how many", "count", "total", "nb ")

DEVICE_CREATE_PROMPT = (
    "Très bien ! Pour ajouter un device LoRaWAN OTAA (Class A), j'ai besoin des informations suivantes :\n\n"
    "• DevEUI — 16 caractères hex (identifiant unique du capteur)\n"
    "• JoinEUI — 16 caractères hex (identifiant réseau)\n"
    "• AppKey — 32 caractères hex (clé OTAA)\n"
    "• Nom — optionnel (ex: capteur-bureau)\n\n"
    "Renseignez le formulaire ci-dessous ou envoyez un message complet."
)

GATEWAY_CREATE_PROMPT = (
    "Pour ajouter une gateway LoRaWAN, j'ai besoin de :\n\n"
    "• Gateway ID — 16 caractères hex (EUI64)\n"
    "• Nom — ex: GW-Lyon\n\n"
    "Renseignez le formulaire ci-dessous."
)


def _wants_create(lower: str) -> bool:
    return any(w in lower for w in CREATE_WORDS)


def _has_eui64(q: str) -> bool:
    return bool(re.search(r"[0-9a-fA-F]{16}", q))


def _normalize_question(q: str) -> str:
    q = q.strip()
    q = re.sub(r"^(?:bonjour|salut|hello|hi|hey|coucou|bjr)[,!.\s]+", "", q, flags=re.I).strip()
    q = re.sub(r"^(?:on a|est-ce qu['']on a|il y a|y a-t-il|ya-t-il|ya)\s+", "", q, flags=re.I).strip()
    return q


def _mentions(lower: str, words: tuple[str, ...]) -> bool:
    return any(w in lower for w in words)


def _asks_count(lower: str) -> bool:
    return any(w in lower for w in COUNT_WORDS)


def _hex_field(q: str, *patterns: str) -> str | None:
    for pat in patterns:
        m = re.search(pat, q, re.I)
        if m:
            return m.group(1).lower()
    return None


def _labeled_value(q: str, label_pattern: str) -> str | None:
    m = re.search(rf"(?:{label_pattern})\s*:?\s*([^\s,;\n]+)", q, re.I | re.MULTILINE)
    if not m:
        return None
    return re.sub(r"\s+", "", m.group(1).strip())


_HEX16 = re.compile(r"^[0-9a-fA-F]{16}$")
_HEX32 = re.compile(r"^[0-9a-fA-F]{32}$")


def _validate_hex_field(label: str, raw: str | None, length: int) -> tuple[str | None, str | None]:
    if not raw:
        return None, f"{label} manquant."
    value = raw.lower()
    pattern = _HEX16 if length == 16 else _HEX32
    if pattern.match(value):
        return value, None
    if not re.fullmatch(r"[0-9a-fA-F]+", value, re.I):
        return None, f"{label} invalide « {raw} » — uniquement des caractères hex (0-9, a-f)."
    return None, f"{label} invalide « {raw} » — {length} caractères hex requis (actuellement {len(value)})."


def _parse_device_labeled_form(q: str) -> tuple[str, dict[str, Any]] | None:
    """Formulaire multi-lignes : DevEUI / JoinEUI / AppKey (sans mot-clé « créer »)."""
    lower = q.lower()
    has_deveui = bool(re.search(r"dev[\s_-]?eui", lower))
    has_join = bool(re.search(r"join[\s_-]?eui", lower))
    has_appkey = bool(re.search(r"app[\s_-]?key", lower))

    if not has_deveui:
        return None
    if not (has_join or has_appkey or _wants_create(lower)):
        return None

    raw_dev = _labeled_value(q, r"dev[\s_-]?eui")
    raw_join = _labeled_value(q, r"join[\s_-]?eui")
    raw_app = _labeled_value(q, r"app[\s_-]?key")
    raw_name = _labeled_value(q, r"nom(?:m[ée])?")

    dev_eui, err_dev = _validate_hex_field("DevEUI", raw_dev, 16)
    join_eui, err_join = _validate_hex_field("JoinEUI", raw_join, 16)
    app_key, err_app = _validate_hex_field("AppKey", raw_app, 32)

    errors = [e for e in (err_dev, err_join, err_app) if e]
    if errors:
        msg = "Je n'ai pas pu créer le device :\n\n" + "\n".join(f"• {e}" for e in errors)
        msg += (
            "\n\nFormat attendu (hex uniquement) :\n"
            "DevEUI: 0102030405060708\n"
            "JoinEUI: 70B3D57ED0000000\n"
            "AppKey: 00112233445566778899AABBCCDDEEFF"
        )
        return "__hint__", {"message": msg, "_form": "device"}

    if dev_eui and join_eui and app_key:
        name = raw_name if raw_name else f"device-{dev_eui[-6:]}"
        return "create_device", {
            "dev_eui": dev_eui,
            "join_eui": join_eui,
            "app_key": app_key,
            "name": name,
        }

    missing = [label for label, val in (("DevEUI", dev_eui), ("JoinEUI", join_eui), ("AppKey", app_key)) if not val]
    return "__hint__", {
        "message": f"Il manque : {', '.join(missing)}.\n\n{DEVICE_CREATE_PROMPT}",
        "_form": "device",
    }


def _parse_device_provision(q: str) -> dict[str, Any] | None:
    lower = q.lower()
    if not any(w in lower for w in ("device", "appareil", "capteur", "deveui", "dev_eui", "join_eui", "joineui", "app_key", "appkey")):
        return None
    if not any(w in lower for w in ("cré", "cre", "create", "ajout", "ajoute", "provision", "veux", "voudrais")):
        return None

    raw_dev = _labeled_value(q, r"dev[\s_-]?eui") or _hex_field(
        q,
        r"dev[\s_-]?eui\s*:?\s*([0-9a-fA-F]{16})",
        r"\bdeveui\s*:?\s*([0-9a-fA-F]{16})",
    )
    if not raw_dev:
        return None

    dev_eui, err = _validate_hex_field("DevEUI", raw_dev, 16)
    if err or not dev_eui:
        return None

    raw_join = _labeled_value(q, r"join[\s_-]?eui")
    raw_app = _labeled_value(q, r"app[\s_-]?key")
    join_eui, _ = _validate_hex_field("JoinEUI", raw_join, 16) if raw_join else (None, None)
    app_key, _ = _validate_hex_field("AppKey", raw_app, 32) if raw_app else (None, None)

    name = f"device-{dev_eui[-6:]}"
    m = re.search(r"nom(?:m[ée])?\s*:?\s*([^,\n]+?)(?:\s*,|\s+join|\s+app|\s*$)", q, re.I)
    if m:
        name = m.group(1).strip().rstrip(".")

    args: dict[str, Any] = {"dev_eui": dev_eui, "name": name}
    if join_eui:
        args["join_eui"] = join_eui
    if app_key:
        args["app_key"] = app_key
    return args


def _extract_dev_eui(q: str) -> str | None:
    m = re.search(r"[0-9a-fA-F]{16}", q)
    return m.group(0).lower() if m else None


def _asks_meter_telemetry(lower: str) -> bool:
    """Télémétrie compteur d'eau — pas les uplinks réseau (« remonté depuis 24 h »)."""
    if _asks_stale_devices(lower):
        return False
    if _mentions(lower, METER_WORDS):
        return any(w in lower for w in METER_TELEMETRY_WORDS)
    water_specific = ("m3", "m³", "index", "vanne", "consommation", "télémétrie", "telemetrie", "litre", "litres")
    return any(w in lower for w in water_specific)


def _parse_stale_hours(lower: str) -> int:
    m = re.search(r"depuis\s+(\d+)\s*h", lower)
    if m:
        return max(1, int(m.group(1)))
    m = re.search(r"(\d+)\s*h(?:eure|ours|our)?\b", lower)
    if m and any(w in lower for w in ("depuis", "sans", "pas", "remont", "uplink")):
        return max(1, int(m.group(1)))
    return 24


def _asks_stale_devices(lower: str) -> bool:
    if not (_mentions(lower, DEVICE_WORDS) or "collier" in lower):
        return False
    stale_markers = (
        "pas remont",
        "n'ont pas remont",
        "sans remont",
        "sans uplink",
        "pas d'uplink",
        "no uplink",
        "inactif",
        "silencieux",
        "offline",
        "hors ligne",
        "dernière activité",
        "derniere activite",
        "last seen",
    )
    if any(m in lower for m in stale_markers):
        return True
    return bool(re.search(r"depuis\s+\d+\s*h", lower) and any(w in lower for w in ("remont", "uplink", "activ")))


def _parse_interval_seconds(lower: str) -> int | None:
    m = re.search(r"(\d+)\s*h(?:eure|ours|our)?\b", lower)
    if m:
        return int(m.group(1)) * 3600
    m = re.search(r"(\d+)\s*min(?:ute)?s?\b", lower)
    if m:
        return int(m.group(1)) * 60
    m = re.search(r"(\d+)\s*(?:s|sec|secondes?)\b", lower)
    if m:
        return int(m.group(1))
    m = re.search(r"(?:toutes?\s+les?\s+|intervalle\s+|fr[ée]quence\s+)(\d+)", lower)
    if m:
        val = int(m.group(1))
        if "min" in lower:
            return val * 60
        if re.search(r"\d+\s*h", lower):
            return val * 3600
        if val >= 600:
            return val
        return val * 3600 if "h" in lower else val * 60 if "min" in lower else val
    m = re.search(r"\b(\d{3,5})\b", lower)
    if m and any(w in lower for w in ("intervalle", "fréquence", "frequence", "relev", "rapport", "périod", "period")):
        return int(m.group(1))
    return None


def _route_meter_downlink(q: str, lower: str) -> tuple[str, dict[str, Any]] | None:
    dev_eui = _extract_dev_eui(q)

    if ("vanne" in lower or "valve" in lower) and any(
        w in lower for w in ("ferme", "fermer", "close", "coupe", "coupé", "couper")
    ):
        if dev_eui:
            return "send_water_meter_command", {"dev_eui": dev_eui, "action": "close"}
        return "__hint__", {"message": "Pour fermer la vanne, précisez le DevEUI du compteur (16 caractères hex)."}

    if ("vanne" in lower or "valve" in lower) and any(w in lower for w in ("ouvre", "ouvrir", "open")):
        if dev_eui:
            return "send_water_meter_command", {"dev_eui": dev_eui, "action": "open"}
        return "__hint__", {"message": "Pour ouvrir la vanne, précisez le DevEUI du compteur (16 caractères hex)."}

    if ("vanne" in lower or "valve" in lower) and any(w in lower for w in ("débour", "debour", "dredge")):
        if dev_eui:
            return "send_water_meter_command", {"dev_eui": dev_eui, "action": "dredge"}
        return "__hint__", {"message": "Pour débourrer la vanne, précisez le DevEUI du compteur."}

    if any(w in lower for w in ("télérelev", "telelev", "relevé forcé", "releve force", "forcer le relevé")):
        if dev_eui:
            return "send_water_meter_command", {"dev_eui": dev_eui, "action": "read"}
        return "__hint__", {"message": "Pour un télérelevé forcé, précisez le DevEUI du compteur."}

    if any(w in lower for w in ("intervalle", "fréquence", "frequence", "périod", "period")) and any(
        w in lower for w in ("relev", "rapport", "envoi", "transmis", "minute", "heure", "horaire")
    ):
        seconds = _parse_interval_seconds(lower)
        if dev_eui and seconds:
            if seconds < 600 or seconds > 86400:
                return "__hint__", {
                    "message": f"Intervalle {seconds}s hors plage — utilisez 600 à 86400 secondes (ex. 3600 = 1 h)."
                }
            return "send_water_meter_command", {
                "dev_eui": dev_eui,
                "action": "set_report_interval",
                "interval_seconds": seconds,
            }
        if not dev_eui:
            return "__hint__", {"message": "Précisez le DevEUI et l'intervalle (ex. « intervalle 1 h pour 8254812510001415 »)."}
        return "__hint__", {"message": "Précisez l'intervalle (ex. 3600 s, 1 h, 30 min)."}

    m = re.search(r"(?:heure\s+de\s+(?:début|debut|rapport)|report_hour)\s+(\d{1,2})", lower)
    if m and dev_eui:
        hour = int(m.group(1))
        if 0 <= hour <= 23:
            return "send_water_meter_command", {
                "dev_eui": dev_eui,
                "action": "set_report_hour",
                "report_hour": hour,
            }

    return None


def route_natural_language(question: str) -> tuple[str, dict[str, Any]] | None:
    q = _normalize_question(question.strip())
    lower = q.lower()

    # ── Lecture rapide ──
    if ("vue" in lower and "réseau" in lower) or ("ensemble" in lower and "réseau" in lower) or "overview" in lower:
        return "network_overview", {}
    if ("état" in lower or "status" in lower or "statut" in lower) and "réseau" in lower:
        return "network_overview", {}

    # ── Comptage (combien de gateways / devices) ──
    if _asks_count(lower):
        gw = _mentions(lower, GATEWAY_WORDS)
        dev = _mentions(lower, DEVICE_WORDS)
        if gw and dev:
            return "network_overview", {}
        if gw:
            return "list_gateways", {"limit": 50, "_intent": "count"}
        if dev:
            return "list_devices", {"limit": 50, "_intent": "count"}
        return "network_overview", {}

    # ── Listes (synonymes sans « liste ») ──
    if _mentions(lower, GATEWAY_WORDS) and any(
        w in lower for w in ("liste", "list", "quel", "quels", "quelle", "quelles", "montre", "affiche", "voir", "nos ", "mes ")
    ):
        return "list_gateways", {"limit": 20}
    if "liste" in lower and _mentions(lower, GATEWAY_WORDS):
        return "list_gateways", {"limit": 20}

    if _mentions(lower, DEVICE_WORDS) and any(
        w in lower for w in ("liste", "list", "montre", "affiche", "voir", "nos ", "mes ")
    ):
        return "list_devices", {"limit": 20}
    if "liste" in lower and _mentions(lower, DEVICE_WORDS):
        return "list_devices", {"limit": 20}

    if "application" in lower and ("liste" in lower or "list" in lower or "quel" in lower):
        return "list_applications", {"limit": 20}
    if ("profile" in lower or "profil" in lower) and ("liste" in lower or "list" in lower):
        return "list_device_profiles", {"limit": 20}

    if "batter" in lower:
        return "find_low_battery_devices", {"limit": 100}

    if _asks_stale_devices(lower):
        return "find_stale_devices", {"hours": _parse_stale_hours(lower), "limit": 50}

    downlink = _route_meter_downlink(q, lower)
    if downlink:
        return downlink

    dev_eui = _extract_dev_eui(q)
    if _asks_meter_telemetry(lower) or (
        _mentions(lower, METER_WORDS) and any(w in lower for w in ("état", "etat", "info", "détail", "detail"))
    ):
        if dev_eui:
            return "get_water_meter_telemetry", {"dev_eui": dev_eui}
        return "get_latest_water_meter_reading", {}

    m = re.search(
        r"(?:index|mesure|mesures|t[ée]l[ée]m[ée]trie|relev[ée]|consommation|vanne|batterie).*(?:compteur|device|dev_eui|deveui)\s+([0-9a-fA-F]{16})",
        lower,
    )
    if m:
        return "get_water_meter_telemetry", {"dev_eui": m.group(1).lower()}

    m = re.search(
        r"(?:compteur|device|dev_eui|deveui)\s+([0-9a-fA-F]{16}).*(?:index|mesure|mesures|m3|m³|vanne|batterie|relev[ée])",
        lower,
    )
    if m:
        return "get_water_meter_telemetry", {"dev_eui": m.group(1).lower()}

    m = re.search(r"(?:compteur|meter)\s+([0-9a-fA-F]{16})", lower)
    if m and any(w in lower for w in ("index", "mesure", "vanne", "batterie", "m3", "m³", "état", "etat")):
        return "get_water_meter_telemetry", {"dev_eui": m.group(1).lower()}

    if _mentions(lower, METER_WORDS) and any(
        w in lower for w in ("liste", "list", "montre", "affiche", "voir", "nos ", "mes ")
    ):
        return "list_water_meters", {"limit": 20}

    # Salutation seule → vue réseau
    if lower in ("bonjour", "salut", "hello", "hi", "coucou", "bjr"):
        return "network_overview", {}

    # ── Création incomplète → demander les informations ──
    if _wants_create(lower) and _mentions(lower, DEVICE_WORDS) and not _has_eui64(q):
        return "__hint__", {"message": DEVICE_CREATE_PROMPT, "_form": "device"}

    if _wants_create(lower) and _mentions(lower, GATEWAY_WORDS) and not _has_eui64(q):
        return "__hint__", {"message": GATEWAY_CREATE_PROMPT, "_form": "gateway"}

    # ── Création device (DevEUI + JoinEUI + AppKey en langage naturel) ──
    labeled = _parse_device_labeled_form(q)
    if labeled:
        return labeled

    provision = _parse_device_provision(q)
    if provision:
        return "create_device", provision

    # ── Création gateway ──
    m = re.search(
        r"cr[ée]e(?:r)?\s+(?:une\s+)?gateway\s+([0-9a-fA-F]{16})\s+(?:nomm[ée]e\s+|appel[ée]e\s+|nom\s+)(.+)",
        q,
        re.I,
    )
    if m:
        return "create_gateway", {"gateway_id": m.group(1).lower(), "name": m.group(2).strip().rstrip(".")}

    m = re.search(r"cr[ée]e(?:r)?\s+(?:une\s+)?gateway\s+([0-9a-fA-F]{16})", q, re.I)
    if m:
        return "create_gateway", {"gateway_id": m.group(1).lower(), "name": f"GW-{m.group(1)[-6:]}"}

    # ── Création device (format structuré) ──
    m = re.search(
        r"cr[ée]e(?:r)?\s+(?:un\s+)?device\s+([0-9a-fA-F]{16})\s+(?:nomm[ée]\s+|nom\s+)(.+?)(?:\s+application\s+|\s+app\s+)([0-9a-f-]{36})",
        q,
        re.I,
    )
    if m:
        return "create_device", {
            "dev_eui": m.group(1).lower(),
            "name": m.group(2).strip().rstrip("."),
            "application_id": m.group(3),
        }

    m = re.search(r"cr[ée]e(?:r)?\s+(?:un\s+)?device\s+([0-9a-fA-F]{16})", q, re.I)
    if m:
        return "create_device", {"dev_eui": m.group(1).lower()}

    # ── Suppression (confirm explicite) ──
    if re.search(r"supprime.*gateway\s+([0-9a-fA-F]{16}).*confirm", lower) or re.search(
        r"delete.*gateway\s+([0-9a-fA-F]{16}).*confirm", lower
    ):
        m = re.search(r"([0-9a-fA-F]{16})", q)
        if m:
            return "delete_gateway", {"gateway_id": m.group(1).lower(), "confirm": True}

    if re.search(r"supprime.*device\s+([0-9a-fA-F]{16}).*confirm", lower) or re.search(
        r"delete.*device\s+([0-9a-fA-F]{16}).*confirm", lower
    ):
        m = re.search(r"([0-9a-fA-F]{16})", q)
        if m:
            return "delete_device", {"dev_eui": m.group(1).lower(), "confirm": True}

    if ("supprime" in lower or "delete" in lower) and re.search(r"[0-9a-fA-F]{16}", q):
        return "__hint__", {"message": "Pour supprimer, ajoutez « confirm » à la fin de votre demande."}

    # ── Détail device / gateway ──
    m = re.search(r"(?:info|d[ée]tail|affiche).*(?:device|dev_eui)\s+([0-9a-fA-F]{16})", lower)
    if m:
        return "get_device", {"dev_eui": m.group(1).lower()}

    m = re.search(r"(?:info|d[ée]tail|affiche).*gateway\s+([0-9a-fA-F]{16})", lower)
    if m:
        return "get_gateway", {"gateway_id": m.group(1).lower()}

    # ── Métriques radio device ──
    m = re.search(
        r"(?:snr|rssi|sf|radio|m[ée]triques?).*(?:device|dev_eui|deveui)\s+([0-9a-fA-F]{16})",
        lower,
    )
    if m:
        return "get_device_radio_info", {"dev_eui": m.group(1).lower(), "limit": 10}

    m = re.search(r"(?:device|dev_eui|deveui)\s+([0-9a-fA-F]{16}).*(?:snr|rssi|sf)", lower)
    if m:
        return "get_device_radio_info", {"dev_eui": m.group(1).lower(), "limit": 10}

    if "<dev_eui>" in lower or "<dev_eui>" in q:
        return "__hint__", {"message": "Remplacez <dev_eui> par un DevEUI réel (16 caractères hex), ex: 0102030405060708"}

    # ── Diagnostic ──
    m = re.search(r"(?:diagnostique|pourquoi).*(?:device|dev_eui)\s+([0-9a-fA-F]{16})", lower)
    if m:
        return "diagnose_device", {"dev_eui": m.group(1).lower()}

    m = re.search(r"(?:diagnostique|pourquoi).*gateway\s+([0-9a-fA-F]{16})", lower)
    if m:
        return "diagnose_gateway", {"gateway_id": m.group(1).lower()}

    return None
