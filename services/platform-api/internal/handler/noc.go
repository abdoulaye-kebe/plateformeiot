package handler

import (
	"net/http"

	"github.com/lorawan-platform/platform-api/internal/auth"
)

func (d Deps) authMe(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusOK, map[string]any{"authenticated": false})
		return
	}
	payload := map[string]any{
		"authenticated": true,
		"subject":       user.Subject,
		"email":         user.Email,
		"roles":         user.Roles,
		"tenantId":      user.TenantID,
	}
	if tid, ok := d.platformTenantID(r.Context(), r); ok {
		payload["platformTenantId"] = tid.String()
		if tenant, err := d.TenantStore.GetByID(r.Context(), *tid); err == nil {
			payload["tenantName"] = tenant.Name
			payload["tenantSlug"] = tenant.Slug
		}
	}
	writeJSON(w, http.StatusOK, payload)
}

func (d Deps) nocAlerts(w http.ResponseWriter, r *http.Request) {
	scope, ok := d.dataTenantScope(w, r)
	if !ok {
		return
	}
	limit := queryInt(r, "limit", 20)
	alerts, err := d.NOC.RecentAlerts(r.Context(), scope, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"alerts": alerts})
}

func (d Deps) billingUsage(w http.ResponseWriter, r *http.Request) {
	scope, ok := d.dataTenantScope(w, r)
	if !ok {
		return
	}
	usage, err := d.Billing.CurrentMonthUsage(r.Context(), scope)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, usage)
}
