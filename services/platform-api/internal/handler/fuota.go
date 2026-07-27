package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/lorawan-platform/platform-api/internal/store"
)

func (d Deps) listFuotaDeployments(w http.ResponseWriter, r *http.Request) {
	scope, ok := d.requirePlatformTenantScope(w, r)
	if !ok {
		return
	}
	deployments, err := d.Fuota.List(r.Context(), *scope, queryInt(r, "limit", 20))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"result": deployments})
}

type createFuotaRequest struct {
	Name              string   `json:"name"`
	ApplicationID     string   `json:"applicationId"`
	DevEUIs           []string `json:"devEuis"`
	Region            string   `json:"region"`
	Class             string   `json:"class"`
	FirmwareObjectKey string   `json:"firmwareObjectKey"`
	FirmwareSize      int64    `json:"firmwareSize"`
}

func (d Deps) createFuotaDeployment(w http.ResponseWriter, r *http.Request) {
	scope, ok := d.requirePlatformTenantScope(w, r)
	if !ok {
		return
	}
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "write access required")
		return
	}

	var req createFuotaRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if req.Name == "" || req.ApplicationID == "" {
		writeError(w, http.StatusBadRequest, "name and applicationId required")
		return
	}
	if req.Region == "" {
		req.Region = "EU868"
	}
	if req.Class == "" {
		req.Class = "C"
	}

	csTenant := d.effectiveTenantID(r)
	multicast, err := d.ChirpStack.CreateMulticastGroup(r.Context(), csTenant, req.ApplicationID, req.Name+"-mc", req.Region, req.Class)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	multicastID := extractID(multicast, "id")

	status := "pending"
	if multicastID != "" {
		status = "multicast_created"
	}

	deployment, err := d.Fuota.Create(r.Context(), *scope, req.Name, req.ApplicationID, multicastID, req.FirmwareObjectKey, req.FirmwareSize, len(req.DevEUIs), status)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	for _, devEUI := range req.DevEUIs {
		if devEUI == "" || multicastID == "" {
			continue
		}
		_ = d.ChirpStack.AddDeviceToMulticastGroup(r.Context(), multicastID, devEUI)
	}

	writeJSON(w, http.StatusCreated, deployment)
}

func (d Deps) startFuotaDeployment(w http.ResponseWriter, r *http.Request) {
	scope, ok := d.requirePlatformTenantScope(w, r)
	if !ok {
		return
	}
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "write access required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid deployment id")
		return
	}
	deployment, err := d.Fuota.Get(r.Context(), id, *scope)
	if err != nil {
		if errors.Is(err, store.ErrFuotaNotFound) {
			writeError(w, http.StatusNotFound, "deployment not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if deployment.MulticastGroupID != "" && deployment.FirmwareObjectKey != "" && d.ObjectStore != nil {
		// Marque comme démarré — le déploiement réel nécessite chirpstack-fuota-server
		_ = d.Fuota.UpdateStatus(r.Context(), id, *scope, "running")
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "running", "note": "Multicast group prêt — connectez chirpstack-fuota-server pour le transfert firmware complet"})
}

func (d Deps) uploadFuotaFirmware(w http.ResponseWriter, r *http.Request) {
	scope, ok := d.requirePlatformTenantScope(w, r)
	if !ok {
		return
	}
	if d.ObjectStore == nil || !d.ObjectStore.Configured() {
		writeError(w, http.StatusServiceUnavailable, "object storage not configured")
		return
	}
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "invalid multipart form")
		return
	}
	file, header, err := r.FormFile("firmware")
	if err != nil {
		writeError(w, http.StatusBadRequest, "firmware file required")
		return
	}
	defer file.Close()

	name := r.FormValue("name")
	if name == "" {
		name = header.Filename
	}
	objectKey, err := d.ObjectStore.PutFirmware(r.Context(), scope.String(), name, file, header.Size, header.Header.Get("Content-Type"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"objectKey": objectKey, "size": header.Size})
}

func (d Deps) requirePlatformTenantScope(w http.ResponseWriter, r *http.Request) (*uuid.UUID, bool) {
	scope, ok := d.dataTenantScope(w, r)
	if !ok {
		return nil, false
	}
	if scope == nil {
		writeError(w, http.StatusBadRequest, "tenantId required")
		return nil, false
	}
	return scope, true
}

func extractID(data map[string]any, key string) string {
	if id, ok := data[key].(string); ok {
		return id
	}
	if nested, ok := data["multicastGroup"].(map[string]any); ok {
		if id, ok := nested["id"].(string); ok {
			return id
		}
	}
	return ""
}
