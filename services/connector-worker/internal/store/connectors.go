package store

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Connector struct {
	ID       uuid.UUID
	TenantID uuid.UUID
	Name     string
	Type     string
	Enabled  bool
	Events   []string
	Config   json.RawMessage
}

type ConnectorStore struct {
	pool *pgxpool.Pool
}

func NewConnectorStore(pool *pgxpool.Pool) *ConnectorStore {
	return &ConnectorStore{pool: pool}
}

func (s *ConnectorStore) ListEnabledForEvent(ctx context.Context, tenantID uuid.UUID, event string) ([]Connector, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, tenant_id, name, type, enabled, events, config
		FROM tenant_connectors
		WHERE tenant_id = $1 AND enabled = true AND $2 = ANY(events)
	`, tenantID, event)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []Connector
	for rows.Next() {
		var c Connector
		if err := rows.Scan(&c.ID, &c.TenantID, &c.Name, &c.Type, &c.Enabled, &c.Events, &c.Config); err != nil {
			return nil, err
		}
		list = append(list, c)
	}
	return list, rows.Err()
}

func NewPostgres(ctx context.Context, url string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, err
	}
	cfg.MaxConnIdleTime = 5 * time.Minute
	return pgxpool.NewWithConfig(ctx, cfg)
}
