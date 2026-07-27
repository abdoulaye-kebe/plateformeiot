package engine

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/lorawan-platform/rule-engine/internal/actions"
)

type UplinkEvent struct {
	Time          time.Time `json:"time"`
	TenantID      string    `json:"tenantId,omitempty"`
	DevEUI        string    `json:"devEui"`
	ApplicationID string    `json:"applicationId"`
	GatewayID     string    `json:"gatewayId"`
	RSSI          int       `json:"rssi"`
	SNR           float64   `json:"snr"`
	DR            int       `json:"dr"`
	FPort         int       `json:"fPort"`
}

type Rule struct {
	ID            uuid.UUID
	TenantID      *uuid.UUID
	Name          string
	Enabled       bool
	TriggerType   string
	ConditionJSON json.RawMessage
	ActionsJSON   json.RawMessage
}

type RuleReader interface {
	ListEnabled(ctx context.Context, triggerType string, tenantID *uuid.UUID) ([]Rule, error)
}

type ExecutionWriter interface {
	Insert(ctx context.Context, ruleID uuid.UUID, tenantID *uuid.UUID, event any, results []actions.Result) error
}

type Engine struct {
	rules   RuleReader
	execs   ExecutionWriter
	actions *actions.Executor
	logger  *slog.Logger
}

func New(rules RuleReader, execs ExecutionWriter, exec *actions.Executor, logger *slog.Logger) *Engine {
	return &Engine{rules: rules, execs: execs, actions: exec, logger: logger}
}

func (e *Engine) ProcessUplink(ctx context.Context, event UplinkEvent) error {
	var tenantID *uuid.UUID
	if event.TenantID != "" {
		if parsed, err := uuid.Parse(event.TenantID); err == nil {
			tenantID = &parsed
		}
	}

	rules, err := e.rules.ListEnabled(ctx, "uplink", tenantID)
	if err != nil {
		return err
	}

	eventMap := map[string]any{
		"dev_eui":        event.DevEUI,
		"application_id": event.ApplicationID,
		"gateway_id":     event.GatewayID,
		"rssi":           event.RSSI,
		"snr":            event.SNR,
		"dr":             event.DR,
		"f_port":         event.FPort,
	}
	if tenantID != nil {
		eventMap["tenant_id"] = tenantID.String()
	}

	for _, rule := range rules {
		if !matchCondition(rule.ConditionJSON, eventMap) {
			continue
		}
		results := e.actions.Run(ctx, rule.ActionsJSON, eventMap)
		if err := e.execs.Insert(ctx, rule.ID, tenantID, eventMap, results); err != nil {
			e.logger.Error("execution log failed", "rule", rule.Name, "error", err)
		}
		e.logger.Info("rule matched", "rule", rule.Name, "devEui", event.DevEUI, "tenantId", tenantID)
	}
	return nil
}

type condition struct {
	Field string  `json:"field"`
	Op    string  `json:"op"`
	Value float64 `json:"value"`
}

func matchCondition(raw json.RawMessage, event map[string]any) bool {
	var c condition
	if err := json.Unmarshal(raw, &c); err != nil || c.Field == "" {
		return false
	}
	val, ok := event[c.Field]
	if !ok {
		return false
	}
	var num float64
	switch v := val.(type) {
	case int:
		num = float64(v)
	case int64:
		num = float64(v)
	case float64:
		num = v
	default:
		return false
	}
	switch c.Op {
	case "lt":
		return num < c.Value
	case "lte":
		return num <= c.Value
	case "gt":
		return num > c.Value
	case "gte":
		return num >= c.Value
	case "eq":
		return num == c.Value
	default:
		return false
	}
}
