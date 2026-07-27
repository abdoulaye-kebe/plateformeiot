package detector

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Detector struct {
	pool   *pgxpool.Pool
	logger *slog.Logger
}

func New(pool *pgxpool.Pool, logger *slog.Logger) *Detector {
	return &Detector{pool: pool, logger: logger}
}

func (d *Detector) Run(ctx context.Context) error {
	var total int64
	for _, fn := range []func(context.Context) (int64, error){
		d.detectSilentDevices,
		d.detectWeakSignal,
		d.detectTrafficSpikes,
		d.detectLowSNR,
	} {
		n, err := fn(ctx)
		if err != nil {
			return err
		}
		total += n
	}
	if total > 0 {
		d.logger.Info("anomalies detected", "count", total)
	}
	return nil
}

func (d *Detector) detectSilentDevices(ctx context.Context) (int64, error) {
	tag, err := d.pool.Exec(ctx, `
		INSERT INTO anomaly_events (tenant_id, anomaly_type, severity, dev_eui, title, details)
		SELECT DISTINCT u.tenant_id, 'silent_device', 'warning', u.dev_eui,
		       'Device silencieux (>24h)',
		       jsonb_build_object('last_seen', max(u.time), 'hours_silent', 24)
		FROM uplink_frames u
		WHERE u.tenant_id IS NOT NULL
		  AND u.time >= NOW() - interval '7 days'
		  AND u.time < NOW() - interval '24 hours'
		GROUP BY u.tenant_id, u.dev_eui
		HAVING NOT EXISTS (
			SELECT 1 FROM uplink_frames u2
			WHERE u2.dev_eui = u.dev_eui AND u2.time >= NOW() - interval '24 hours'
		)
		AND NOT EXISTS (
			SELECT 1 FROM anomaly_events ae
			WHERE ae.dev_eui = u.dev_eui
			  AND ae.anomaly_type = 'silent_device'
			  AND ae.resolved_at IS NULL
			  AND ae.detected_at >= NOW() - interval '6 hours'
		)
	`)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func (d *Detector) detectWeakSignal(ctx context.Context) (int64, error) {
	tag, err := d.pool.Exec(ctx, `
		INSERT INTO anomaly_events (tenant_id, anomaly_type, severity, dev_eui, title, details)
		SELECT u.tenant_id, 'weak_signal', 'warning', u.dev_eui,
		       'Signal RSSI faible',
		       jsonb_build_object('avg_rssi', round(avg(u.rssi)::numeric, 1), 'threshold', -115)
		FROM uplink_frames u
		WHERE u.tenant_id IS NOT NULL
		  AND u.time >= NOW() - interval '1 hour'
		GROUP BY u.tenant_id, u.dev_eui
		HAVING avg(u.rssi) < -115 AND count(*) >= 3
		AND NOT EXISTS (
			SELECT 1 FROM anomaly_events ae
			WHERE ae.dev_eui = u.dev_eui
			  AND ae.anomaly_type = 'weak_signal'
			  AND ae.resolved_at IS NULL
			  AND ae.detected_at >= NOW() - interval '6 hours'
		)
	`)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func (d *Detector) detectLowSNR(ctx context.Context) (int64, error) {
	tag, err := d.pool.Exec(ctx, `
		INSERT INTO anomaly_events (tenant_id, anomaly_type, severity, dev_eui, title, details)
		SELECT u.tenant_id, 'low_snr', 'info', u.dev_eui,
		       'SNR dégradé',
		       jsonb_build_object('avg_snr', round(avg(u.snr)::numeric, 1), 'threshold', -10)
		FROM uplink_frames u
		WHERE u.tenant_id IS NOT NULL
		  AND u.time >= NOW() - interval '1 hour'
		GROUP BY u.tenant_id, u.dev_eui
		HAVING avg(u.snr) < -10 AND count(*) >= 3
		AND NOT EXISTS (
			SELECT 1 FROM anomaly_events ae
			WHERE ae.dev_eui = u.dev_eui
			  AND ae.anomaly_type = 'low_snr'
			  AND ae.resolved_at IS NULL
			  AND ae.detected_at >= NOW() - interval '6 hours'
		)
	`)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func (d *Detector) detectTrafficSpikes(ctx context.Context) (int64, error) {
	rows, err := d.pool.Query(ctx, `
		WITH hourly AS (
			SELECT tenant_id,
			       time_bucket('1 hour', time) AS bucket,
			       count(*)::bigint AS cnt
			FROM uplink_frames
			WHERE tenant_id IS NOT NULL AND time >= NOW() - interval '25 hours'
			GROUP BY tenant_id, bucket
		),
		current_hour AS (
			SELECT tenant_id, cnt FROM hourly
			WHERE bucket = date_trunc('hour', NOW())
		),
		baseline AS (
			SELECT tenant_id, avg(cnt)::float AS avg_cnt
			FROM hourly
			WHERE bucket < date_trunc('hour', NOW())
			GROUP BY tenant_id
		)
		SELECT c.tenant_id, c.cnt, b.avg_cnt
		FROM current_hour c
		JOIN baseline b ON b.tenant_id = c.tenant_id
		WHERE b.avg_cnt > 0 AND c.cnt > b.avg_cnt * 3 AND c.cnt >= 10
	`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	var inserted int64
	for rows.Next() {
		var tenantID uuid.UUID
		var current int64
		var baseline float64
		if err := rows.Scan(&tenantID, &current, &baseline); err != nil {
			return inserted, err
		}
		details, _ := json.Marshal(map[string]any{
			"current_hour_uplinks": current,
			"baseline_avg":         baseline,
			"multiplier":           3,
		})
		n, err := d.pool.Exec(ctx, `
			INSERT INTO anomaly_events (tenant_id, anomaly_type, severity, title, details)
			SELECT $1, 'traffic_spike', 'critical', 'Pic de trafic anormal', $2::jsonb
			WHERE NOT EXISTS (
				SELECT 1 FROM anomaly_events ae
				WHERE ae.tenant_id = $1
				  AND ae.anomaly_type = 'traffic_spike'
				  AND ae.resolved_at IS NULL
				  AND ae.detected_at >= NOW() - interval '6 hours'
			)
		`, tenantID, string(details))
		if err != nil {
			return inserted, fmt.Errorf("insert traffic spike: %w", err)
		}
		inserted += n.RowsAffected()
	}
	return inserted, rows.Err()
}
