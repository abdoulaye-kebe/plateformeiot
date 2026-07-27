package handler

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

func (d Deps) createStripeCheckout(w http.ResponseWriter, r *http.Request) {
	if d.StripeSecretKey == "" {
		writeError(w, http.StatusServiceUnavailable, "stripe not configured")
		return
	}
	scope, ok := d.requirePlatformTenantScope(w, r)
	if !ok {
		return
	}
	tenant, err := d.TenantStore.GetByID(r.Context(), *scope)
	if err != nil {
		writeError(w, http.StatusNotFound, "tenant not found")
		return
	}

	var req struct {
		PlanID          string `json:"planId"`
		BillingInterval string `json:"billingInterval"`
		SuccessURL      string `json:"successUrl"`
		CancelURL       string `json:"cancelUrl"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if req.PlanID == "" {
		req.PlanID = tenant.Plan
	}
	if req.BillingInterval == "" {
		req.BillingInterval = "month"
	}
	if req.BillingInterval != "month" && req.BillingInterval != "year" {
		writeError(w, http.StatusBadRequest, "billingInterval must be month or year")
		return
	}
	if req.SuccessURL == "" {
		req.SuccessURL = d.StripeSuccessURL
	}
	if req.CancelURL == "" {
		req.CancelURL = d.StripeCancelURL
	}

	plan, err := d.Plans.Get(r.Context(), req.PlanID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid plan")
		return
	}

	form := url.Values{}
	form.Set("mode", "subscription")
	form.Set("success_url", req.SuccessURL)
	form.Set("cancel_url", req.CancelURL)
	form.Set("client_reference_id", scope.String())
	form.Set("metadata[tenant_id]", scope.String())
	form.Set("metadata[tenant_slug]", tenant.Slug)
	form.Set("metadata[plan_id]", plan.ID)
	form.Set("metadata[billing_interval]", req.BillingInterval)
	form.Set("subscription_data[metadata][tenant_id]", scope.String())
	form.Set("subscription_data[metadata][plan_id]", plan.ID)
	form.Set("subscription_data[metadata][billing_interval]", req.BillingInterval)

	stripePriceID := plan.StripePriceForInterval(req.BillingInterval)
	priceEUR := plan.PriceEURForInterval(req.BillingInterval)

	if stripePriceID != nil && *stripePriceID != "" {
		form.Set("line_items[0][price]", *stripePriceID)
		form.Set("line_items[0][quantity]", "1")
	} else if priceEUR != nil {
		cents := int64(*priceEUR * 100)
		form.Set("line_items[0][price_data][currency]", "eur")
		form.Set("line_items[0][price_data][unit_amount]", strconv.FormatInt(cents, 10))
		form.Set("line_items[0][price_data][recurring][interval]", req.BillingInterval)
		form.Set("line_items[0][price_data][product_data][name]", "Lorawan "+plan.Name+" ("+req.BillingInterval+")")
		form.Set("line_items[0][quantity]", "1")
	} else {
		writeError(w, http.StatusBadRequest, "plan has no price configured for this interval")
		return
	}

	if tenant.StripeCustomerID != "" {
		form.Set("customer", tenant.StripeCustomerID)
	} else if tenant.BillingEmail != "" {
		form.Set("customer_email", tenant.BillingEmail)
	}

	session, err := d.stripePost("/v1/checkout/sessions", form)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"sessionId":       session["id"],
		"url":             session["url"],
		"planId":          plan.ID,
		"planName":        plan.Name,
		"billingInterval": req.BillingInterval,
	})
}

func (d Deps) stripeWebhook(w http.ResponseWriter, r *http.Request) {
	if d.StripeWebhookSecret == "" {
		writeError(w, http.StatusServiceUnavailable, "stripe webhook not configured")
		return
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "read body failed")
		return
	}
	sig := r.Header.Get("Stripe-Signature")
	if !verifyStripeSignature(body, sig, d.StripeWebhookSecret) {
		writeError(w, http.StatusBadRequest, "invalid signature")
		return
	}

	var event struct {
		Type string `json:"type"`
		Data struct {
			Object map[string]any `json:"object"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &event); err != nil {
		writeError(w, http.StatusBadRequest, "invalid event")
		return
	}

	ctx := r.Context()
	obj := event.Data.Object

	switch event.Type {
	case "checkout.session.completed":
		ref, _ := obj["client_reference_id"].(string)
		customer, _ := obj["customer"].(string)
		if ref != "" && customer != "" {
			_ = d.TenantStore.SetStripeCustomer(ctx, ref, customer)
		}
	case "customer.subscription.created", "customer.subscription.updated":
		d.handleSubscriptionChange(ctx, obj)
	case "customer.subscription.deleted":
		d.handleSubscriptionDeleted(ctx, obj)
	}

	writeJSON(w, http.StatusOK, map[string]string{"received": "true"})
}

