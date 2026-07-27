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

var ErrAnomalyNotFound = errors.New("anomaly not found")

type AnomalyEvent struct {
	ID          uuid.UUID       `json:"id"`
	TenantID    *uuid.UUID      `json:"tenantId,omitempty"`
	AnomalyType string          `json:"anomalyType"`
	Severity    string          `json:"severity"`
	DevEUI      string          `json:"devEui,omitempty"`
	GatewayID   string          `json:"gatewayId,omitempty"`
	Title       string          `json:"title"`
	Details     json.RawMessage `json:"details"`
	DetectedAt  time.Time       `json:"detectedAt"`
	ResolvedAt  *time.Time      `json:"resolvedAt,omitempty"`
}

type AnomalyStore struct{ pool *pgxpool.Pool }

func NewAnomalyStore(pool *pgxpool.Pool) *AnomalyStore { return &AnomalyStore{pool: pool} }

func (s *AnomalyStore) List(ctx context.Context, tenantID *uuid.UUID, openOnly bool, limit int) ([]AnomalyEvent, error) {
	if limit <= 0 {
		limit = 50
	}
	query := `
		SELECT id, tenant_id, anomaly_type, severity, COALESCE(dev_eui, ''), COALESCE(gateway_id, ''),
		       title, details, detected_at, resolved_at
		FROM anomaly_events WHERE 1=1`
	args := []any{}
	argN := 1
	if tenantID != nil {
		query += ` AND tenant_id = $` + itoa(argN)
		args = append(args, *tenantID)
		argN++
	}
	if openOnly {
		query += ` AND resolved_at IS NULL`
	}
	query += ` ORDER BY detected_at DESC LIMIT $` + itoa(argN)
	args = append(args, limit)

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []AnomalyEvent
	for rows.Next() {
		var a AnomalyEvent
		if err := rows.Scan(&a.ID, &a.TenantID, &a.AnomalyType, &a.Severity, &a.DevEUI, &a.GatewayID,
			&a.Title, &a.Details, &a.DetectedAt, &a.ResolvedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	if out == nil {
		out = []AnomalyEvent{}
	}
	return out, rows.Err()
}

func (s *AnomalyStore) Resolve(ctx context.Context, id uuid.UUID, tenantID *uuid.UUID) error {
	query := `UPDATE anomaly_events SET resolved_at = NOW() WHERE id = $1 AND resolved_at IS NULL`
	args := []any{id}
	if tenantID != nil {
		query += ` AND tenant_id = $2`
		args = append(args, *tenantID)
	}
	tag, err := s.pool.Exec(ctx, query, args...)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrAnomalyNotFound
	}
	return nil
}

func itoa(n int) string {
	if n == 1 {
		return "1"
	}
	if n == 2 {
		return "2"
	}
	return "3"
}

type AnomalySummary struct {
	OpenCount    int64            `json:"openCount"`
	BySeverity   map[string]int64 `json:"bySeverity"`
	ByType       map[string]int64 `json:"byType"`
}

func (s *AnomalyStore) Summary(ctx context.Context, tenantID *uuid.UUID) (*AnomalySummary, error) {
	query := `
		SELECT severity, anomaly_type, count(*)::bigint
		FROM anomaly_events
		WHERE resolved_at IS NULL`
	args := []any{}
	if tenantID != nil {
		query += ` AND tenant_id = $1`
		args = append(args, *tenantID)
	}
	query += ` GROUP BY severity, anomaly_type`

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	summary := &AnomalySummary{
		BySeverity: map[string]int64{},
		ByType:     map[string]int64{},
	}
	for rows.Next() {
		var severity, anomalyType string
		var count int64
		if err := rows.Scan(&severity, &anomalyType, &count); err != nil {
			return nil, err
		}
		summary.OpenCount += count
		summary.BySeverity[severity] += count
		summary.ByType[anomalyType] += count
	}
	return summary, rows.Err()
}

func (s *AnomalyStore) Get(ctx context.Context, id uuid.UUID, tenantID *uuid.UUID) (*AnomalyEvent, error) {
	query := `
		SELECT id, tenant_id, anomaly_type, severity, COALESCE(dev_eui, ''), COALESCE(gateway_id, ''),
		       title, details, detected_at, resolved_at
		FROM anomaly_events WHERE id = $1`
	args := []any{id}
	if tenantID != nil {
		query += ` AND tenant_id = $2`
		args = append(args, *tenantID)
	}
	var a AnomalyEvent
	err := s.pool.QueryRow(ctx, query, args...).Scan(
		&a.ID, &a.TenantID, &a.AnomalyType, &a.Severity, &a.DevEUI, &a.GatewayID,
		&a.Title, &a.Details, &a.DetectedAt, &a.ResolvedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrAnomalyNotFound
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}
