package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/lorawan-platform/platform-api/internal/store"
)

type connectorRequest struct {
	Name    string          `json:"name"`
	Type    string          `json:"type"`
	Enabled *bool           `json:"enabled"`
	Events  []string        `json:"events"`
	Config  json.RawMessage `json:"config"`
}

func maskConnectorConfig(typ string, raw json.RawMessage) json.RawMessage {
	var cfg map[string]any
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return raw
	}
	if typ == "mqtt" {
		if _, ok := cfg["password"]; ok {
			cfg["password"] = "••••••"
		}
	}
	if typ == "http" {
		if headers, ok := cfg["headers"].(map[string]any); ok {
			for k := range headers {
				if strings.Contains(strings.ToLower(k), "auth") || strings.Contains(strings.ToLower(k), "token") {
					headers[k] = "••••••"
				}
			}
			cfg["headers"] = headers
		}
	}
	out, _ := json.Marshal(cfg)
	return out
}

func maskConnector(c store.Connector) store.Connector {
	c.Config = maskConnectorConfig(c.Type, c.Config)
	return c
}

func (d Deps) listConnectors(w http.ResponseWriter, r *http.Request) {
	if !d.withFeatureOrAdmin(w, r, "integrations") {
		return
	}
	scope, ok := d.dataTenantScope(w, r)
	if !ok || scope == nil {
		return
	}
	if d.Connectors == nil {
		writeJSON(w, http.StatusOK, map[string]any{"result": []any{}})
		return
	}
	list, err := d.Connectors.ListByTenant(r.Context(), *scope)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	masked := make([]store.Connector, len(list))
	for i, c := range list {
		masked[i] = maskConnector(c)
	}
	writeJSON(w, http.StatusOK, map[string]any{"result": masked})
}

func (d Deps) createConnector(w http.ResponseWriter, r *http.Request) {
	if !d.withFeatureOrAdmin(w, r, "integrations") {
		return
	}
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	scope, ok := d.dataTenantScope(w, r)
	if !ok || scope == nil {
		return
	}
	var req connectorRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name required")
		return
	}
	if req.Type == "" {
		writeError(w, http.StatusBadRequest, "type required")
		return
	}
	if err := validateConnectorRequest(req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	c, err := d.Connectors.Create(r.Context(), *scope, req.Name, req.Type, enabled, req.Events, req.Config)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, maskConnector(c))
}

