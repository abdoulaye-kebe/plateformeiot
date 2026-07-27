package handler

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

func (d Deps) listDevicePayloads(w http.ResponseWriter, r *http.Request) {
	scope, ok := d.dataTenantScope(w, r)
	if !ok {
		return
	}
	devEUI := chi.URLParam(r, "devEui")
	if !d.assertDeviceInTenant(w, r, devEUI) {
		return
	}
	limit := queryInt(r, "limit", 20)
	records, err := d.Payloads.ListByDevice(r.Context(), scope, devEUI, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"result": records})
}

func (d Deps) getPayloadDownloadURL(w http.ResponseWriter, r *http.Request) {
	if d.ObjectStore == nil || !d.ObjectStore.Configured() {
		writeError(w, http.StatusServiceUnavailable, "object storage not configured")
		return
	}
	scope, ok := d.dataTenantScope(w, r)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid payload id")
		return
	}
	objectKey, err := d.Payloads.GetObjectKey(r.Context(), id, scope)
	if err != nil {
		writeError(w, http.StatusNotFound, "payload not found")
		return
	}
	url, err := d.ObjectStore.PresignedGet(r.Context(), objectKey, d.PresignExpiry)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"url": url})
}
