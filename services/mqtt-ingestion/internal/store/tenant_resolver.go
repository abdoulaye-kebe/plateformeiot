package store

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type TenantResolver struct {
	pool *pgxpool.Pool
}

func NewTenantResolver(pool *pgxpool.Pool) *TenantResolver {
	return &TenantResolver{pool: pool}
}

func (r *TenantResolver) ByApplication(ctx context.Context, applicationID string) (uuid.UUID, error) {
	var tenantID uuid.UUID
	err := r.pool.QueryRow(ctx, `
		SELECT tenant_id FROM tenant_applications WHERE chirpstack_application_id = $1::uuid
	`, applicationID).Scan(&tenantID)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, err
	}
	return tenantID, err
}

func (r *TenantResolver) ByGateway(ctx context.Context, gatewayID string) (uuid.UUID, error) {
	var tenantID uuid.UUID
	err := r.pool.QueryRow(ctx, `
		SELECT tenant_id FROM tenant_gateways WHERE gateway_id = $1
	`, gatewayID).Scan(&tenantID)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, err
	}
	return tenantID, err
}

func (r *TenantResolver) ByChirpStackTenant(ctx context.Context, csTenantID string) (uuid.UUID, error) {
	var tenantID uuid.UUID
	err := r.pool.QueryRow(ctx, `
		SELECT id FROM tenants WHERE chirpstack_tenant_id = $1::uuid
	`, csTenantID).Scan(&tenantID)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, err
	}
	return tenantID, err
}

func (r *TenantResolver) DefaultTenant(ctx context.Context) (uuid.UUID, error) {
	var tenantID uuid.UUID
	err := r.pool.QueryRow(ctx, `
		SELECT id FROM tenants WHERE slug = 'chirpstack-default' LIMIT 1
	`).Scan(&tenantID)
	return tenantID, err
}
