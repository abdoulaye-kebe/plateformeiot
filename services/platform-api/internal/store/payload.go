package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PayloadRecord struct {
	ID            int64          `json:"id"`
	Time          time.Time      `json:"time"`
	DevEUI        string         `json:"devEui"`
	ApplicationID string         `json:"applicationId,omitempty"`
	GatewayID     string         `json:"gatewayId,omitempty"`
	ObjectKey     string         `json:"objectKey"`
	PayloadHex    string         `json:"payloadHex,omitempty"`
	PayloadSize   int            `json:"payloadSize"`
	FPort         *int           `json:"fPort,omitempty"`
	FCnt          *int64         `json:"fCnt,omitempty"`
	DecodedJSON   []byte         `json:"-"`
}

type PayloadStore struct{ pool *pgxpool.Pool }

func NewPayloadStore(pool *pgxpool.Pool) *PayloadStore { return &PayloadStore{pool: pool} }

func (s *PayloadStore) ListByDevice(ctx context.Context, tenantID *uuid.UUID, devEUI string, limit int) ([]PayloadRecord, error) {
	if limit <= 0 {
		limit = 20
	}
	query := `
		SELECT id, time, dev_eui, COALESCE(application_id, ''), COALESCE(gateway_id, ''),
		       object_key, COALESCE(payload_hex, ''), payload_size, f_port, f_cnt, decoded_json
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
			&p.ObjectKey, &p.PayloadHex, &p.PayloadSize, &p.FPort, &p.FCnt, &p.DecodedJSON); err != nil {
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

type MessageFilter struct {
	From          *time.Time
	To            *time.Time
	DevEUI        string
	ApplicationID string
	FPort         *int
	Search        string
	Limit         int
}

func (s *PayloadStore) ListMessages(ctx context.Context, tenantID *uuid.UUID, f MessageFilter) ([]PayloadRecord, error) {
	limit := f.Limit
	if limit <= 0 {
		limit = 50
	}
	if limit > 500 {
		limit = 500
	}

	query := `
		SELECT id, time, dev_eui, COALESCE(application_id, ''), COALESCE(gateway_id, ''),
		       object_key, COALESCE(payload_hex, ''), payload_size, f_port, f_cnt, decoded_json
		FROM payload_archives
		WHERE 1=1`
	args := []any{}
	n := 1

	if tenantID != nil {
		query += fmt.Sprintf(` AND tenant_id = $%d`, n)
		args = append(args, *tenantID)
		n++
	}
	if f.From != nil {
		query += fmt.Sprintf(` AND time >= $%d`, n)
		args = append(args, *f.From)
		n++
	}
	if f.To != nil {
		query += fmt.Sprintf(` AND time <= $%d`, n)
		args = append(args, *f.To)
		n++
	}
	if f.DevEUI != "" {
		query += fmt.Sprintf(` AND dev_eui = $%d`, n)
		args = append(args, strings.ToLower(f.DevEUI))
		n++
	}
	if f.ApplicationID != "" {
		query += fmt.Sprintf(` AND application_id = $%d`, n)
		args = append(args, f.ApplicationID)
		n++
	}
	if f.FPort != nil {
		query += fmt.Sprintf(` AND f_port = $%d`, n)
		args = append(args, *f.FPort)
		n++
	}
	if f.Search != "" {
		query += fmt.Sprintf(` AND (dev_eui ILIKE $%d OR COALESCE(application_id, '') ILIKE $%d OR COALESCE(gateway_id, '') ILIKE $%d)`, n, n, n)
		args = append(args, "%"+f.Search+"%")
		n++
	}

	query += fmt.Sprintf(` ORDER BY time DESC LIMIT $%d`, n)
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
			&p.ObjectKey, &p.PayloadHex, &p.PayloadSize, &p.FPort, &p.FCnt, &p.DecodedJSON); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	if out == nil {
		out = []PayloadRecord{}
	}
	return out, rows.Err()
}

func (s *PayloadStore) CountMessages(ctx context.Context, tenantID *uuid.UUID, f MessageFilter) (int64, error) {
	query := `SELECT count(*)::bigint FROM payload_archives WHERE 1=1`
	args := []any{}
	n := 1

	if tenantID != nil {
		query += fmt.Sprintf(` AND tenant_id = $%d`, n)
		args = append(args, *tenantID)
		n++
	}
	if f.From != nil {
		query += fmt.Sprintf(` AND time >= $%d`, n)
		args = append(args, *f.From)
		n++
	}
	if f.To != nil {
		query += fmt.Sprintf(` AND time <= $%d`, n)
		args = append(args, *f.To)
		n++
	}
	if f.DevEUI != "" {
		query += fmt.Sprintf(` AND dev_eui = $%d`, n)
		args = append(args, strings.ToLower(f.DevEUI))
		n++
	}
	if f.ApplicationID != "" {
		query += fmt.Sprintf(` AND application_id = $%d`, n)
		args = append(args, f.ApplicationID)
		n++
	}
	if f.Search != "" {
		query += fmt.Sprintf(` AND (dev_eui ILIKE $%d OR COALESCE(application_id, '') ILIKE $%d)`, n, n)
		args = append(args, "%"+f.Search+"%")
	}

	var count int64
	err := s.pool.QueryRow(ctx, query, args...).Scan(&count)
	return count, err
}
