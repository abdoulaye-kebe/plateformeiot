package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/lorawan-platform/platform-api/internal/store"
)

func (d Deps) listCustomDashboards(w http.ResponseWriter, r *http.Request) {
	scope, ok := d.dataTenantScope(w, r)
	if !ok || scope == nil {
		return
	}
	if d.CustomDashboards == nil {
		writeJSON(w, http.StatusOK, map[string]any{"result": []any{}})
		return
	}
	list, err := d.CustomDashboards.List(r.Context(), *scope)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"result": list})
}

func (d Deps) getCustomDashboard(w http.ResponseWriter, r *http.Request) {
	scope, ok := d.dataTenantScope(w, r)
	if !ok || scope == nil {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid dashboard id")
		return
	}
	dashboard, err := d.CustomDashboards.Get(r.Context(), id, *scope)
	if err != nil {
		if errors.Is(err, store.ErrCustomDashboardNotFound) {
			writeError(w, http.StatusNotFound, "dashboard not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, dashboard)
}

type customDashboardRequest struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	DeviceEUIs  []string `json:"deviceEuis"`
}

func normalizeDevEUIs(euis []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, e := range euis {
		e = strings.ToLower(strings.TrimSpace(e))
		if e == "" || seen[e] {
			continue
		}
		seen[e] = true
		out = append(out, e)
	}
	return out
}

func (d Deps) createCustomDashboard(w http.ResponseWriter, r *http.Request) {
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	scope, ok := d.dataTenantScope(w, r)
	if !ok || scope == nil {
		return
	}
	var req customDashboardRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name required")
		return
	}
	deviceEUIs := normalizeDevEUIs(req.DeviceEUIs)
	for _, devEUI := range deviceEUIs {
		if !d.assertDeviceInTenant(w, r, devEUI) {
			return
		}
	}
	dashboard, err := d.CustomDashboards.Create(r.Context(), *scope, req.Name, req.Description, deviceEUIs)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, dashboard)
}

func (d Deps) updateCustomDashboard(w http.ResponseWriter, r *http.Request) {
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	scope, ok := d.dataTenantScope(w, r)
	if !ok || scope == nil {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid dashboard id")
		return
	}
	var req customDashboardRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name required")
		return
	}
	deviceEUIs := normalizeDevEUIs(req.DeviceEUIs)
	for _, devEUI := range deviceEUIs {
		if !d.assertDeviceInTenant(w, r, devEUI) {
			return
		}
	}
	dashboard, err := d.CustomDashboards.Update(r.Context(), id, *scope, req.Name, req.Description, deviceEUIs)
	if err != nil {
		if errors.Is(err, store.ErrCustomDashboardNotFound) {
			writeError(w, http.StatusNotFound, "dashboard not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, dashboard)
}

func (d Deps) deleteCustomDashboard(w http.ResponseWriter, r *http.Request) {
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	scope, ok := d.dataTenantScope(w, r)
	if !ok || scope == nil {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid dashboard id")
		return
	}
	if err := d.CustomDashboards.Delete(r.Context(), id, *scope); err != nil {
		if errors.Is(err, store.ErrCustomDashboardNotFound) {
			writeError(w, http.StatusNotFound, "dashboard not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
