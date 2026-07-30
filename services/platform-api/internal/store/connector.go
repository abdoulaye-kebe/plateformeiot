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

var ErrConnectorNotFound = errors.New("connector not found")

type Connector struct {
	ID        uuid.UUID       `json:"id"`
	TenantID  uuid.UUID       `json:"tenantId"`
	Name      string          `json:"name"`
	Type      string          `json:"type"`
	Enabled   bool            `json:"enabled"`
	Events    []string        `json:"events"`
	Config    json.RawMessage `json:"config"`
	CreatedAt time.Time       `json:"createdAt"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

type ConnectorStore struct {
	pool *pgxpool.Pool
}

func NewConnectorStore(pool *pgxpool.Pool) *ConnectorStore {
	return &ConnectorStore{pool: pool}
}

func (s *ConnectorStore) ListByTenant(ctx context.Context, tenantID uuid.UUID) ([]Connector, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, tenant_id, name, type, enabled, events, config, created_at, updated_at
		FROM tenant_connectors
		WHERE tenant_id = $1
		ORDER BY created_at DESC
	`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []Connector
	for rows.Next() {
		c, err := scanConnector(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, c)
	}
	return list, rows.Err()
}

func (s *ConnectorStore) ListEnabledForEvent(ctx context.Context, tenantID uuid.UUID, event string) ([]Connector, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, tenant_id, name, type, enabled, events, config, created_at, updated_at
		FROM tenant_connectors
		WHERE tenant_id = $1 AND enabled = true AND $2 = ANY(events)
	`, tenantID, event)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []Connector
	for rows.Next() {
		c, err := scanConnector(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, c)
	}
	return list, rows.Err()
}

func (s *ConnectorStore) Get(ctx context.Context, id, tenantID uuid.UUID) (Connector, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT id, tenant_id, name, type, enabled, events, config, created_at, updated_at
		FROM tenant_connectors
		WHERE id = $1 AND tenant_id = $2
	`, id, tenantID)
	c, err := scanConnectorRow(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Connector{}, ErrConnectorNotFound
	}
	return c, err
}

func (s *ConnectorStore) Create(ctx context.Context, tenantID uuid.UUID, name, typ string, enabled bool, events []string, config json.RawMessage) (Connector, error) {
	if len(events) == 0 {
		events = []string{"uplink"}
	}
	if config == nil {
		config = json.RawMessage(`{}`)
	}
	row := s.pool.QueryRow(ctx, `
		INSERT INTO tenant_connectors (tenant_id, name, type, enabled, events, config)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, tenant_id, name, type, enabled, events, config, created_at, updated_at
	`, tenantID, name, typ, enabled, events, config)
	return scanConnectorRow(row)
}

func (s *ConnectorStore) Update(ctx context.Context, id, tenantID uuid.UUID, name, typ string, enabled bool, events []string, config json.RawMessage) (Connector, error) {
	if len(events) == 0 {
		events = []string{"uplink"}
	}
	row := s.pool.QueryRow(ctx, `
		UPDATE tenant_connectors
		SET name = $3, type = $4, enabled = $5, events = $6, config = $7, updated_at = NOW()
		WHERE id = $1 AND tenant_id = $2
		RETURNING id, tenant_id, name, type, enabled, events, config, created_at, updated_at
	`, id, tenantID, name, typ, enabled, events, config)
	c, err := scanConnectorRow(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Connector{}, ErrConnectorNotFound
	}
	return c, err
}

func (s *ConnectorStore) Delete(ctx context.Context, id, tenantID uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM tenant_connectors WHERE id = $1 AND tenant_id = $2`, id, tenantID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrConnectorNotFound
	}
	return nil
}

type scannable interface {
	Scan(dest ...any) error
}

func scanConnector(rows pgx.Rows) (Connector, error) {
	var c Connector
	err := rows.Scan(&c.ID, &c.TenantID, &c.Name, &c.Type, &c.Enabled, &c.Events, &c.Config, &c.CreatedAt, &c.UpdatedAt)
	return c, err
}

func scanConnectorRow(row scannable) (Connector, error) {
	var c Connector
	err := row.Scan(&c.ID, &c.TenantID, &c.Name, &c.Type, &c.Enabled, &c.Events, &c.Config, &c.CreatedAt, &c.UpdatedAt)
	return c, err
}
