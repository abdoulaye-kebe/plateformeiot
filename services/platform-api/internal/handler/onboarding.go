package handler

import (
	"encoding/json"
	"net/http"
)

type onboardingStatus struct {
	HasApplication   bool   `json:"hasApplication"`
	HasDeviceProfile bool   `json:"hasDeviceProfile"`
	HasGateway       bool   `json:"hasGateway"`
	HasDevice        bool   `json:"hasDevice"`
	HasTraffic       bool   `json:"hasTraffic"`
	ApplicationCount int64  `json:"applicationCount"`
	GatewayCount     int64  `json:"gatewayCount"`
	DeviceCount      int64  `json:"deviceCount"`
	ProfileCount     int64  `json:"profileCount"`
	Uplinks24h       int64  `json:"uplinks24h"`
	Complete         bool   `json:"complete"`
	CurrentStep      int    `json:"currentStep"`
	ChirpStackTenant string `json:"chirpstackTenantId,omitempty"`
}

func csTotalCount(data map[string]any) int64 {
	return int64(jsonNumber(data["totalCount"]))
}

func (d Deps) getOnboardingStatus(w http.ResponseWriter, r *http.Request) {
	csTenant := d.effectiveTenantID(r)
	if csTenant == "" {
		writeError(w, http.StatusForbidden, "tenant not assigned")
		return
	}

	status := onboardingStatus{ChirpStackTenant: csTenant}

	if apps, err := d.ChirpStack.ListApplications(r.Context(), csTenant, 1); err == nil {
		status.ApplicationCount = csTotalCount(apps)
		status.HasApplication = status.ApplicationCount > 0
	}
	if profiles, err := d.ChirpStack.ListDeviceProfiles(r.Context(), csTenant, 1); err == nil {
		status.ProfileCount = csTotalCount(profiles)
		status.HasDeviceProfile = status.ProfileCount > 0
	}
	if gws, err := d.ChirpStack.ListGateways(r.Context(), csTenant, 1); err == nil {
		status.GatewayCount = csTotalCount(gws)
		status.HasGateway = status.GatewayCount > 0
	}
	if devs, err := d.ChirpStack.ListDevices(r.Context(), csTenant, 1); err == nil {
		status.DeviceCount = csTotalCount(devs)
		status.HasDevice = status.DeviceCount > 0
	}

	if scope, ok := d.tryDataTenantScope(r); ok && scope != nil {
		if ov, err := d.Analytics.Overview(r.Context(), scope); err == nil {
			status.Uplinks24h = ov.TotalUplinks24h
			status.HasTraffic = ov.TotalUplinks24h > 0
		}
	}

	status.CurrentStep = onboardingCurrentStep(status)
	status.Complete = status.CurrentStep > 5
	writeJSON(w, http.StatusOK, status)
}

func onboardingCurrentStep(s onboardingStatus) int {
	switch {
	case !s.HasApplication || !s.HasDeviceProfile:
		return 1
	case !s.HasGateway:
		return 2
	case !s.HasDevice:
		return 3
	case !s.HasTraffic:
		return 4
	default:
		return 6
	}
}

type bootstrapRequest struct {
	ApplicationName string `json:"applicationName"`
	ProfileName     string `json:"profileName"`
}

func (d Deps) onboardingBootstrap(w http.ResponseWriter, r *http.Request) {
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	csTenant := d.effectiveTenantID(r)
	if csTenant == "" {
		writeError(w, http.StatusForbidden, "tenant not assigned")
		return
	}

	var req bootstrapRequest
	_ = json.NewDecoder(r.Body).Decode(&req)
	if req.ApplicationName == "" {
		req.ApplicationName = "Mon application"
	}
	if req.ProfileName == "" {
		req.ProfileName = "default-eu868-otaa"
	}

	created := map[string]any{}

	profiles, err := d.ChirpStack.ListDeviceProfiles(r.Context(), csTenant, 1)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	if csTotalCount(profiles) == 0 {
		prof, err := d.ChirpStack.CreateDeviceProfile(r.Context(), csTenant, req.ProfileName, "Profil EU868 OTAA — créé par l'assistant de démarrage")
		if err != nil {
			writeError(w, http.StatusBadGateway, "device profile: "+err.Error())
			return
		}
		created["deviceProfile"] = prof
	}

	apps, err := d.ChirpStack.ListApplications(r.Context(), csTenant, 1)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	if csTotalCount(apps) == 0 {
		app, err := d.ChirpStack.CreateApplication(r.Context(), csTenant, req.ApplicationName, "Application créée par l'assistant de démarrage")
		if err != nil {
			writeError(w, http.StatusBadGateway, "application: "+err.Error())
			return
		}
		if appID, ok := app["id"].(string); ok {
			d.registerApplicationForTenant(r, appID, req.ApplicationName)
		}
		created["application"] = app
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"created": created,
		"message": "Prérequis LoRaWAN initialisés",
	})
}
