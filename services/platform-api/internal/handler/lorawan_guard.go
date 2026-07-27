package handler

import (
	"net/http"
	"strings"

	"github.com/google/uuid"
)

func extractDeviceApplicationID(data map[string]any) string {
	device, _ := data["device"].(map[string]any)
	if device == nil {
		device = data
	}
	if v, ok := device["applicationId"].(string); ok {
		return v
	}
	return ""
}

func extractGatewayTenantID(data map[string]any) string {
	gateway, _ := data["gateway"].(map[string]any)
	if gateway == nil {
		gateway = data
	}
	if v, ok := gateway["tenantId"].(string); ok {
		return strings.ToLower(v)
	}
	return ""
}

func (d Deps) assertApplicationInTenant(w http.ResponseWriter, r *http.Request, applicationID string) bool {
	if applicationID == "" {
		writeError(w, http.StatusBadRequest, "applicationId required")
		return false
	}
	csTenant, ok := d.requireChirpStackTenant(w, r)
	if !ok {
		return false
	}
	platformTenant, ok := d.platformTenantID(r.Context(), r)
	if !ok {
		writeError(w, http.StatusForbidden, "tenant not mapped")
		return false
	}
	mapped, err := d.TenantResources.TenantIDByApplication(r.Context(), applicationID)
	if err != nil {
		writeError(w, http.StatusForbidden, "application not registered for tenant")
		return false
	}
	if mapped != *platformTenant {
		writeError(w, http.StatusForbidden, "application belongs to another tenant")
		return false
	}
	_ = csTenant
	return true
}

func (d Deps) assertDeviceInTenant(w http.ResponseWriter, r *http.Request, devEUI string) bool {
	csTenant, ok := d.requireChirpStackTenant(w, r)
	if !ok {
		return false
	}
	data, err := d.ChirpStack.GetDevice(r.Context(), devEUI)
	if err != nil {
		writeError(w, http.StatusNotFound, "device not found")
		return false
	}
	appID := extractDeviceApplicationID(data)
	if appID == "" {
		writeError(w, http.StatusForbidden, "device has no application")
		return false
	}
	if !d.assertApplicationInTenant(w, r, appID) {
		return false
	}
	_ = csTenant
	return true
}

func (d Deps) assertGatewayInTenant(w http.ResponseWriter, r *http.Request, gatewayID string) bool {
	csTenant, ok := d.requireChirpStackTenant(w, r)
	if !ok {
		return false
	}
	if strings.ToLower(gatewayID) != gatewayID {
		gatewayID = strings.ToLower(gatewayID)
	}
	data, err := d.ChirpStack.GetGateway(r.Context(), gatewayID)
	if err != nil {
		writeError(w, http.StatusNotFound, "gateway not found")
		return false
	}
	gwTenant := extractGatewayTenantID(data)
	if gwTenant != "" && gwTenant != strings.ToLower(csTenant) {
		writeError(w, http.StatusForbidden, "gateway belongs to another tenant")
		return false
	}
	platformTenant, ok := d.platformTenantID(r.Context(), r)
	if !ok {
		return false
	}
	mapped, err := d.TenantResources.TenantIDByGateway(r.Context(), gatewayID)
	if err == nil && mapped != *platformTenant {
		writeError(w, http.StatusForbidden, "gateway belongs to another tenant")
		return false
	}
	return true
}

func (d Deps) registerGatewayForTenant(r *http.Request, gatewayID string) {
	platformTenant, ok := d.platformTenantID(r.Context(), r)
	if !ok {
		return
	}
	_ = d.TenantResources.UpsertGateway(r.Context(), strings.ToLower(gatewayID), *platformTenant)
}

func (d Deps) registerApplicationForTenant(r *http.Request, applicationID, name string) {
	platformTenant, ok := d.platformTenantID(r.Context(), r)
	if !ok {
		return
	}
	parsed, err := uuid.Parse(applicationID)
	if err != nil {
		return
	}
	_ = d.TenantResources.UpsertApplication(r.Context(), parsed, *platformTenant, name)
}
