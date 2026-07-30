package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"os"
	"time"
)

func mcpWorkerURL() string {
	if u := os.Getenv("CONNECTOR_MCP_URL"); u != "" {
		return u
	}
	return "http://connector-mcp-worker:8097"
}

func testMCPConnectorHTTP(ctx context.Context, tenantID string, raw json.RawMessage, payload map[string]any) connectorTestResult {
	body, _ := json.Marshal(map[string]any{
		"tenantId": tenantID,
		"config":   json.RawMessage(raw),
		"payload":  payload,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, mcpWorkerURL()+"/test", bytes.NewReader(body))
	if err != nil {
		return connectorTestResult{Success: false, Detail: err.Error()}
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return connectorTestResult{Success: false, Detail: err.Error()}
	}
	defer resp.Body.Close()
	var out struct {
		Success bool   `json:"success"`
		Detail  string `json:"detail"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return connectorTestResult{Success: false, Detail: "invalid mcp worker response"}
	}
	return connectorTestResult{Success: out.Success, Detail: out.Detail}
}
