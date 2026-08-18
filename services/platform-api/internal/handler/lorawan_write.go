package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/lorawan-platform/platform-api/internal/store"
)

func (d Deps) listApplications(w http.ResponseWriter, r *http.Request) {
	limit := queryInt(r, "limit", 50)
	csTenant := d.effectiveTenantID(r)
	data, err := d.ChirpStack.ListApplications(r.Context(), csTenant, limit)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	if platformTenant, ok := d.platformTenantID(r.Context(), r); ok {
		if items, ok := data["result"].([]any); ok {
			var mapped []map[string]any
			for _, item := range items {
				if m, ok := item.(map[string]any); ok {
					mapped = append(mapped, m)
				}
			}
			_ = d.TenantResources.SyncApplicationsFromChirpStack(r.Context(), *platformTenant, mapped)
		}
	}
	writeJSON(w, http.StatusOK, data)
}

func (d Deps) listDeviceProfiles(w http.ResponseWriter, r *http.Request) {
	limit := queryInt(r, "limit", 50)
	data, err := d.ChirpStack.ListDeviceProfiles(r.Context(), d.effectiveTenantID(r), limit)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, data)
}

type createDeviceProfileRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

func (d Deps) createDeviceProfile(w http.ResponseWriter, r *http.Request) {
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	var req createDeviceProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name required")
		return
	}
	csTenant := d.effectiveTenantID(r)
	if csTenant == "" {
		writeError(w, http.StatusBadRequest, "chirpstack tenant not configured")
		return
	}
	desc := strings.TrimSpace(req.Description)
	if desc == "" {
		desc = "Profil EU868 OTAA — créé depuis la console"
	}
	data, err := d.ChirpStack.CreateDeviceProfile(r.Context(), csTenant, req.Name, desc)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, data)
}

type createApplicationRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

func (d Deps) createApplication(w http.ResponseWriter, r *http.Request) {
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	var req createApplicationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		writeError(w, http.StatusBadRequest, "name required")
		return
	}
	data, err := d.ChirpStack.CreateApplication(r.Context(), d.effectiveTenantID(r), req.Name, req.Description)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	if appID, ok := data["id"].(string); ok {
		d.registerApplicationForTenant(r, appID, req.Name)
	}
	writeJSON(w, http.StatusCreated, data)
}

type createDeviceRequest struct {
	DevEUI          string `json:"devEui"`
	Name            string `json:"name"`
	ApplicationID   string `json:"applicationId"`
	DeviceProfileID string `json:"deviceProfileId"`
	JoinEUI         string `json:"joinEui"`
	AppKey          string `json:"appKey"`
	Description     string `json:"description"`
}

type setDeviceKeysRequest struct {
	AppKey string `json:"appKey"`
	NwkKey string `json:"nwkKey"`
}

func (d Deps) createDevice(w http.ResponseWriter, r *http.Request) {
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	var req createDeviceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if req.DevEUI == "" || req.Name == "" || req.ApplicationID == "" || req.DeviceProfileID == "" {
		writeError(w, http.StatusBadRequest, "devEui, name, applicationId, deviceProfileId required")
		return
	}
	if !d.assertApplicationInTenant(w, r, req.ApplicationID) {
		return
	}
	if !d.checkDeviceQuota(w, r) {
		return
	}
	data, err := d.ChirpStack.CreateDevice(r.Context(), req.DevEUI, req.Name, req.ApplicationID, req.DeviceProfileID, req.JoinEUI, req.Description)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	if req.AppKey != "" {
		if _, err := d.ChirpStack.CreateDeviceKeys(r.Context(), req.DevEUI, req.AppKey, ""); err != nil {
			writeError(w, http.StatusBadGateway, "device created but keys failed: "+err.Error())
			return
		}
	}
	writeJSON(w, http.StatusCreated, data)
}

func (d Deps) setDeviceKeys(w http.ResponseWriter, r *http.Request) {
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	devEUI := chi.URLParam(r, "devEui")
	if !d.assertDeviceInTenant(w, r, devEUI) {
		return
	}
	var req setDeviceKeysRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.AppKey == "" {
		writeError(w, http.StatusBadRequest, "appKey required")
		return
	}
	if _, err := d.ChirpStack.CreateDeviceKeys(r.Context(), devEUI, req.AppKey, req.NwkKey); err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type updateDeviceRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
	IsDisabled  *bool   `json:"isDisabled"`
}

func (d Deps) updateDevice(w http.ResponseWriter, r *http.Request) {
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	devEUI := chi.URLParam(r, "devEui")
	if !d.assertDeviceInTenant(w, r, devEUI) {
		return
	}
	var req updateDeviceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	updates := map[string]any{}
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.Description != nil {
		updates["description"] = *req.Description
	}
	if req.IsDisabled != nil {
		updates["isDisabled"] = *req.IsDisabled
	}
	data, err := d.ChirpStack.UpdateDevice(r.Context(), devEUI, updates)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, data)
}

