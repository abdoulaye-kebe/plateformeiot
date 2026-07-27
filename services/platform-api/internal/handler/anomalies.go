package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/lorawan-platform/platform-api/internal/store"
)

func (d Deps) listAnomalies(w http.ResponseWriter, r *http.Request) {
	scope, ok := d.dataTenantScope(w, r)
	if !ok {
		return
	}
	openOnly := r.URL.Query().Get("open") != "false"
	limit := queryInt(r, "limit", 50)
	events, err := d.Anomalies.List(r.Context(), scope, openOnly, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	summary, err := d.Anomalies.Summary(r.Context(), scope)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"result": events, "summary": summary})
}

func (d Deps) resolveAnomaly(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid anomaly id")
		return
	}
	scope, ok := d.dataTenantScope(w, r)
	if !ok {
		return
	}
	if err := d.Anomalies.Resolve(r.Context(), id, scope); err != nil {
		if errors.Is(err, store.ErrAnomalyNotFound) {
			writeError(w, http.StatusNotFound, "anomaly not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
