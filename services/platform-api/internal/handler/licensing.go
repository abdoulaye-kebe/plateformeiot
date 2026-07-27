package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/google/uuid"
	"github.com/lorawan-platform/platform-api/internal/auth"
	"github.com/lorawan-platform/platform-api/internal/store"
)

func (d Deps) tenantPlan(ctx context.Context, platformTenantID uuid.UUID) (*store.Plan, error) {
	tenant, err := d.TenantStore.GetByID(ctx, platformTenantID)
	if err != nil {
		return nil, err
	}
	return d.Plans.Get(ctx, tenant.Plan)
}

func (d Deps) requireFeature(w http.ResponseWriter, r *http.Request, feature string) (*store.Plan, bool) {
	tid, ok := d.platformTenantID(r.Context(), r)
	if !ok {
		writeError(w, http.StatusForbidden, "tenant not assigned")
		return nil, false
	}
	plan, err := d.tenantPlan(r.Context(), *tid)
	if err != nil {
		writeError(w, http.StatusForbidden, "plan not found")
		return nil, false
	}
	if !d.Plans.HasFeature(plan, feature) {
		writeError(w, http.StatusForbidden, fmt.Sprintf("feature %s not included in plan %s", feature, plan.Name))
		return nil, false
	}
	return plan, true
}

func (d Deps) checkDeviceQuota(w http.ResponseWriter, r *http.Request) bool {
	tid, ok := d.platformTenantID(r.Context(), r)
	if !ok {
		writeError(w, http.StatusForbidden, "tenant not assigned")
		return false
	}
	tenant, err := d.TenantStore.GetByID(r.Context(), *tid)
	if err != nil {
		writeError(w, http.StatusForbidden, "tenant not found")
		return false
	}
	plan, err := d.Plans.Get(r.Context(), tenant.Plan)
	if err != nil {
		writeError(w, http.StatusForbidden, "plan not configured")
		return false
	}
	usage, err := d.Billing.CurrentMonthUsage(r.Context(), tid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return false
	}
	if usage.UplinkCount > plan.MaxUplinksMonth {
		writeError(w, http.StatusPaymentRequired, "monthly uplink quota exceeded — upgrade your plan")
		return false
	}
	devices, err := d.ChirpStack.ListDevices(r.Context(), d.effectiveTenantID(r), 1)
	if err != nil {
		writeError(w, http.StatusBadGateway, "network error")
		return false
	}
	count := int64(jsonNumber(devices["totalCount"]))
	if count >= int64(plan.MaxDevices) {
		writeError(w, http.StatusPaymentRequired, fmt.Sprintf("device limit reached (%d/%d) — upgrade your plan", count, plan.MaxDevices))
		return false
	}
	return true
}

func (d Deps) checkGatewayQuota(w http.ResponseWriter, r *http.Request) bool {
	tid, ok := d.platformTenantID(r.Context(), r)
	if !ok {
		writeError(w, http.StatusForbidden, "tenant not assigned")
		return false
	}
	tenant, err := d.TenantStore.GetByID(r.Context(), *tid)
	if err != nil {
		writeError(w, http.StatusForbidden, "tenant not found")
		return false
	}
	plan, err := d.Plans.Get(r.Context(), tenant.Plan)
	if err != nil {
		writeError(w, http.StatusForbidden, "plan not configured")
		return false
	}
	gateways, err := d.ChirpStack.ListGateways(r.Context(), d.effectiveTenantID(r), 1)
	if err != nil {
		writeError(w, http.StatusBadGateway, "network error")
		return false
	}
	count := int64(jsonNumber(gateways["totalCount"]))
	if count >= int64(plan.MaxGateways) {
		writeError(w, http.StatusPaymentRequired, fmt.Sprintf("gateway limit reached (%d/%d) — upgrade your plan", count, plan.MaxGateways))
		return false
	}
	return true
}

func (d Deps) isPlatformAdminUser(r *http.Request) bool {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		return !d.AuthEnabled
	}
	return hasAnyRole(user, "platform-admin")
}

type tenantPublicView struct {
	ID                 uuid.UUID       `json:"id"`
	Name               string          `json:"name"`
	Slug               string          `json:"slug"`
	Plan               string          `json:"plan"`
	Status             string          `json:"status"`
	SubscriptionStatus string          `json:"subscriptionStatus,omitempty"`
	BillingInterval    string          `json:"billingInterval,omitempty"`
	PlanDetails        *store.Plan     `json:"planDetails,omitempty"`
	Features           json.RawMessage `json:"features,omitempty"`
}

func tenantPublic(t store.Tenant, plan *store.Plan) tenantPublicView {
	v := tenantPublicView{
		ID:                 t.ID,
		Name:               t.Name,
		Slug:               t.Slug,
		Plan:               t.Plan,
		Status:             t.Status,
		SubscriptionStatus: t.SubscriptionStatus,
		BillingInterval:    t.BillingInterval,
	}
	if plan != nil {
		v.PlanDetails = plan
		v.Features = plan.Features
	}
	return v
}

func jsonNumber(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	case int64:
		return float64(n)
	default:
		return 0
	}
}

func (d Deps) withFeatureOrAdmin(w http.ResponseWriter, r *http.Request, feature string) bool {
	if d.isPlatformAdminUser(r) {
		return true
	}
	_, ok := d.requireFeature(w, r, feature)
	return ok
}

func (d Deps) listAnomaliesLicensed(w http.ResponseWriter, r *http.Request) {
	if !d.withFeatureOrAdmin(w, r, "anomalies") {
		return
	}
	d.listAnomalies(w, r)
}

func (d Deps) listFuotaDeploymentsLicensed(w http.ResponseWriter, r *http.Request) {
	if !d.withFeatureOrAdmin(w, r, "fuota") {
		return
	}
	d.listFuotaDeployments(w, r)
}

func (d Deps) createFuotaDeploymentLicensed(w http.ResponseWriter, r *http.Request) {
	if !d.withFeatureOrAdmin(w, r, "fuota") {
		return
	}
	d.createFuotaDeployment(w, r)
}

func (d Deps) startFuotaDeploymentLicensed(w http.ResponseWriter, r *http.Request) {
	if !d.withFeatureOrAdmin(w, r, "fuota") {
		return
	}
	d.startFuotaDeployment(w, r)
}

func (d Deps) uploadFuotaFirmwareLicensed(w http.ResponseWriter, r *http.Request) {
	if !d.withFeatureOrAdmin(w, r, "fuota") {
		return
	}
	d.uploadFuotaFirmware(w, r)
}