func (d Deps) handleSubscriptionChange(ctx context.Context, sub map[string]any) {
	meta, _ := sub["metadata"].(map[string]any)
	if meta == nil {
		return
	}
	tenantIDStr, _ := meta["tenant_id"].(string)
	planID, _ := meta["plan_id"].(string)
	billingInterval, _ := meta["billing_interval"].(string)
	if tenantIDStr == "" {
		return
	}
	tenantID, err := uuid.Parse(tenantIDStr)
	if err != nil {
		return
	}
	status, _ := sub["status"].(string)
	subID, _ := sub["id"].(string)
	if planID == "" {
		planID = "starter"
	}
	if billingInterval == "" {
		billingInterval = "month"
	}
	_ = d.TenantStore.SetSubscription(ctx, tenantID, planID, status, subID, billingInterval)
	if plan, err := d.Plans.Get(ctx, planID); err == nil {
		tenant, err := d.TenantStore.GetByID(ctx, tenantID)
		if err == nil && tenant.ChirpStackTenantID != nil && d.ChirpStackConfigured {
			_ = d.ChirpStack.UpdateTenantLimits(ctx, *tenant.ChirpStackTenantID, plan.MaxDevices, plan.MaxGateways)
		}
	}
}

func (d Deps) handleSubscriptionDeleted(ctx context.Context, sub map[string]any) {
	meta, _ := sub["metadata"].(map[string]any)
	if meta == nil {
		return
	}
	tenantIDStr, _ := meta["tenant_id"].(string)
	if tenantIDStr == "" {
		return
	}
	tenantID, err := uuid.Parse(tenantIDStr)
	if err != nil {
		return
	}
	_ = d.TenantStore.SetSubscription(ctx, tenantID, "starter", "canceled", "", "month")
}

func (d Deps) stripePost(path string, form url.Values) (map[string]any, error) {
	req, err := http.NewRequest(http.MethodPost, "https://api.stripe.com"+path, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+d.StripeSecretKey)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, &stripeError{msg: string(raw)}
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	return out, nil
}

type stripeError struct{ msg string }

func (e *stripeError) Error() string { return "stripe: " + e.msg }

func verifyStripeSignature(payload []byte, header, secret string) bool {
	if header == "" || secret == "" {
		return false
	}
	var timestamp, sig string
	for _, part := range strings.Split(header, ",") {
		kv := strings.SplitN(strings.TrimSpace(part), "=", 2)
		if len(kv) != 2 {
			continue
		}
		switch kv[0] {
		case "t":
			timestamp = kv[1]
		case "v1":
			sig = kv[1]
		}
	}
	if timestamp == "" || sig == "" {
		return false
	}
	ts, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil {
		return false
	}
	if time.Since(time.Unix(ts, 0)) > 5*time.Minute {
		return false
	}
	signed := timestamp + "." + string(payload)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(signed))
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(sig))
}
