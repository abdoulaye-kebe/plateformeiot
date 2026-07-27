package store

import (
	"context"
	"errors"

	"github.com/google/uuid"
)

var ErrTenantNotFound = errors.New("tenant not found")

func (s *TenantStore) GetByID(ctx context.Context, id uuid.UUID) (Tenant, error) {
	var t Tenant
	var billingEmail, stripeCustomer, subscriptionStatus, billingInterval *string
	err := s.pool.QueryRow(ctx, `
		SELECT id, name, slug, chirpstack_tenant_id, plan, status, billing_email, stripe_customer_id,
		       COALESCE(subscription_status, 'active'), COALESCE(billing_interval, 'month'), created_at
		FROM tenants WHERE id = $1
	`, id).Scan(&t.ID, &t.Name, &t.Slug, &t.ChirpStackTenantID, &t.Plan, &t.Status, &billingEmail, &stripeCustomer, &subscriptionStatus, &billingInterval, &t.CreatedAt)
	if err != nil {
		return Tenant{}, ErrTenantNotFound
	}
	if billingEmail != nil {
		t.BillingEmail = *billingEmail
	}
	if stripeCustomer != nil {
		t.StripeCustomerID = *stripeCustomer
	}
	if subscriptionStatus != nil {
		t.SubscriptionStatus = *subscriptionStatus
	}
	if billingInterval != nil {
		t.BillingInterval = *billingInterval
	}
	return t, nil
}

func (s *TenantStore) GetByChirpStackTenantID(ctx context.Context, csTenantID string) (Tenant, error) {
	var t Tenant
	err := s.pool.QueryRow(ctx, `
		SELECT id, name, slug, chirpstack_tenant_id, plan, status, created_at
		FROM tenants WHERE chirpstack_tenant_id = $1::uuid
	`, csTenantID).Scan(&t.ID, &t.Name, &t.Slug, &t.ChirpStackTenantID, &t.Plan, &t.Status, &t.CreatedAt)
	if err != nil {
		return Tenant{}, ErrTenantNotFound
	}
	return t, nil
}

func (s *TenantStore) GetBySlug(ctx context.Context, slug string) (Tenant, error) {
	var t Tenant
	err := s.pool.QueryRow(ctx, `
		SELECT id, name, slug, chirpstack_tenant_id, plan, status, created_at
		FROM tenants WHERE slug = $1
	`, slug).Scan(&t.ID, &t.Name, &t.Slug, &t.ChirpStackTenantID, &t.Plan, &t.Status, &t.CreatedAt)
	if err != nil {
		return Tenant{}, ErrTenantNotFound
	}
	return t, nil
}

func (s *TenantStore) UpdateStatus(ctx context.Context, id uuid.UUID, status string) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE tenants SET status = $2, updated_at = NOW() WHERE id = $1
	`, id, status)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrTenantNotFound
	}
	return nil
}

func (s *TenantStore) Delete(ctx context.Context, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM tenants WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrTenantNotFound
	}
	return nil
}
