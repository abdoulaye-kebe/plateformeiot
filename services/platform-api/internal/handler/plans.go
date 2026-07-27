package handler

import (
	"net/http"
)

func (d Deps) listPlans(w http.ResponseWriter, r *http.Request) {
	plans, err := d.Plans.List(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"result": plans})
}

func (d Deps) billingSubscription(w http.ResponseWriter, r *http.Request) {
	scope, ok := d.dataTenantScope(w, r)
	if !ok {
		return
	}
	if scope == nil {
		writeError(w, http.StatusBadRequest, "tenantId required")
		return
	}
	tenant, err := d.TenantStore.GetByID(r.Context(), *scope)
	if err != nil {
		writeError(w, http.StatusNotFound, "tenant not found")
		return
	}
	quota, err := d.Plans.UsageQuota(r.Context(), *scope, tenant.Plan, d.Billing, tenant.SubscriptionStatus)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"tenant": tenantPublic(tenant, &quota.Plan),
		"usage":  quota,
	})
}