func (d Deps) updateConnector(w http.ResponseWriter, r *http.Request) {
	if !d.withFeatureOrAdmin(w, r, "integrations") {
		return
	}
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	scope, ok := d.dataTenantScope(w, r)
	if !ok || scope == nil {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid connector id")
		return
	}
	existing, err := d.Connectors.Get(r.Context(), id, *scope)
	if err != nil {
		if errors.Is(err, store.ErrConnectorNotFound) {
			writeError(w, http.StatusNotFound, "connector not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	var req connectorRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if err := validateConnectorRequest(req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	config := req.Config
	if len(config) == 0 {
		config = existing.Config
	} else {
		config = mergeConnectorSecrets(existing.Type, existing.Config, config)
	}
	enabled := existing.Enabled
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	name := req.Name
	if name == "" {
		name = existing.Name
	}
	typ := req.Type
	if typ == "" {
		typ = existing.Type
	}
	events := req.Events
	if len(events) == 0 {
		events = existing.Events
	}
	c, err := d.Connectors.Update(r.Context(), id, *scope, name, typ, enabled, events, config)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, maskConnector(c))
}

func mergeConnectorSecrets(typ string, oldCfg, newCfg json.RawMessage) json.RawMessage {
	var oldM, newM map[string]any
	_ = json.Unmarshal(oldCfg, &oldM)
	_ = json.Unmarshal(newCfg, &newM)
	if typ == "mqtt" {
		if pw, ok := newM["password"].(string); !ok || pw == "" || pw == "••••••" {
			if oldPw, ok := oldM["password"]; ok {
				newM["password"] = oldPw
			}
		}
	}
	out, _ := json.Marshal(newM)
	return out
}

func (d Deps) deleteConnector(w http.ResponseWriter, r *http.Request) {
	if !d.withFeatureOrAdmin(w, r, "integrations") {
		return
	}
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	scope, ok := d.dataTenantScope(w, r)
	if !ok || scope == nil {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid connector id")
		return
	}
	if err := d.Connectors.Delete(r.Context(), id, *scope); err != nil {
		if errors.Is(err, store.ErrConnectorNotFound) {
			writeError(w, http.StatusNotFound, "connector not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (d Deps) testConnector(w http.ResponseWriter, r *http.Request) {
	if !d.withFeatureOrAdmin(w, r, "integrations") {
		return
	}
	if !d.canWriteLoRaWAN(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	scope, ok := d.dataTenantScope(w, r)
	if !ok || scope == nil {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid connector id")
		return
	}
	c, err := d.Connectors.Get(r.Context(), id, *scope)
	if err != nil {
		if errors.Is(err, store.ErrConnectorNotFound) {
			writeError(w, http.StatusNotFound, "connector not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	sample := sampleUplinkEvent(scope.String())
	res := dispatchConnectorTest(r.Context(), c, sample)
	writeJSON(w, http.StatusOK, res)
}

func validateConnectorRequest(req connectorRequest) error {
	if req.Type != "" && req.Type != "http" && req.Type != "mqtt" {
		return errors.New("type must be http or mqtt")
	}
	if req.Type == "http" {
		var cfg struct {
			URL string `json:"url"`
		}
		if err := json.Unmarshal(req.Config, &cfg); err != nil || cfg.URL == "" {
			return errors.New("http config requires url")
		}
	}
	if req.Type == "mqtt" {
		var cfg struct {
			BrokerURL string `json:"brokerUrl"`
			Topic     string `json:"topic"`
		}
		if err := json.Unmarshal(req.Config, &cfg); err != nil {
			return errors.New("invalid mqtt config")
		}
		if cfg.BrokerURL == "" || cfg.Topic == "" {
			return errors.New("mqtt config requires brokerUrl and topic")
		}
	}
	return nil
}

func sampleUplinkEvent(tenantID string) map[string]any {
	return map[string]any{
		"event":    "uplink",
		"tenantId": tenantID,
		"time":     time.Now().UTC().Format(time.RFC3339Nano),
		"device": map[string]any{
			"devEui":        "0102030405060708",
			"applicationId": "00000000-0000-0000-0000-000000000001",
		},
		"radio": map[string]any{
			"rssi": -85,
			"snr":  9.5,
			"dr":   5,
		},
		"payload": map[string]any{
			"fPort": 1,
			"fCnt":  42,
			"hex":   "0102ab",
		},
		"gatewayId": "aabbccddeeff0011",
	}
}

type connectorTestResult struct {
	Success bool   `json:"success"`
	Detail  string `json:"detail,omitempty"`
}

func dispatchConnectorTest(ctx context.Context, c store.Connector, payload map[string]any) connectorTestResult {
	switch c.Type {
	case "http":
		return testHTTPConnector(ctx, c.Config, payload)
	case "mqtt":
		return testMQTTConnector(ctx, c.Config, payload)
	default:
		return connectorTestResult{Success: false, Detail: "unknown type"}
	}
}

func testHTTPConnector(ctx context.Context, raw json.RawMessage, payload map[string]any) connectorTestResult {
	var cfg struct {
		URL        string            `json:"url"`
		Headers    map[string]string `json:"headers"`
		TimeoutSec int               `json:"timeoutSec"`
	}
	if err := json.Unmarshal(raw, &cfg); err != nil || cfg.URL == "" {
		return connectorTestResult{Success: false, Detail: "invalid http config"}
	}
	timeout := 10 * time.Second
	if cfg.TimeoutSec > 0 {
		timeout = time.Duration(cfg.TimeoutSec) * time.Second
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, cfg.URL, bytes.NewReader(body))
	if err != nil {
		return connectorTestResult{Success: false, Detail: err.Error()}
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Lorawan-Event", "uplink")
	for k, v := range cfg.Headers {
		req.Header.Set(k, v)
	}
	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(req)
	if err != nil {
		return connectorTestResult{Success: false, Detail: err.Error()}
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return connectorTestResult{Success: false, Detail: resp.Status}
	}
	return connectorTestResult{Success: true, Detail: resp.Status}
}
