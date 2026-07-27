package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type createAPIKeyRequest struct {
	Name   string   `json:"name"`
	Scopes []string `json:"scopes"`
}

func (d Deps) listAPIKeys(w http.ResponseWriter, r *http.Request) {
	scope, ok := d.dataTenantScope(w, r)
	if !ok || scope == nil {
		return
	}
	if d.APIKeys == nil {
		writeJSON(w, http.StatusOK, map[string]any{"result": []any{}})
		return
	}
	keys, err := d.APIKeys.ListByTenant(r.Context(), *scope)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"result": keys})
}

func (d Deps) createAPIKey(w http.ResponseWriter, r *http.Request) {
	scope, ok := d.dataTenantScope(w, r)
	if !ok || scope == nil {
		return
	}
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	var req createAPIKeyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name required")
		return
	}
	key, plain, err := d.APIKeys.Create(r.Context(), *scope, req.Name, req.Scopes)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"key":     key,
		"plainKey": plain,
	})
}

func (d Deps) revokeAPIKey(w http.ResponseWriter, r *http.Request) {
	scope, ok := d.dataTenantScope(w, r)
	if !ok || scope == nil {
		return
	}
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	keyID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid key id")
		return
	}
	if err := d.APIKeys.Revoke(r.Context(), *scope, keyID); err != nil {
		writeError(w, http.StatusNotFound, "key not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
