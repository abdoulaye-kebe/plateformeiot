package store

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AlertEvent struct {
	ID         int64           `json:"id"`
	RuleID     string          `json:"ruleId"`
	RuleName   string          `json:"ruleName"`
	MatchedAt  time.Time       `json:"matchedAt"`
	EventJSON  json.RawMessage `json:"event"`
	ActionJSON json.RawMessage `json:"actions"`
}

type NOCStore struct{ pool *pgxpool.Pool }

func NewNOCStore(pool *pgxpool.Pool) *NOCStore { return &NOCStore{pool: pool} }

func (s *NOCStore) RecentAlerts(ctx context.Context, tenantID *uuid.UUID, limit int) ([]AlertEvent, error) {
	var rows pgx.Rows
	var err error

	if tenantID != nil {
		rows, err = s.pool.Query(ctx, `
			SELECT re.id, re.rule_id, COALESCE(r.name, ''), re.matched_at, re.event_json, re.action_results
			FROM rule_executions re
			LEFT JOIN rules r ON r.id = re.rule_id
			WHERE COALESCE(re.tenant_id, r.tenant_id) = $1
			ORDER BY re.matched_at DESC
			LIMIT $2
		`, *tenantID, limit)
	} else {
		rows, err = s.pool.Query(ctx, `
			SELECT re.id, re.rule_id, COALESCE(r.name, ''), re.matched_at, re.event_json, re.action_results
			FROM rule_executions re
			LEFT JOIN rules r ON r.id = re.rule_id
			ORDER BY re.matched_at DESC
			LIMIT $1
		`, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var alerts []AlertEvent
	for rows.Next() {
		var a AlertEvent
		if err := rows.Scan(&a.ID, &a.RuleID, &a.RuleName, &a.MatchedAt, &a.EventJSON, &a.ActionJSON); err != nil {
			return nil, err
		}
		alerts = append(alerts, a)
	}
	if alerts == nil {
		alerts = []AlertEvent{}
	}
	return alerts, rows.Err()
}

type BillingUsage struct {
	Period         string `json:"period"`
	UplinkCount    int64  `json:"uplinkCount"`
	ActiveDevices  int64  `json:"activeDevices"`
	ActiveGateways int64  `json:"activeGateways"`
	EstimatedEUR   string `json:"estimatedEur"`
}

type BillingStore struct{ pool *pgxpool.Pool }

func NewBillingStore(pool *pgxpool.Pool) *BillingStore { return &BillingStore{pool: pool} }

func (s *BillingStore) CurrentMonthUsage(ctx context.Context, tenantID *uuid.UUID) (*BillingUsage, error) {
	query := `
		SELECT count(*)::bigint,
		       count(DISTINCT dev_eui)::bigint,
		       count(DISTINCT gateway_id)::bigint
		FROM uplink_frames
		WHERE time >= date_trunc('month', NOW())`
	args := []any{}
	if tenantID != nil {
		query += ` AND tenant_id = $1`
		args = append(args, *tenantID)
	}

	var usage BillingUsage
	usage.Period = time.Now().UTC().Format("2006-01")
	err := s.pool.QueryRow(ctx, query, args...).Scan(&usage.UplinkCount, &usage.ActiveDevices, &usage.ActiveGateways)
	if err != nil {
		return nil, err
	}
	eur := float64(usage.UplinkCount) / 1000.0 * 0.01
	usage.EstimatedEUR = fmt.Sprintf("%.2f", eur)
	return &usage, nil
}

type DailyUsage struct {
	Day           string `json:"day"`
	UplinkCount   int64  `json:"uplinkCount"`
	DeviceCount   int64  `json:"deviceCount"`
	GatewayCount  int64  `json:"gatewayCount"`
}

func (s *BillingStore) DailyHistory(ctx context.Context, tenantID *uuid.UUID, days int) ([]DailyUsage, error) {
	if days <= 0 {
		days = 30
	}
	query := `
		SELECT day::text, uplink_count, device_count, gateway_count
		FROM billing_usage_daily
		WHERE day >= CURRENT_DATE - $1::int`
	args := []any{days}
	if tenantID != nil {
		query += ` AND tenant_id = $2`
		args = append(args, *tenantID)
	}
	query += ` ORDER BY day DESC`

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []DailyUsage
	for rows.Next() {
		var d DailyUsage
		if err := rows.Scan(&d.Day, &d.UplinkCount, &d.DeviceCount, &d.GatewayCount); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	if out == nil {
		out = []DailyUsage{}
	}
	return out, rows.Err()
}

func (s *BillingStore) AggregateYesterday(ctx context.Context) (int64, error) {
	tag, err := s.pool.Exec(ctx, `
		INSERT INTO billing_usage_daily (day, tenant_id, uplink_count, device_count, gateway_count)
		SELECT date_trunc('day', time)::date AS day,
		       tenant_id,
		       count(*)::bigint,
		       count(DISTINCT dev_eui)::bigint,
		       count(DISTINCT gateway_id)::bigint
		FROM uplink_frames
		WHERE tenant_id IS NOT NULL
		  AND time >= date_trunc('day', NOW() - interval '1 day')
		  AND time < date_trunc('day', NOW())
		GROUP BY 1, 2
		ON CONFLICT (day, tenant_id) DO UPDATE SET
			uplink_count = EXCLUDED.uplink_count,
			device_count = EXCLUDED.device_count,
			gateway_count = EXCLUDED.gateway_count
	`)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}
