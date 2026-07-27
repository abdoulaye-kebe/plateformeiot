package store

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Tenant struct {
	ID                   uuid.UUID `json:"id"`
	Name                 string    `json:"name"`
	Slug                 string    `json:"slug"`
	ChirpStackTenantID   *string   `json:"chirpstackTenantId,omitempty"`
	Plan                 string    `json:"plan"`
	Status               string    `json:"status"`
	SubscriptionStatus   string    `json:"subscriptionStatus,omitempty"`
	BillingInterval      string    `json:"billingInterval,omitempty"`
	BillingEmail         string    `json:"billingEmail,omitempty"`
	StripeCustomerID     string    `json:"stripeCustomerId,omitempty"`
	CreatedAt            time.Time `json:"createdAt"`
}

type TenantStore struct {
	pool *pgxpool.Pool
}

func NewPostgres(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	return pgxpool.New(ctx, dsn)
}

func NewTenantStore(pool *pgxpool.Pool) *TenantStore {
	return &TenantStore{pool: pool}
}

func (s *TenantStore) List(ctx context.Context) ([]Tenant, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, name, slug, chirpstack_tenant_id, plan, status, created_at
		FROM tenants ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tenants []Tenant
	for rows.Next() {
		var t Tenant
		if err := rows.Scan(&t.ID, &t.Name, &t.Slug, &t.ChirpStackTenantID, &t.Plan, &t.Status, &t.CreatedAt); err != nil {
			return nil, err
		}
		tenants = append(tenants, t)
	}
	return tenants, rows.Err()
}

func (s *TenantStore) Create(ctx context.Context, name, slug, plan string, csTenantID *string) (Tenant, error) {
	var t Tenant
	err := s.pool.QueryRow(ctx, `
		INSERT INTO tenants (name, slug, plan, chirpstack_tenant_id)
		VALUES ($1, $2, $3, $4)
		RETURNING id, name, slug, chirpstack_tenant_id, plan, status, created_at
	`, name, slug, plan, csTenantID).Scan(
		&t.ID, &t.Name, &t.Slug, &t.ChirpStackTenantID, &t.Plan, &t.Status, &t.CreatedAt,
	)
	return t, err
}

func (s *TenantStore) SetStripeCustomer(ctx context.Context, tenantID, customerID string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE tenants SET stripe_customer_id = $2, updated_at = NOW()
		WHERE id = $1::uuid
	`, tenantID, customerID)
	return err
}

func (s *TenantStore) SetSubscription(ctx context.Context, tenantID uuid.UUID, planID, status, subscriptionID, billingInterval string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE tenants SET plan = $2, subscription_status = $3, stripe_subscription_id = $4,
		                   billing_interval = $5, updated_at = NOW()
		WHERE id = $1
	`, tenantID, planID, status, nullStrSubscription(subscriptionID), billingInterval)
	return err
}

func nullStrSubscription(s string) any {
	if s == "" {
		return nil
	}
	return s
}
