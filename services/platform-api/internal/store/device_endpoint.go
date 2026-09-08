package store

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrDeviceEndpointNotFound = errors.New("device endpoint not found")

type DeviceEndpoint struct {
	ID          uuid.UUID       `json:"id"`
	TenantID    uuid.UUID       `json:"tenantId"`
	Name        string          `json:"name"`
	Protocol    string          `json:"protocol"`
	ExternalID  string          `json:"externalId"`
	Credentials json.RawMessage `json:"credentials,omitempty"`
	Metadata    json.RawMessage `json:"metadata"`
	Enabled     bool            `json:"enabled"`
	LastSeenAt  *time.Time      `json:"lastSeenAt,omitempty"`
	CreatedAt   time.Time       `json:"createdAt"`
	UpdatedAt   time.Time       `json:"updatedAt"`
}

type DeviceEndpointStore struct {
	pool *pgxpool.Pool
}

func NewDeviceEndpointStore(pool *pgxpool.Pool) *DeviceEndpointStore {
	return &DeviceEndpointStore{pool: pool}
}

type CreateDeviceEndpointInput struct {
	TenantID   uuid.UUID
	Name       string
	Protocol   string
	ExternalID string
	Metadata   json.RawMessage
}

func (s *DeviceEndpointStore) Create(ctx context.Context, in CreateDeviceEndpointInput) (DeviceEndpoint, map[string]string, error) {
	creds := map[string]string{}
	switch in.Protocol {
	case "mqtt":
		creds["mqttPassword"] = randomToken(24)
	case "lwm2m":
		creds["pskIdentity"] = in.ExternalID
		creds["psk"] = strings.ToUpper(randomToken(16))
		if !strings.HasPrefix(in.ExternalID, "urn:imei:") {
			creds["pskIdentityAlt"] = "urn:imei:" + in.ExternalID
		}
	default:
		return DeviceEndpoint{}, nil, fmt.Errorf("unsupported protocol: %s", in.Protocol)
	}
	credsJSON, _ := json.Marshal(creds)
	meta := in.Metadata
	if meta == nil {
		meta = json.RawMessage(`{}`)
	}
	row := s.pool.QueryRow(ctx, `
		INSERT INTO device_endpoints (tenant_id, name, protocol, external_id, credentials, metadata)
		VALUES ($1,$2,$3,$4,$5,$6)
		RETURNING id, tenant_id, name, protocol, external_id, credentials, metadata, enabled, last_seen_at, created_at, updated_at
	`, in.TenantID, in.Name, in.Protocol, in.ExternalID, credsJSON, meta)
	ep, err := scanDeviceEndpoint(row)
	return ep, creds, err
}

func (s *DeviceEndpointStore) ListByTenant(ctx context.Context, tenantID uuid.UUID, protocol string, limit int) ([]DeviceEndpoint, error) {
	if limit <= 0 {
		limit = 100
	}
	var rows pgx.Rows
	var err error
	if protocol != "" {
		rows, err = s.pool.Query(ctx, `
			SELECT id, tenant_id, name, protocol, external_id, credentials, metadata, enabled, last_seen_at, created_at, updated_at
			FROM device_endpoints WHERE tenant_id = $1 AND protocol = $2
			ORDER BY created_at DESC LIMIT $3
		`, tenantID, protocol, limit)
	} else {
		rows, err = s.pool.Query(ctx, `
			SELECT id, tenant_id, name, protocol, external_id, credentials, metadata, enabled, last_seen_at, created_at, updated_at
			FROM device_endpoints WHERE tenant_id = $1
			ORDER BY created_at DESC LIMIT $2
		`, tenantID, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []DeviceEndpoint
	for rows.Next() {
		ep, err := scanDeviceEndpoint(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, ep)
	}
	return list, rows.Err()
}

func (s *DeviceEndpointStore) Get(ctx context.Context, id, tenantID uuid.UUID) (DeviceEndpoint, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT id, tenant_id, name, protocol, external_id, credentials, metadata, enabled, last_seen_at, created_at, updated_at
		FROM device_endpoints WHERE id = $1 AND tenant_id = $2
	`, id, tenantID)
	ep, err := scanDeviceEndpoint(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return ep, ErrDeviceEndpointNotFound
	}
	return ep, err
}

func (s *DeviceEndpointStore) Delete(ctx context.Context, id, tenantID uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM device_endpoints WHERE id = $1 AND tenant_id = $2`, id, tenantID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrDeviceEndpointNotFound
	}
	return nil
}

func (s *DeviceEndpointStore) ListTelemetry(ctx context.Context, tenantID uuid.UUID, deviceID uuid.UUID, limit int) ([]TelemetryMessage, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := s.pool.Query(ctx, `
		SELECT time, protocol, external_id, payload_json, payload_raw, payload_size, metadata
		FROM telemetry_messages
		WHERE tenant_id = $1 AND device_endpoint_id = $2
		ORDER BY time DESC LIMIT $3
	`, tenantID, deviceID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []TelemetryMessage
	for rows.Next() {
		var m TelemetryMessage
		if err := rows.Scan(&m.Time, &m.Protocol, &m.ExternalID, &m.PayloadJSON, &m.PayloadRaw, &m.PayloadSize, &m.Metadata); err != nil {
			return nil, err
		}
		list = append(list, m)
	}
	return list, rows.Err()
}

type TelemetryMessage struct {
	Time        time.Time       `json:"time"`
	Protocol    string          `json:"protocol"`
	ExternalID  string          `json:"externalId"`
	PayloadJSON json.RawMessage `json:"payload,omitempty"`
	PayloadRaw  string          `json:"payloadRaw,omitempty"`
	PayloadSize int             `json:"payloadSize"`
	Metadata    json.RawMessage `json:"metadata,omitempty"`
}

func scanDeviceEndpoint(row pgx.Row) (DeviceEndpoint, error) {
	var ep DeviceEndpoint
	err := row.Scan(
		&ep.ID, &ep.TenantID, &ep.Name, &ep.Protocol, &ep.ExternalID,
		&ep.Credentials, &ep.Metadata, &ep.Enabled, &ep.LastSeenAt, &ep.CreatedAt, &ep.UpdatedAt,
	)
	return ep, err
}

func randomToken(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func RedactCredentials(raw json.RawMessage) json.RawMessage {
	var m map[string]string
	if err := json.Unmarshal(raw, &m); err != nil {
		return raw
	}
	if _, ok := m["mqttPassword"]; ok {
		m["mqttPassword"] = "********"
	}
	if _, ok := m["psk"]; ok {
		m["psk"] = "********"
	}
	out, _ := json.Marshal(m)
	return out
}
