package store

import (
	"encoding/json"
	"strings"
)

const (
	AgentVerticalGeneric   = "generic"
	AgentVerticalLivestock = "livestock"
	AgentVerticalWater     = "water"
)

type AgentVerticalTemplate struct {
	Vertical       string
	DisplayName    string
	WelcomeMessage string
	SystemPrompt   string
	Suggestions    []string
}

func DetectAgentVertical(slug, name string) string {
	s := strings.ToLower(slug + " " + name)
	switch {
	case containsAny(s, "eleveur", "éleveur", "betail", "bétail", "livestock", "cattle", "saloum", "pastoral"):
		return AgentVerticalLivestock
	case containsAny(s, "eau", "water", "shengda", "sen-eau", "seneau", "suez", "hydro"):
		return AgentVerticalWater
	default:
		return AgentVerticalGeneric
	}
}

func containsAny(s string, parts ...string) bool {
	for _, p := range parts {
		if strings.Contains(s, p) {
			return true
		}
	}
	return false
}

func AgentTemplateForVertical(vertical string) AgentVerticalTemplate {
	switch vertical {
	case AgentVerticalLivestock:
		return AgentVerticalTemplate{
			Vertical:    AgentVerticalLivestock,
			DisplayName: "Agent IA — Élevage",
			WelcomeMessage: "Bonjour ! Je suis votre assistant IoT pour le suivi du bétail (colliers capteurs LoRaWAN). " +
				"Je peux lister les devices, diagnostiquer le réseau (RSSI, SNR, gateways), repérer les animaux sans remontée récente " +
				"et vous aider à provisionner devices et gateways.",
			SystemPrompt: `Tu es l'agent IA LoRaWAN dédié au suivi du bétail (colliers GPS / capteurs santé).
Tu disposes d'outils MCP pour le réseau : devices, gateways, métriques radio, events et diagnostics.
Réponds en français, concis et actionnable pour un éleveur ou un intégrateur terrain.
Utilise les outils avant de conclure quand des données réseau ou capteur sont nécessaires.
Ne parle pas de compteurs d'eau, vannes ou index m³ — ce n'est pas le contexte de ce tenant.
Cite DevEUI et Gateway ID quand pertinent.`,
			Suggestions: []string{
				"Donne-moi une vue d'ensemble du réseau",
				"Liste les devices (colliers)",
				"Quels devices n'ont pas remonté depuis 24 h ?",
				"Liste les gateways",
				"Quel est le RSSI moyen du réseau ?",
			},
		}
	case AgentVerticalWater:
		return AgentVerticalTemplate{
			Vertical:    AgentVerticalWater,
			DisplayName: "Agent IA — Eau / Shengda",
			WelcomeMessage: "Bonjour ! Je suis votre assistant compteurs d'eau Shengda. " +
				"Je peux lire les index m³, l'état des vannes, envoyer des commandes downlink (vanne, télérelevé, intervalle de rapport) " +
				"et diagnostiquer le réseau LoRaWAN.",
			SystemPrompt: `Tu es l'agent IA LoRaWAN pour la gestion de l'eau (compteurs Shengda V1.6).
Tu disposes d'outils MCP réseau et d'outils compteurs d'eau (index m³, batterie, vanne, downlinks).
Réponds en français, concis et actionnable.
Pour les compteurs, privilégie get_water_meter_telemetry(dev_eui).
Pour vanne ou intervalle de relevé, utilise send_water_meter_command.
Cite DevEUI et Gateway ID.`,
			Suggestions: []string{
				"Liste les compteurs d'eau",
				"Donne-moi une vue d'ensemble du réseau",
				"Liste les gateways",
				"Quels devices ont une batterie faible ?",
			},
		}
	default:
		return AgentVerticalTemplate{
			Vertical:       AgentVerticalGeneric,
			DisplayName:    "Agent IA LoRaWAN",
			WelcomeMessage: defaultWelcomeMessage,
			SystemPrompt:   DefaultGenericAgentSystemPrompt,
			Suggestions:    DefaultAgentSuggestions,
		}
	}
}

const DefaultGenericAgentSystemPrompt = `Tu es l'agent IA LoRaWAN de cette organisation.
Tu disposes d'outils MCP pour le réseau (devices, gateways, diagnostics, métriques radio)
et d'outils HTTP personnalisés configurés par le tenant.
Réponds en français, concis et actionnable.
Utilise les outils avant de conclure quand des données sont nécessaires.
Cite DevEUI et Gateway ID quand pertinent.`

func marshalSuggestions(suggestions []string) json.RawMessage {
	raw, _ := json.Marshal(suggestions)
	return raw
}
