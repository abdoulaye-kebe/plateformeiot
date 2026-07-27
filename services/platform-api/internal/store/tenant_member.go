package store

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type TenantMember struct {
	ID             uuid.UUID `json:"id"`
	TenantID       uuid.UUID `json:"tenantId"`
	KeycloakUserID string    `json:"keycloakUserId"`
	Email          string    `json:"email"`
	Role           string    `json:"role"`
	CreatedAt      time.Time `json:"createdAt"`
}

type TenantMemberStore struct {
	pool *pgxpool.Pool
}

func NewTenantMemberStore(pool *pgxpool.Pool) *TenantMemberStore {
	return &TenantMemberStore{pool: pool}
}

func (s *TenantMemberStore) Create(ctx context.Context, tenantID uuid.UUID, keycloakUserID, email, role string) (TenantMember, error) {
	var m TenantMember
	err := s.pool.QueryRow(ctx, `
		INSERT INTO tenant_members (tenant_id, keycloak_user_id, email, role)
		VALUES ($1, $2, $3, $4)
		RETURNING id, tenant_id, keycloak_user_id, email, role, created_at
	`, tenantID, keycloakUserID, email, role).Scan(
		&m.ID, &m.TenantID, &m.KeycloakUserID, &m.Email, &m.Role, &m.CreatedAt,
	)
	return m, err
}

func (s *TenantMemberStore) ListByTenant(ctx context.Context, tenantID uuid.UUID) ([]TenantMember, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, tenant_id, keycloak_user_id, email, role, created_at
		FROM tenant_members WHERE tenant_id = $1 ORDER BY created_at DESC
	`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []TenantMember
	for rows.Next() {
		var m TenantMember
		if err := rows.Scan(&m.ID, &m.TenantID, &m.KeycloakUserID, &m.Email, &m.Role, &m.CreatedAt); err != nil {
			return nil, err
		}
		members = append(members, m)
	}
	return members, rows.Err()
}
