package actions

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"
)

type Result struct {
	Type    string `json:"type"`
	Success bool   `json:"success"`
	Detail  string `json:"detail,omitempty"`
}

type Executor struct {
	logger *slog.Logger
	client *http.Client
}

func NewExecutor(logger *slog.Logger) *Executor {
	return &Executor{
		logger: logger,
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

type actionDef struct {
	Type    string `json:"type"`
	URL     string `json:"url"`
	Message string `json:"message"`
}

func (e *Executor) Run(ctx context.Context, raw json.RawMessage, event map[string]any) []Result {
	var defs []actionDef
	if err := json.Unmarshal(raw, &defs); err != nil {
		return []Result{{Type: "parse", Success: false, Detail: err.Error()}}
	}

	var results []Result
	for _, def := range defs {
		switch def.Type {
		case "log":
			msg := def.Message
			if msg == "" {
				msg = "rule triggered"
			}
			e.logger.Warn("rule action", "message", msg, "event", event)
			results = append(results, Result{Type: "log", Success: true, Detail: msg})
		case "webhook":
			res := e.webhook(ctx, def.URL, event)
			results = append(results, res)
		default:
			results = append(results, Result{Type: def.Type, Success: false, Detail: "unknown action"})
		}
	}
	return results
}

func (e *Executor) webhook(ctx context.Context, url string, event map[string]any) Result {
	if url == "" {
		return Result{Type: "webhook", Success: false, Detail: "missing url"}
	}
	body, _ := json.Marshal(event)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return Result{Type: "webhook", Success: false, Detail: err.Error()}
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := e.client.Do(req)
	if err != nil {
		return Result{Type: "webhook", Success: false, Detail: err.Error()}
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return Result{Type: "webhook", Success: false, Detail: resp.Status}
	}
	return Result{Type: "webhook", Success: true, Detail: resp.Status}
}
