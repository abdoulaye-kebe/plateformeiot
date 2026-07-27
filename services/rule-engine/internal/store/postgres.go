package store

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lorawan-platform/rule-engine/internal/actions"
	"github.com/lorawan-platform/rule-engine/internal/engine"
)

func NewPostgres(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	return pgxpool.New(ctx, dsn)
}

type RuleStore struct{ pool *pgxpool.Pool }

func NewRuleStore(pool *pgxpool.Pool) *RuleStore { return &RuleStore{pool: pool} }

func (s *RuleStore) ListEnabled(ctx context.Context, triggerType string, tenantID *uuid.UUID) ([]engine.Rule, error) {
	var rows pgx.Rows
	var err error

	if tenantID != nil {
		rows, err = s.pool.Query(ctx, `
			SELECT id, tenant_id, name, enabled, trigger_type, condition_json, actions_json
			FROM rules WHERE enabled = true AND trigger_type = $1 AND tenant_id = $2
		`, triggerType, *tenantID)
	} else {
		rows, err = s.pool.Query(ctx, `
			SELECT id, tenant_id, name, enabled, trigger_type, condition_json, actions_json
			FROM rules WHERE enabled = true AND trigger_type = $1 AND tenant_id IS NULL
		`, triggerType)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rules []engine.Rule
	for rows.Next() {
		var r engine.Rule
		if err := rows.Scan(&r.ID, &r.TenantID, &r.Name, &r.Enabled, &r.TriggerType, &r.ConditionJSON, &r.ActionsJSON); err != nil {
			return nil, err
		}
		rules = append(rules, r)
	}
	return rules, rows.Err()
}

type ExecutionStore struct{ pool *pgxpool.Pool }

func NewExecutionStore(pool *pgxpool.Pool) *ExecutionStore { return &ExecutionStore{pool: pool} }

func (s *ExecutionStore) Insert(ctx context.Context, ruleID uuid.UUID, tenantID *uuid.UUID, event any, results []actions.Result) error {
	eventJSON, _ := json.Marshal(event)
	resultsJSON, _ := json.Marshal(results)
	_, err := s.pool.Exec(ctx, `
		INSERT INTO rule_executions (rule_id, tenant_id, event_json, action_results)
		VALUES ($1, $2, $3, $4)
	`, ruleID, tenantID, eventJSON, resultsJSON)
	return err
}
