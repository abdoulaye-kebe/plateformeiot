package store

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrTenantResourceNotFound = errors.New("tenant resource not found")

type TenantResourceStore struct {
	pool *pgxpool.Pool
}

func NewTenantResourceStore(pool *pgxpool.Pool) *TenantResourceStore {
	return &TenantResourceStore{pool: pool}
}

func (s *TenantResourceStore) UpsertApplication(ctx context.Context, appID uuid.UUID, tenantID uuid.UUID, name string) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO tenant_applications (chirpstack_application_id, tenant_id, name)
		VALUES ($1, $2, $3)
		ON CONFLICT (chirpstack_application_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, name = EXCLUDED.name
	`, appID, tenantID, name)
	return err
}

func (s *TenantResourceStore) TenantIDByApplication(ctx context.Context, appID string) (uuid.UUID, error) {
	var tenantID uuid.UUID
	err := s.pool.QueryRow(ctx, `
		SELECT tenant_id FROM tenant_applications WHERE chirpstack_application_id = $1::uuid
	`, appID).Scan(&tenantID)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, ErrTenantResourceNotFound
	}
	return tenantID, err
}

func (s *TenantResourceStore) UpsertGateway(ctx context.Context, gatewayID string, tenantID uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO tenant_gateways (gateway_id, tenant_id) VALUES ($1, $2)
		ON CONFLICT (gateway_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id
	`, gatewayID, tenantID)
	return err
}

func (s *TenantResourceStore) TenantIDByGateway(ctx context.Context, gatewayID string) (uuid.UUID, error) {
	var tenantID uuid.UUID
	err := s.pool.QueryRow(ctx, `
		SELECT tenant_id FROM tenant_gateways WHERE gateway_id = $1
	`, gatewayID).Scan(&tenantID)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, ErrTenantResourceNotFound
	}
	return tenantID, err
}

func (s *TenantResourceStore) TenantIDByChirpStackTenant(ctx context.Context, csTenantID string) (uuid.UUID, error) {
	var tenantID uuid.UUID
	err := s.pool.QueryRow(ctx, `
		SELECT id FROM tenants WHERE chirpstack_tenant_id = $1::uuid AND status = 'active'
	`, csTenantID).Scan(&tenantID)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, ErrTenantResourceNotFound
	}
	return tenantID, err
}

func (s *TenantResourceStore) SyncApplicationsFromChirpStack(ctx context.Context, tenantID uuid.UUID, apps []map[string]any) error {
	for _, item := range apps {
		appID := extractStringID(item, "application", "id")
		if appID == "" {
			appID = extractStringID(item, "", "id")
		}
		name := extractStringID(item, "application", "name")
		if name == "" {
			name = extractStringID(item, "", "name")
		}
		if appID == "" {
			continue
		}
		parsed, err := uuid.Parse(appID)
		if err != nil {
			continue
		}
		if err := s.UpsertApplication(ctx, parsed, tenantID, name); err != nil {
			return err
		}
	}
	return nil
}

func extractStringID(item map[string]any, nested, key string) string {
	if nested != "" {
		if sub, ok := item[nested].(map[string]any); ok {
			if v, ok := sub[key].(string); ok {
				return v
			}
		}
	}
	if v, ok := item[key].(string); ok {
		return v
	}
	return ""
}
