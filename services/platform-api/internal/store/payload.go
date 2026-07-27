package store

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PayloadRecord struct {
	ID            int64     `json:"id"`
	Time          time.Time `json:"time"`
	DevEUI        string    `json:"devEui"`
	ApplicationID string    `json:"applicationId,omitempty"`
	GatewayID     string    `json:"gatewayId,omitempty"`
	ObjectKey     string    `json:"objectKey"`
	PayloadHex    string    `json:"payloadHex,omitempty"`
	PayloadSize   int       `json:"payloadSize"`
	FPort         *int      `json:"fPort,omitempty"`
	FCnt          *int64    `json:"fCnt,omitempty"`
}

type PayloadStore struct{ pool *pgxpool.Pool }

func NewPayloadStore(pool *pgxpool.Pool) *PayloadStore { return &PayloadStore{pool: pool} }

func (s *PayloadStore) ListByDevice(ctx context.Context, tenantID *uuid.UUID, devEUI string, limit int) ([]PayloadRecord, error) {
	if limit <= 0 {
		limit = 20
	}
	query := `
		SELECT id, time, dev_eui, COALESCE(application_id, ''), COALESCE(gateway_id, ''),
		       object_key, COALESCE(payload_hex, ''), payload_size, f_port, f_cnt
		FROM payload_archives
		WHERE dev_eui = $1`
	args := []any{devEUI}
	if tenantID != nil {
		query += ` AND tenant_id = $2`
		args = append(args, *tenantID)
	}
	query += ` ORDER BY time DESC LIMIT $` + limitArg(tenantID)
	args = append(args, limit)

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []PayloadRecord
	for rows.Next() {
		var p PayloadRecord
		if err := rows.Scan(&p.ID, &p.Time, &p.DevEUI, &p.ApplicationID, &p.GatewayID,
			&p.ObjectKey, &p.PayloadHex, &p.PayloadSize, &p.FPort, &p.FCnt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	if out == nil {
		out = []PayloadRecord{}
	}
	return out, rows.Err()
}

func (s *PayloadStore) GetObjectKey(ctx context.Context, id int64, tenantID *uuid.UUID) (string, error) {
	query := `SELECT object_key FROM payload_archives WHERE id = $1`
	args := []any{id}
	if tenantID != nil {
		query += ` AND tenant_id = $2`
		args = append(args, *tenantID)
	}
	var key string
	err := s.pool.QueryRow(ctx, query, args...).Scan(&key)
	return key, err
}

func limitArg(tenantID *uuid.UUID) string {
	if tenantID != nil {
		return "3"
	}
	return "2"
}
