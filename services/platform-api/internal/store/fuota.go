package store

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrFuotaNotFound = errors.New("fuota deployment not found")

type FuotaDeployment struct {
	ID               uuid.UUID `json:"id"`
	TenantID         uuid.UUID `json:"tenantId"`
	Name             string    `json:"name"`
	ApplicationID    string    `json:"applicationId"`
	MulticastGroupID string    `json:"multicastGroupId,omitempty"`
	FirmwareObjectKey string   `json:"firmwareObjectKey,omitempty"`
	FirmwareSize     int64     `json:"firmwareSize"`
	DeviceCount      int       `json:"deviceCount"`
	Status           string    `json:"status"`
	CreatedAt        time.Time `json:"createdAt"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

type FuotaStore struct{ pool *pgxpool.Pool }

func NewFuotaStore(pool *pgxpool.Pool) *FuotaStore { return &FuotaStore{pool: pool} }

func (s *FuotaStore) Create(ctx context.Context, tenantID uuid.UUID, name, applicationID, multicastGroupID, firmwareKey string, firmwareSize int64, deviceCount int, status string) (*FuotaDeployment, error) {
	var d FuotaDeployment
	err := s.pool.QueryRow(ctx, `
		INSERT INTO fuota_deployments (tenant_id, name, application_id, multicast_group_id, firmware_object_key, firmware_size, device_count, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		RETURNING id, tenant_id, name, application_id, COALESCE(multicast_group_id, ''), COALESCE(firmware_object_key, ''),
		          firmware_size, device_count, status, created_at, updated_at
	`, tenantID, name, applicationID, nullStr(multicastGroupID), nullStr(firmwareKey), firmwareSize, deviceCount, status).Scan(
		&d.ID, &d.TenantID, &d.Name, &d.ApplicationID, &d.MulticastGroupID, &d.FirmwareObjectKey,
		&d.FirmwareSize, &d.DeviceCount, &d.Status, &d.CreatedAt, &d.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &d, nil
}

func (s *FuotaStore) List(ctx context.Context, tenantID uuid.UUID, limit int) ([]FuotaDeployment, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id, tenant_id, name, application_id, COALESCE(multicast_group_id, ''), COALESCE(firmware_object_key, ''),
		       firmware_size, device_count, status, created_at, updated_at
		FROM fuota_deployments WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2
	`, tenantID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []FuotaDeployment
	for rows.Next() {
		var d FuotaDeployment
		if err := rows.Scan(&d.ID, &d.TenantID, &d.Name, &d.ApplicationID, &d.MulticastGroupID, &d.FirmwareObjectKey,
			&d.FirmwareSize, &d.DeviceCount, &d.Status, &d.CreatedAt, &d.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	if out == nil {
		out = []FuotaDeployment{}
	}
	return out, rows.Err()
}

func (s *FuotaStore) UpdateStatus(ctx context.Context, id, tenantID uuid.UUID, status string) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE fuota_deployments SET status = $3, updated_at = NOW() WHERE id = $1 AND tenant_id = $2
	`, id, tenantID, status)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrFuotaNotFound
	}
	return nil
}

func (s *FuotaStore) Get(ctx context.Context, id, tenantID uuid.UUID) (*FuotaDeployment, error) {
	var d FuotaDeployment
	err := s.pool.QueryRow(ctx, `
		SELECT id, tenant_id, name, application_id, COALESCE(multicast_group_id, ''), COALESCE(firmware_object_key, ''),
		       firmware_size, device_count, status, created_at, updated_at
		FROM fuota_deployments WHERE id = $1 AND tenant_id = $2
	`, id, tenantID).Scan(
		&d.ID, &d.TenantID, &d.Name, &d.ApplicationID, &d.MulticastGroupID, &d.FirmwareObjectKey,
		&d.FirmwareSize, &d.DeviceCount, &d.Status, &d.CreatedAt, &d.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrFuotaNotFound
	}
	if err != nil {
		return nil, err
	}
	return &d, nil
}

func nullStr(s string) any {
	if s == "" {
		return nil
	}
	return s
}
