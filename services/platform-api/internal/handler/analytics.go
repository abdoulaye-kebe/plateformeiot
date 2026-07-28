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

func (d Deps) listRules(w http.ResponseWriter, r *http.Request) {
	scope, ok := d.rulesTenantScope(w, r)
	if !ok {
		return
	}
	rules, err := d.Rules.List(r.Context(), scope)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"result": rules})
}

type createRuleRequest struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	TriggerType string          `json:"triggerType"`
	Condition   json.RawMessage `json:"condition"`
	Actions     json.RawMessage `json:"actions"`
}

func (d Deps) createRule(w http.ResponseWriter, r *http.Request) {
	scope, ok := d.rulesTenantScope(w, r)
	if !ok {
		return
	}
	var req createRuleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name required")
		return
	}
	if req.TriggerType == "" {
		req.TriggerType = "uplink"
	}
	if len(req.Condition) == 0 {
		req.Condition = json.RawMessage(`{}`)
	}
	if len(req.Actions) == 0 {
		req.Actions = json.RawMessage(`[]`)
	}
	rule, err := d.Rules.Create(r.Context(), scope, req.Name, req.Description, req.TriggerType, req.Condition, req.Actions)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, rule)
}

func (d Deps) deleteRule(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid rule id")
		return
	}
	scope, ok := d.rulesTenantScope(w, r)
	if !ok {
		return
	}
	if err := d.Rules.Delete(r.Context(), id, scope); err != nil {
		if errors.Is(err, store.ErrRuleNotFound) {
			writeError(w, http.StatusNotFound, "rule not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (d Deps) analyticsOverview(w http.ResponseWriter, r *http.Request) {
	scope, ok := d.dataTenantScope(w, r)
	if !ok {
		return
	}
	stats, err := d.Analytics.Overview(r.Context(), scope)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

func (d Deps) analyticsTraffic(w http.ResponseWriter, r *http.Request) {
	scope, ok := d.dataTenantScope(w, r)
	if !ok {
		return
	}
	hours := queryInt(r, "hours", 24)
	points, err := d.Analytics.TrafficHourly(r.Context(), scope, hours)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"points": points})
}

func (d Deps) analyticsDeviceRadio(w http.ResponseWriter, r *http.Request) {
	scope, ok := d.dataTenantScope(w, r)
	if !ok {
		return
	}
	devEUI := chi.URLParam(r, "devEui")
	if !d.assertDeviceInTenant(w, r, devEUI) {
		return
	}
	hours := queryInt(r, "hours", 24)
	stats, err := d.Analytics.DeviceRadio(r.Context(), scope, devEUI, hours)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

func (d Deps) analyticsDevicesTraffic(w http.ResponseWriter, r *http.Request) {
	scope, ok := d.dataTenantScope(w, r)
	if !ok {
		return
	}
	hours := queryInt(r, "hours", 24)
	raw := r.URL.Query().Get("devEuis")
	var devEUIs []string
	for _, part := range strings.Split(raw, ",") {
		e := strings.ToLower(strings.TrimSpace(part))
		if e != "" {
			devEUIs = append(devEUIs, e)
		}
	}
	for _, devEUI := range devEUIs {
		if !d.assertDeviceInTenant(w, r, devEUI) {
			return
		}
	}
	points, err := d.Analytics.TrafficHourlyForDevices(r.Context(), scope, devEUIs, hours)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"points": points})
}
