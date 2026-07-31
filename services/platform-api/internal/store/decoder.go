package store

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrDecoderNotFound = errors.New("decoder not found")
var ErrDecoderNameExists = errors.New("decoder name already exists")

type Decoder struct {
	ID              uuid.UUID `json:"id"`
	TenantID        uuid.UUID `json:"tenantId"`
	Name            string    `json:"name"`
	Description     string    `json:"description"`
	Vendor          string    `json:"vendor"`
	Script          string    `json:"script"`
	DownlinkFPort   int       `json:"downlinkFPort"`
	DeviceProfileID *string   `json:"deviceProfileId,omitempty"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

type DecoderStore struct {
	pool *pgxpool.Pool
}

func NewDecoderStore(pool *pgxpool.Pool) *DecoderStore {
	return &DecoderStore{pool: pool}
}

func (s *DecoderStore) ListByTenant(ctx context.Context, tenantID uuid.UUID) ([]Decoder, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, tenant_id, name, description, vendor, script, downlink_f_port,
		       device_profile_id, created_at, updated_at
		FROM tenant_decoders
		WHERE tenant_id = $1
		ORDER BY updated_at DESC
	`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []Decoder
	for rows.Next() {
		d, err := scanDecoder(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, d)
	}
	return list, rows.Err()
}

func (s *DecoderStore) Get(ctx context.Context, id, tenantID uuid.UUID) (Decoder, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT id, tenant_id, name, description, vendor, script, downlink_f_port,
		       device_profile_id, created_at, updated_at
		FROM tenant_decoders
		WHERE id = $1 AND tenant_id = $2
	`, id, tenantID)
	d, err := scanDecoderRow(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Decoder{}, ErrDecoderNotFound
	}
	return d, err
}

func (s *DecoderStore) GetByName(ctx context.Context, tenantID uuid.UUID, name string) (Decoder, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT id, tenant_id, name, description, vendor, script, downlink_f_port,
		       device_profile_id, created_at, updated_at
		FROM tenant_decoders
		WHERE tenant_id = $1 AND name = $2
	`, tenantID, name)
	d, err := scanDecoderRow(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Decoder{}, ErrDecoderNotFound
	}
	return d, err
}

func (s *DecoderStore) Create(ctx context.Context, tenantID uuid.UUID, name, description, vendor, script string, downlinkFPort int) (Decoder, error) {
	if downlinkFPort <= 0 {
		downlinkFPort = 1
	}
	row := s.pool.QueryRow(ctx, `
		INSERT INTO tenant_decoders (tenant_id, name, description, vendor, script, downlink_f_port)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (tenant_id, name) DO UPDATE SET
			description = EXCLUDED.description,
			vendor = EXCLUDED.vendor,
			script = EXCLUDED.script,
			downlink_f_port = EXCLUDED.downlink_f_port,
			updated_at = NOW()
		RETURNING id, tenant_id, name, description, vendor, script, downlink_f_port,
		          device_profile_id, created_at, updated_at
	`, tenantID, name, description, vendor, script, downlinkFPort)
	return scanDecoderRow(row)
}

func (s *DecoderStore) Update(ctx context.Context, id, tenantID uuid.UUID, name, description, vendor, script string, downlinkFPort int) (Decoder, error) {
	if downlinkFPort <= 0 {
		downlinkFPort = 1
	}
	row := s.pool.QueryRow(ctx, `
		UPDATE tenant_decoders
		SET name = $3, description = $4, vendor = $5, script = $6,
		    downlink_f_port = $7, updated_at = NOW()
		WHERE id = $1 AND tenant_id = $2
		RETURNING id, tenant_id, name, description, vendor, script, downlink_f_port,
		          device_profile_id, created_at, updated_at
	`, id, tenantID, name, description, vendor, script, downlinkFPort)
	d, err := scanDecoderRow(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Decoder{}, ErrDecoderNotFound
	}
	if err != nil {
		if isUniqueViolation(err) {
			return Decoder{}, ErrDecoderNameExists
		}
		return Decoder{}, err
	}
	return d, nil
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

func (s *DecoderStore) SetDeviceProfileID(ctx context.Context, id, tenantID uuid.UUID, profileID string) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE tenant_decoders
		SET device_profile_id = $3, updated_at = NOW()
		WHERE id = $1 AND tenant_id = $2
	`, id, tenantID, profileID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrDecoderNotFound
	}
	return nil
}

func (s *DecoderStore) Delete(ctx context.Context, id, tenantID uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM tenant_decoders WHERE id = $1 AND tenant_id = $2`, id, tenantID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrDecoderNotFound
	}
	return nil
}

type dcScannable interface {
	Scan(dest ...any) error
}

func scanDecoder(rows pgx.Rows) (Decoder, error) {
	var d Decoder
	var profileID *string
	err := rows.Scan(
		&d.ID, &d.TenantID, &d.Name, &d.Description, &d.Vendor, &d.Script, &d.DownlinkFPort,
		&profileID, &d.CreatedAt, &d.UpdatedAt,
	)
	d.DeviceProfileID = profileID
	return d, err
}

func scanDecoderRow(row dcScannable) (Decoder, error) {
	var d Decoder
	var profileID *string
	err := row.Scan(
		&d.ID, &d.TenantID, &d.Name, &d.Description, &d.Vendor, &d.Script, &d.DownlinkFPort,
		&profileID, &d.CreatedAt, &d.UpdatedAt,
	)
	d.DeviceProfileID = profileID
	return d, err
}
