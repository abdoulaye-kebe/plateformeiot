package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrCustomDashboardNotFound = errors.New("custom dashboard not found")

type CustomDashboard struct {
	ID          uuid.UUID `json:"id"`
	TenantID    uuid.UUID `json:"tenantId"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	DeviceEUIs  []string  `json:"deviceEuis"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type CustomDashboardStore struct{ pool *pgxpool.Pool }

func NewCustomDashboardStore(pool *pgxpool.Pool) *CustomDashboardStore {
	return &CustomDashboardStore{pool: pool}
}

func (s *CustomDashboardStore) List(ctx context.Context, tenantID uuid.UUID) ([]CustomDashboard, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, tenant_id, name, description, device_euis, created_at, updated_at
		FROM custom_dashboards WHERE tenant_id = $1 ORDER BY updated_at DESC
	`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanCustomDashboards(rows)
}

func (s *CustomDashboardStore) Get(ctx context.Context, id uuid.UUID, tenantID uuid.UUID) (*CustomDashboard, error) {
	var d CustomDashboard
	var deviceRaw []byte
	err := s.pool.QueryRow(ctx, `
		SELECT id, tenant_id, name, description, device_euis, created_at, updated_at
		FROM custom_dashboards WHERE id = $1 AND tenant_id = $2
	`, id, tenantID).Scan(&d.ID, &d.TenantID, &d.Name, &d.Description, &deviceRaw, &d.CreatedAt, &d.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrCustomDashboardNotFound
	}
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal(deviceRaw, &d.DeviceEUIs)
	if d.DeviceEUIs == nil {
		d.DeviceEUIs = []string{}
	}
	return &d, nil
}

func (s *CustomDashboardStore) Create(ctx context.Context, tenantID uuid.UUID, name, description string, deviceEUIs []string) (*CustomDashboard, error) {
	if deviceEUIs == nil {
		deviceEUIs = []string{}
	}
	raw, err := json.Marshal(deviceEUIs)
	if err != nil {
		return nil, err
	}
	var d CustomDashboard
	var deviceRaw []byte
	err = s.pool.QueryRow(ctx, `
		INSERT INTO custom_dashboards (tenant_id, name, description, device_euis)
		VALUES ($1, $2, $3, $4)
		RETURNING id, tenant_id, name, description, device_euis, created_at, updated_at
	`, tenantID, name, description, raw).Scan(
		&d.ID, &d.TenantID, &d.Name, &d.Description, &deviceRaw, &d.CreatedAt, &d.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal(deviceRaw, &d.DeviceEUIs)
	return &d, nil
}

func (s *CustomDashboardStore) Update(ctx context.Context, id, tenantID uuid.UUID, name, description string, deviceEUIs []string) (*CustomDashboard, error) {
	if deviceEUIs == nil {
		deviceEUIs = []string{}
	}
	raw, err := json.Marshal(deviceEUIs)
	if err != nil {
		return nil, err
	}
	var d CustomDashboard
	var deviceRaw []byte
	err = s.pool.QueryRow(ctx, `
		UPDATE custom_dashboards
		SET name = $3, description = $4, device_euis = $5, updated_at = NOW()
		WHERE id = $1 AND tenant_id = $2
		RETURNING id, tenant_id, name, description, device_euis, created_at, updated_at
	`, id, tenantID, name, description, raw).Scan(
		&d.ID, &d.TenantID, &d.Name, &d.Description, &deviceRaw, &d.CreatedAt, &d.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrCustomDashboardNotFound
	}
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal(deviceRaw, &d.DeviceEUIs)
	return &d, nil
}

func (s *CustomDashboardStore) Delete(ctx context.Context, id, tenantID uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM custom_dashboards WHERE id = $1 AND tenant_id = $2`, id, tenantID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrCustomDashboardNotFound
	}
	return nil
}

func scanCustomDashboards(rows pgx.Rows) ([]CustomDashboard, error) {
	var out []CustomDashboard
	for rows.Next() {
		var d CustomDashboard
		var deviceRaw []byte
		if err := rows.Scan(&d.ID, &d.TenantID, &d.Name, &d.Description, &deviceRaw, &d.CreatedAt, &d.UpdatedAt); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(deviceRaw, &d.DeviceEUIs)
		if d.DeviceEUIs == nil {
			d.DeviceEUIs = []string{}
		}
		out = append(out, d)
	}
	if out == nil {
		out = []CustomDashboard{}
	}
	return out, rows.Err()
}
