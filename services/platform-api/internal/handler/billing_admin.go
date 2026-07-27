package handler

import (
	"net/http"
)

func (d Deps) billingHistory(w http.ResponseWriter, r *http.Request) {
	scope, ok := d.dataTenantScope(w, r)
	if !ok {
		return
	}
	days := queryInt(r, "days", 30)
	history, err := d.Billing.DailyHistory(r.Context(), scope, days)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"result": history})
}

func (d Deps) billingAggregate(w http.ResponseWriter, r *http.Request) {
	if !d.requirePlatformAdmin(w, r) {
		return
	}
	n, err := d.Billing.AggregateYesterday(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"aggregatedTenants": n})
}
