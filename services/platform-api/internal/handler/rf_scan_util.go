package handler

import (
	"strings"

	"github.com/lorawan-platform/platform-api/internal/store"
)

var rfScanKnownModels = map[string]bool{
	"corecell-sx1302-sx1261": true,
	"semtech-sx1302-sx1261":  true,
	"corecell-sx1302":        true,
	"rak2287":                true,
	"rak5148":                true,
}

func gatewayMapFromResponse(data map[string]any) map[string]any {
	if g, ok := data["gateway"].(map[string]any); ok {
		return g
	}
	return data
}

func gatewayTagString(gateway map[string]any, key string) string {
	tags, _ := gateway["tags"].(map[string]any)
	if tags == nil {
		return ""
	}
	if v, ok := tags[key].(string); ok {
		return strings.TrimSpace(v)
	}
	return ""
}

func gatewayRfScanSupported(gateway map[string]any) bool {
	if gateway == nil {
		return false
	}
	tagVal := strings.ToLower(gatewayTagString(gateway, "rfScanSupported"))
	if tagVal == "true" || tagVal == "1" || tagVal == "yes" {
		return true
	}
	model := strings.ToLower(gatewayTagString(gateway, "rfScanModel"))
	if model != "" && rfScanKnownModels[model] {
		return true
	}
	metaModel := strings.ToLower(gatewayTagString(gateway, "hardwareModel"))
	return metaModel != "" && rfScanKnownModels[metaModel]
}

func gatewayRfScanModel(gateway map[string]any) string {
	if m := gatewayTagString(gateway, "rfScanModel"); m != "" {
		return m
	}
	return gatewayTagString(gateway, "hardwareModel")
}

func enrichGatewayRfScan(gateway map[string]any) {
	if gateway == nil {
		return
	}
	supported := gatewayRfScanSupported(gateway)
	gateway["rfScanSupported"] = supported
	if supported {
		gateway["rfScanModel"] = gatewayRfScanModel(gateway)
	}
}

func enrichGatewayResponse(data map[string]any) {
	gateway := gatewayMapFromResponse(data)
	enrichGatewayRfScan(gateway)
}

func enrichGatewayList(data map[string]any) {
	items, ok := data["result"].([]any)
	if !ok {
		return
	}
	for _, item := range items {
		if m, ok := item.(map[string]any); ok {
			if nested, ok := m["gateway"].(map[string]any); ok {
				enrichGatewayRfScan(nested)
				m["rfScanSupported"] = nested["rfScanSupported"]
				if model, ok := nested["rfScanModel"]; ok {
					m["rfScanModel"] = model
				}
			} else {
				enrichGatewayRfScan(m)
			}
		}
	}
}

func detectPolluters(bins []store.RfScanBin) []store.RfScanPolluter {
	if len(bins) == 0 {
		return []store.RfScanPolluter{}
	}
	var sum float64
	for _, b := range bins {
		sum += b.RssiDbm
	}
	median := sum / float64(len(bins))

	var out []store.RfScanPolluter
	for _, b := range bins {
		delta := b.RssiDbm - median
		if delta < 15 {
			continue
		}
		severity := "medium"
		if delta >= 25 || b.RssiDbm > -70 {
			severity = "high"
		} else if delta < 20 {
			severity = "low"
		}
		out = append(out, store.RfScanPolluter{
			FreqHz:   b.FreqHz,
			RssiDbm:  b.RssiDbm,
			Severity: severity,
		})
	}
	if out == nil {
		out = []store.RfScanPolluter{}
	}
	return out
}
