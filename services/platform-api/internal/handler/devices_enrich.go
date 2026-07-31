package handler

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
)

func enrichDeviceList(ctx context.Context, d Deps, tenantID *uuid.UUID, csTenantID string, data map[string]any) {
	items, ok := data["result"].([]any)
	if !ok || len(items) == 0 {
		return
	}

	lastSeen, err := d.Analytics.DeviceLastSeenMap(ctx, tenantID)
	if err != nil {
		return
	}

	appNames := map[string]string{}
	csTenant := csTenantID
	if csTenant == "" {
		csTenant = d.TenantID
	}
	if csTenant != "" {
		apps, _ := d.ChirpStack.ListApplications(ctx, csTenant, 100)
		if appItems, ok := apps["result"].([]any); ok {
			for _, item := range appItems {
				m, _ := item.(map[string]any)
				if m == nil {
					continue
				}
				id, _ := m["id"].(string)
				name, _ := m["name"].(string)
				if id != "" {
					appNames[id] = name
				}
			}
		}
	}

	for i, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		device, _ := m["device"].(map[string]any)
		if device == nil {
			device = m
		}

		devEUI, _ := device["devEui"].(string)
		if devEUI == "" {
			devEUI, _ = m["devEui"].(string)
		}
		devEUI = strings.ToLower(devEUI)

		appID, _ := device["applicationId"].(string)
		if appID == "" {
			appID, _ = m["applicationId"].(string)
		}

		enriched := map[string]any{
			"connectivity": "LoRaWAN",
			"applicationName": appNames[appID],
		}

		if ls, ok := lastSeen[devEUI]; ok {
			enriched["lastComm"] = ls.LastSeen.Format(time.RFC3339)
			enriched["uplinkCount24h"] = ls.UplinkCount24
			enriched["status"] = deviceConnectivityStatus(ls.LastSeen)
		} else {
			enriched["status"] = "offline"
		}

		m["lorawan"] = enriched
		items[i] = m
	}
	data["result"] = items
}

func (d Deps) enrichDeviceListForRequest(w http.ResponseWriter, r *http.Request, data map[string]any) {
	scope, ok := d.tryDataTenantScope(r)
	if !ok || scope == nil {
		return
	}
	enrichDeviceList(r.Context(), d, scope, d.effectiveTenantID(r), data)
}