func (d Deps) deleteDevice(w http.ResponseWriter, r *http.Request) {
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	devEUI := chi.URLParam(r, "devEui")
	if !d.assertDeviceInTenant(w, r, devEUI) {
		return
	}
	if err := d.ChirpStack.DeleteDevice(r.Context(), devEUI); err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type createGatewayRequest struct {
	GatewayID        string `json:"gatewayId"`
	Name             string `json:"name"`
	Description      string `json:"description"`
	RfScanSupported  *bool  `json:"rfScanSupported"`
	RfScanModel      string `json:"rfScanModel"`
}

func (d Deps) createGateway(w http.ResponseWriter, r *http.Request) {
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	var req createGatewayRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	req.GatewayID = strings.ToLower(strings.TrimSpace(req.GatewayID))
	if req.GatewayID == "" || req.Name == "" {
		writeError(w, http.StatusBadRequest, "gatewayId and name required")
		return
	}
	if !d.checkGatewayQuota(w, r) {
		return
	}
	csTenant := d.effectiveTenantID(r)
	data, created, err := d.ensureGateway(r, csTenant, req)
	if err != nil {
		if errors.Is(err, errGatewayOwnedByOtherTenant) {
			writeError(w, http.StatusConflict, err.Error())
			return
		}
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	if req.RfScanSupported != nil || req.RfScanModel != "" {
		tags := map[string]any{}
		if req.RfScanSupported != nil {
			if *req.RfScanSupported {
				tags["rfScanSupported"] = "true"
			} else {
				tags["rfScanSupported"] = "false"
			}
		}
		if req.RfScanModel != "" {
			tags["rfScanModel"] = req.RfScanModel
		}
		if len(tags) > 0 {
			if updated, err := d.ChirpStack.UpdateGateway(r.Context(), req.GatewayID, map[string]any{"tags": tags}); err == nil {
				data = updated
			}
		}
	}
	d.registerGatewayForTenant(r, req.GatewayID)
	enrichGatewayResponse(data)
	if created {
		writeJSON(w, http.StatusCreated, data)
		return
	}
	writeJSON(w, http.StatusOK, data)
}

var errGatewayOwnedByOtherTenant = errors.New("cette gateway est déjà enregistrée pour un autre client — contactez l'administrateur plateforme pour la réaffecter")

func isChirpStackDuplicateErr(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "duplicate key") ||
		strings.Contains(msg, "already exists") ||
		strings.Contains(msg, "gateway_pkey")
}

func (d Deps) ensureGateway(r *http.Request, csTenant string, req createGatewayRequest) (data map[string]any, created bool, err error) {
	data, err = d.ChirpStack.CreateGateway(r.Context(), csTenant, req.GatewayID, req.Name, req.Description)
	if err == nil {
		return data, true, nil
	}
	if !isChirpStackDuplicateErr(err) {
		return nil, false, err
	}

	existing, getErr := d.ChirpStack.GetGateway(r.Context(), req.GatewayID)
	if getErr != nil {
		return nil, false, err
	}
	gwTenant := strings.ToLower(extractGatewayTenantID(existing))
	targetTenant := strings.ToLower(csTenant)

	updates := map[string]any{"name": req.Name}
	if req.Description != "" {
		updates["description"] = req.Description
	}

	if gwTenant != "" && gwTenant != targetTenant {
		if !d.canReassignGateway(r, req.GatewayID, gwTenant) {
			return nil, false, errGatewayOwnedByOtherTenant
		}
		updates["tenantId"] = csTenant
	}

	data, err = d.ChirpStack.UpdateGateway(r.Context(), req.GatewayID, updates)
	if err != nil {
		return nil, false, errors.New("gateway déjà existante — mise à jour impossible: " + err.Error())
	}
	return data, false, nil
}

func (d Deps) canReassignGateway(r *http.Request, gatewayID, currentCSTenant string) bool {
	if d.isPlatformAdminUser(r) {
		return true
	}
	platformTenant, ok := d.platformTenantID(r.Context(), r)
	if !ok {
		return false
	}
	mapped, err := d.TenantResources.TenantIDByGateway(r.Context(), gatewayID)
	if err == nil {
		return mapped == *platformTenant
	}
	if !errors.Is(err, store.ErrTenantResourceNotFound) {
		return false
	}
	owner, err := d.TenantResources.TenantIDByChirpStackTenant(r.Context(), currentCSTenant)
	if errors.Is(err, store.ErrTenantResourceNotFound) {
		return true
	}
	return owner == *platformTenant
}

type updateGatewayRequest struct {
	Name            *string `json:"name"`
	Description     *string `json:"description"`
	RfScanSupported *bool   `json:"rfScanSupported"`
	RfScanModel     *string `json:"rfScanModel"`
}

func (d Deps) updateGateway(w http.ResponseWriter, r *http.Request) {
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	gatewayID := chi.URLParam(r, "gatewayId")
	if !d.assertGatewayInTenant(w, r, gatewayID) {
		return
	}
	var req updateGatewayRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	updates := map[string]any{}
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.Description != nil {
		updates["description"] = *req.Description
	}
	if req.RfScanSupported != nil || req.RfScanModel != nil {
		current, err := d.ChirpStack.GetGateway(r.Context(), gatewayID)
		if err != nil {
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}
		gateway := gatewayMapFromResponse(current)
		tags, _ := gateway["tags"].(map[string]any)
		if tags == nil {
			tags = map[string]any{}
		}
		if req.RfScanSupported != nil {
			if *req.RfScanSupported {
				tags["rfScanSupported"] = "true"
			} else {
				tags["rfScanSupported"] = "false"
			}
		}
		if req.RfScanModel != nil {
			tags["rfScanModel"] = *req.RfScanModel
		}
		updates["tags"] = tags
	}
	data, err := d.ChirpStack.UpdateGateway(r.Context(), gatewayID, updates)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	enrichGatewayResponse(data)
	writeJSON(w, http.StatusOK, data)
}

func (d Deps) deleteGateway(w http.ResponseWriter, r *http.Request) {
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	gatewayID := chi.URLParam(r, "gatewayId")
	if !d.assertGatewayInTenant(w, r, gatewayID) {
		return
	}
	if err := d.ChirpStack.DeleteGateway(r.Context(), gatewayID); err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
