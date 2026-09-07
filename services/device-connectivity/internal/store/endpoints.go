package store

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrEndpointNotFound = errors.New("device endpoint not found")

type Endpoint struct {
	ID           uuid.UUID
	TenantID     uuid.UUID
	Name         string
	Protocol     string
	ExternalID   string
	Credentials  json.RawMessage
	Metadata     json.RawMessage
	Enabled      bool
	LastSeenAt   *time.Time
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type EndpointStore struct {
	pool *pgxpool.Pool
}

func NewEndpointStore(pool *pgxpool.Pool) *EndpointStore {
	return &EndpointStore{pool: pool}
}

func (s *EndpointStore) GetByExternalID(ctx context.Context, protocol, externalID string) (*Endpoint, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT id, tenant_id, name, protocol, external_id, credentials, metadata, enabled, last_seen_at, created_at, updated_at
		FROM device_endpoints
		WHERE protocol = $1 AND external_id = $2 AND enabled = true
	`, protocol, externalID)
	ep, err := scanEndpoint(row)
	if err != nil {
		return nil, err
	}
	return &ep, nil
}

func (s *EndpointStore) AuthenticateMQTT(ctx context.Context, username, password string) (*Endpoint, error) {
	ep, err := s.GetByExternalID(ctx, "mqtt", username)
	if err != nil {
		return nil, err
	}
	var creds map[string]string
	if err := json.Unmarshal(ep.Credentials, &creds); err != nil {
		return nil, ErrEndpointNotFound
	}
	if creds["mqttPassword"] != password {
		return nil, ErrEndpointNotFound
	}
	return ep, nil
}

func (s *EndpointStore) GetLwM2M(ctx context.Context, endpointName string) (*Endpoint, error) {
	return s.GetByExternalID(ctx, "lwm2m", endpointName)
}

func (s *EndpointStore) LookupLwM2MPSK(ctx context.Context, identity string) ([]byte, error) {
	identity = strings.TrimSpace(identity)
	if identity == "" {
		return nil, ErrEndpointNotFound
	}
	ep, err := s.GetByExternalID(ctx, "lwm2m", identity)
	if err != nil {
		return nil, err
	}
	var creds map[string]string
	if err := json.Unmarshal(ep.Credentials, &creds); err != nil {
		return nil, ErrEndpointNotFound
	}
	pskHex := strings.TrimSpace(creds["psk"])
	if pskHex == "" {
		return nil, ErrEndpointNotFound
	}
	key, err := hex.DecodeString(pskHex)
	if err != nil {
		return nil, ErrEndpointNotFound
	}
	return key, nil
}

func (s *EndpointStore) TouchLastSeen(ctx context.Context, id uuid.UUID, ts time.Time) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE device_endpoints SET last_seen_at = $2, updated_at = NOW() WHERE id = $1
	`, id, ts.UTC())
	return err
}

func (s *EndpointStore) InsertTelemetry(ctx context.Context, row TelemetryRow) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO telemetry_messages (time, tenant_id, device_endpoint_id, protocol, external_id, payload_json, payload_raw, payload_size, metadata)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
	`, row.Time, row.TenantID, row.DeviceEndpointID, row.Protocol, row.ExternalID, row.PayloadJSON, row.PayloadRaw, row.PayloadSize, row.Metadata)
	return err
}

type TelemetryRow struct {
	Time             time.Time
	TenantID         uuid.UUID
	DeviceEndpointID uuid.UUID
	Protocol         string
	ExternalID       string
	PayloadJSON      []byte
	PayloadRaw       string
	PayloadSize      int
	Metadata         []byte
}

func scanEndpoint(row pgx.Row) (Endpoint, error) {
	var ep Endpoint
	err := row.Scan(
		&ep.ID, &ep.TenantID, &ep.Name, &ep.Protocol, &ep.ExternalID,
		&ep.Credentials, &ep.Metadata, &ep.Enabled, &ep.LastSeenAt, &ep.CreatedAt, &ep.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return ep, ErrEndpointNotFound
	}
	return ep, err
}

func NewPostgres(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	return pgxpool.New(ctx, dsn)
}
