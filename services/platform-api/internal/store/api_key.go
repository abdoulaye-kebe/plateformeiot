package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type APIKey struct {
	ID        uuid.UUID  `json:"id"`
	TenantID  uuid.UUID  `json:"tenantId"`
	Name      string     `json:"name"`
	Prefix    string     `json:"prefix"`
	Scopes    []string   `json:"scopes"`
	CreatedAt time.Time  `json:"createdAt"`
	RevokedAt *time.Time `json:"revokedAt,omitempty"`
}

type APIKeyStore struct {
	pool *pgxpool.Pool
}

func NewAPIKeyStore(pool *pgxpool.Pool) *APIKeyStore {
	return &APIKeyStore{pool: pool}
}

func (s *APIKeyStore) Create(ctx context.Context, tenantID uuid.UUID, name string, scopes []string) (APIKey, string, error) {
	if len(scopes) == 0 {
		scopes = []string{"read"}
	}
	prefix, err := randomHex(4)
	if err != nil {
		return APIKey{}, "", err
	}
	secret, err := randomHex(16)
	if err != nil {
		return APIKey{}, "", err
	}
	plain := fmt.Sprintf("lwp_%s_%s", prefix, secret)
	hash := hashKey(plain)

	var k APIKey
	err = s.pool.QueryRow(ctx, `
		INSERT INTO api_keys (tenant_id, name, key_hash, prefix, scopes)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, tenant_id, name, prefix, scopes, created_at
	`, tenantID, name, hash, prefix, scopes).Scan(
		&k.ID, &k.TenantID, &k.Name, &k.Prefix, &k.Scopes, &k.CreatedAt,
	)
	return k, plain, err
}

func (s *APIKeyStore) ListByTenant(ctx context.Context, tenantID uuid.UUID) ([]APIKey, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, tenant_id, name, prefix, scopes, created_at, revoked_at
		FROM api_keys WHERE tenant_id = $1 ORDER BY created_at DESC
	`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var keys []APIKey
	for rows.Next() {
		var k APIKey
		if err := rows.Scan(&k.ID, &k.TenantID, &k.Name, &k.Prefix, &k.Scopes, &k.CreatedAt, &k.RevokedAt); err != nil {
			return nil, err
		}
		keys = append(keys, k)
	}
	return keys, rows.Err()
}

func (s *APIKeyStore) Revoke(ctx context.Context, tenantID, keyID uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE api_keys SET revoked_at = NOW()
		WHERE id = $1 AND tenant_id = $2 AND revoked_at IS NULL
	`, keyID, tenantID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrTenantNotFound
	}
	return nil
}

type ValidatedAPIKey struct {
	KeyID    uuid.UUID
	TenantID uuid.UUID
	Scopes   []string
}

func (s *APIKeyStore) Validate(ctx context.Context, plainKey string) (*ValidatedAPIKey, error) {
	if plainKey == "" {
		return nil, fmt.Errorf("empty key")
	}
	hash := hashKey(plainKey)
	var k ValidatedAPIKey
	err := s.pool.QueryRow(ctx, `
		SELECT id, tenant_id, scopes FROM api_keys
		WHERE key_hash = $1 AND revoked_at IS NULL
	`, hash).Scan(&k.KeyID, &k.TenantID, &k.Scopes)
	if err != nil {
		return nil, err
	}
	return &k, nil
}

func hashKey(plain string) string {
	sum := sha256.Sum256([]byte(plain))
	return hex.EncodeToString(sum[:])
}

func randomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func ScopesToRoles(scopes []string) []string {
	roles := []string{"viewer"}
	for _, s := range scopes {
		switch s {
		case "write", "admin":
			return []string{"operator"}
		}
	}
	return roles
}
