package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/lorawan-platform/platform-api/internal/codecjs"
	"github.com/lorawan-platform/platform-api/internal/store"
)

type decoderRequest struct {
	Name          string `json:"name"`
	Description   string `json:"description"`
	Vendor        string `json:"vendor"`
	Script        string `json:"script"`
	DownlinkFPort int    `json:"downlinkFPort"`
}

type applyDecoderRequest struct {
	DeviceProfileID string `json:"deviceProfileId"`
	Create          bool   `json:"create"`
	Name            string `json:"name"`
	Description     string `json:"description"`
}

func (d Deps) listDecoders(w http.ResponseWriter, r *http.Request) {
	scope, ok := d.dataTenantScope(w, r)
	if !ok || scope == nil {
		return
	}
	if d.Decoders == nil {
		writeJSON(w, http.StatusOK, map[string]any{"result": []any{}})
		return
	}
	list, err := d.Decoders.ListByTenant(r.Context(), *scope)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"result": list})
}

func (d Deps) getDecoder(w http.ResponseWriter, r *http.Request) {
	scope, ok := d.dataTenantScope(w, r)
	if !ok || scope == nil {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid decoder id")
		return
	}
	dec, err := d.Decoders.Get(r.Context(), id, *scope)
	if err != nil {
		if errors.Is(err, store.ErrDecoderNotFound) {
			writeError(w, http.StatusNotFound, "decoder not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, dec)
}

func (d Deps) createDecoder(w http.ResponseWriter, r *http.Request) {
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	scope, ok := d.dataTenantScope(w, r)
	if !ok || scope == nil {
		return
	}
	var req decoderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name required")
		return
	}
	script := req.Script
	if script == "" {
		script = codecjs.DefaultScript
	}
	normalized, err := codecjs.EnsureChirpStackCodec(script)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	dec, err := d.Decoders.Create(r.Context(), *scope, req.Name, req.Description, req.Vendor, normalized, req.DownlinkFPort)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, dec)
}

func (d Deps) updateDecoder(w http.ResponseWriter, r *http.Request) {
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
		writeError(w, http.StatusBadRequest, "invalid decoder id")
		return
	}
	existing, err := d.Decoders.Get(r.Context(), id, *scope)
	if err != nil {
		if errors.Is(err, store.ErrDecoderNotFound) {
			writeError(w, http.StatusNotFound, "decoder not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	var req decoderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	name := req.Name
	if name == "" {
		name = existing.Name
	}
	script := req.Script
	if script == "" {
		script = existing.Script
	}
	vendor := req.Vendor
	if vendor == "" {
		vendor = existing.Vendor
	}
	desc := req.Description
	if desc == "" && req.Name == "" && req.Script == "" && req.Vendor == "" {
		desc = existing.Description
	} else if desc == "" && (req.Name != "" || req.Script != "") {
		desc = existing.Description
	}
	fPort := req.DownlinkFPort
	if fPort <= 0 {
		fPort = existing.DownlinkFPort
	}
	normalized, normErr := codecjs.EnsureChirpStackCodec(script)
	if normErr != nil {
		writeError(w, http.StatusBadRequest, normErr.Error())
		return
	}
	dec, err := d.Decoders.Update(r.Context(), id, *scope, name, desc, vendor, normalized, fPort)
	if err != nil {
		if errors.Is(err, store.ErrDecoderNameExists) {
			writeError(w, http.StatusConflict, "un décodeur avec ce nom existe déjà")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, dec)
}

func (d Deps) deleteDecoder(w http.ResponseWriter, r *http.Request) {
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
		writeError(w, http.StatusBadRequest, "invalid decoder id")
		return
	}
	if err := d.Decoders.Delete(r.Context(), id, *scope); err != nil {
		if errors.Is(err, store.ErrDecoderNotFound) {
			writeError(w, http.StatusNotFound, "decoder not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (d Deps) applyDecoder(w http.ResponseWriter, r *http.Request) {
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	if !d.ChirpStackConfigured {
		writeError(w, http.StatusBadGateway, "ChirpStack not configured")
		return
	}
	scope, ok := d.dataTenantScope(w, r)
	if !ok || scope == nil {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid decoder id")
		return
	}
	dec, err := d.Decoders.Get(r.Context(), id, *scope)
	if err != nil {
		if errors.Is(err, store.ErrDecoderNotFound) {
			writeError(w, http.StatusNotFound, "decoder not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	script, normErr := codecjs.EnsureChirpStackCodec(dec.Script)
	if normErr != nil {
		writeError(w, http.StatusBadRequest, normErr.Error())
		return
	}
	var req applyDecoderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}

	csTenant := d.effectiveTenantID(r)
	profileName := req.Name
	if profileName == "" {
		profileName = dec.Name
	}
	profileDesc := req.Description
	if profileDesc == "" {
		profileDesc = dec.Description
	}
	if profileDesc == "" {
		profileDesc = "Codec JavaScript — " + dec.Name
	}

	var profileID string
	if req.Create || req.DeviceProfileID == "" {
		data, err := d.ChirpStack.CreateDeviceProfileWithCodec(r.Context(), csTenant, profileName, profileDesc, script)
		if err != nil {
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}
		profileID = extractDeviceProfileID(data)
		writeJSON(w, http.StatusCreated, data)
	} else {
		data, err := d.ChirpStack.ApplyDeviceProfileCodec(r.Context(), req.DeviceProfileID, script)
		if err != nil {
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}
		profileID = req.DeviceProfileID
		writeJSON(w, http.StatusOK, data)
	}

	if profileID != "" {
		_ = d.Decoders.SetDeviceProfileID(r.Context(), id, *scope, profileID)
	}
}

func (d Deps) getDecoderTemplate(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"name":                "Modèle vide",
		"vendor":              "",
		"downlinkFPort":       1,
		"payloadCodecRuntime": "JS",
		"script":              codecjs.DefaultScript,
	})
}

func (d Deps) getShengdaDecoderTemplate(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"name":                "Shengda Water Meter V1.6",
		"vendor":              "shengda",
		"downlinkFPort":       2,
		"payloadCodecRuntime": "JS",
		"script":              codecjs.ShengdaScript(),
		"description":         "Télérelevé eau et contrôle vanne (port downlink 2)",
	})
}

func extractDeviceProfileID(data map[string]any) string {
	if id, ok := data["id"].(string); ok {
		return id
	}
	if dp, ok := data["deviceProfile"].(map[string]any); ok {
		if id, ok := dp["id"].(string); ok {
			return id
		}
	}
	return ""
}
