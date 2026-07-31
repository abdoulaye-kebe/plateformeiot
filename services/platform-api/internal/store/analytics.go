package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AnalyticsStore struct{ pool *pgxpool.Pool }

func NewAnalyticsStore(pool *pgxpool.Pool) *AnalyticsStore {
	return &AnalyticsStore{pool: pool}
}

type TrafficPoint struct {
	Bucket      time.Time `json:"bucket"`
	UplinkCount int64     `json:"uplinkCount"`
	AvgRSSI     *float64  `json:"avgRssi,omitempty"`
	AvgSNR      *float64  `json:"avgSnr,omitempty"`
	DeviceCount int64     `json:"deviceCount"`
}

func (s *AnalyticsStore) TrafficHourly(ctx context.Context, tenantID *uuid.UUID, hours int) ([]TrafficPoint, error) {
	query := `
		SELECT time_bucket('1 hour', time) AS bucket,
		       count(*)::bigint,
		       avg(rssi)::float,
		       avg(snr)::float,
		       count(DISTINCT dev_eui)::bigint
		FROM uplink_frames
		WHERE time > NOW() - ($1::int * interval '1 hour')`
	args := []any{hours}
	if tenantID != nil {
		query += ` AND tenant_id = $2`
		args = append(args, *tenantID)
	}
	query += ` GROUP BY bucket ORDER BY bucket`

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var points []TrafficPoint
	for rows.Next() {
		var p TrafficPoint
		if err := rows.Scan(&p.Bucket, &p.UplinkCount, &p.AvgRSSI, &p.AvgSNR, &p.DeviceCount); err != nil {
			return nil, err
		}
		points = append(points, p)
	}
	return points, rows.Err()
}

func (s *AnalyticsStore) TrafficHourlyForDevices(ctx context.Context, tenantID *uuid.UUID, devEUIs []string, hours int) ([]TrafficPoint, error) {
	if len(devEUIs) == 0 {
		return []TrafficPoint{}, nil
	}
	query := `
		SELECT time_bucket('1 hour', time) AS bucket,
		       count(*)::bigint,
		       avg(rssi)::float,
		       avg(snr)::float,
		       count(DISTINCT dev_eui)::bigint
		FROM uplink_frames
		WHERE time > NOW() - ($1::int * interval '1 hour')
		  AND dev_eui = ANY($2)`
	args := []any{hours, devEUIs}
	if tenantID != nil {
		query += ` AND tenant_id = $3`
		args = append(args, *tenantID)
	}
	query += ` GROUP BY bucket ORDER BY bucket`

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var points []TrafficPoint
	for rows.Next() {
		var p TrafficPoint
		if err := rows.Scan(&p.Bucket, &p.UplinkCount, &p.AvgRSSI, &p.AvgSNR, &p.DeviceCount); err != nil {
			return nil, err
		}
		points = append(points, p)
	}
	if points == nil {
		points = []TrafficPoint{}
	}
	return points, rows.Err()
}

type DeviceRadioSummary struct {
	DevEUI      string   `json:"devEui"`
	UplinkCount int64    `json:"uplinkCount"`
	AvgRSSI     *float64 `json:"avgRssi,omitempty"`
	AvgSNR      *float64 `json:"avgSnr,omitempty"`
	LastDR      *int     `json:"lastDr,omitempty"`
}

func (s *AnalyticsStore) DeviceRadio(ctx context.Context, tenantID *uuid.UUID, devEUI string, hours int) (*DeviceRadioSummary, error) {
	var summary DeviceRadioSummary
	summary.DevEUI = devEUI

	tenantFilter := ""
	args := []any{devEUI, hours}
	if tenantID != nil {
		tenantFilter = " AND tenant_id = $3"
		args = append(args, *tenantID)
	}

	err := s.pool.QueryRow(ctx, fmt.Sprintf(`
		SELECT count(*)::bigint, avg(rssi)::float, avg(snr)::float,
		       (SELECT dr FROM uplink_frames WHERE dev_eui = $1%s ORDER BY time DESC LIMIT 1)
		FROM uplink_frames
		WHERE dev_eui = $1 AND time > NOW() - ($2::int * interval '1 hour')%s
	`, tenantFilter, tenantFilter), args...).Scan(&summary.UplinkCount, &summary.AvgRSSI, &summary.AvgSNR, &summary.LastDR)
	if err != nil {
		return nil, err
	}
	return &summary, nil
}

type OverviewStats struct {
	TotalUplinks24h   int64    `json:"totalUplinks24h"`
	ActiveDevices24h  int64    `json:"activeDevices24h"`
	ActiveGateways24h int64    `json:"activeGateways24h"`
	AvgRSSI24h        *float64 `json:"avgRssi24h,omitempty"`
}

func (s *AnalyticsStore) Overview(ctx context.Context, tenantID *uuid.UUID) (*OverviewStats, error) {
	query := `
		SELECT count(*)::bigint,
		       count(DISTINCT dev_eui)::bigint,
		       count(DISTINCT gateway_id)::bigint,
		       avg(rssi)::float
		FROM uplink_frames WHERE time > NOW() - interval '24 hours'`
	args := []any{}
	if tenantID != nil {
		query += ` AND tenant_id = $1`
		args = append(args, *tenantID)
	}

	var o OverviewStats
	err := s.pool.QueryRow(ctx, query, args...).Scan(
		&o.TotalUplinks24h, &o.ActiveDevices24h, &o.ActiveGateways24h, &o.AvgRSSI24h,
	)
	return &o, err
}

type DeviceLastSeen struct {
	DevEUI        string    `json:"devEui"`
	LastSeen      time.Time `json:"lastSeen"`
	UplinkCount24 int64     `json:"uplinkCount24h"`
}

func (s *AnalyticsStore) DeviceLastSeenMap(ctx context.Context, tenantID *uuid.UUID) (map[string]DeviceLastSeen, error) {
	query := `
		SELECT dev_eui, max(time) AS last_seen,
		       count(*) FILTER (WHERE time > NOW() - interval '24 hours')::bigint
		FROM uplink_frames
		WHERE 1=1`
	args := []any{}
	if tenantID != nil {
		query += ` AND tenant_id = $1`
		args = append(args, *tenantID)
	}
	query += ` GROUP BY dev_eui`

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string]DeviceLastSeen{}
	for rows.Next() {
		var d DeviceLastSeen
		if err := rows.Scan(&d.DevEUI, &d.LastSeen, &d.UplinkCount24); err != nil {
			return nil, err
		}
		out[strings.ToLower(d.DevEUI)] = d
	}
	return out, rows.Err()
}
