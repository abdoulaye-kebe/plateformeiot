package chirpstack

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Client struct {
	baseURL    string
	apiToken   string
	httpClient *http.Client
}

func NewClient(baseURL, apiToken string) *Client {
	return &Client{
		baseURL:  strings.TrimRight(baseURL, "/"),
		apiToken: apiToken,
		httpClient: &http.Client{
			Timeout: 20 * time.Second,
		},
	}
}

func (c *Client) ListApplications(ctx context.Context, tenantID string, limit int) (map[string]any, error) {
	q := url.Values{}
	q.Set("limit", fmt.Sprintf("%d", limit))
	if tenantID != "" {
		q.Set("tenantId", tenantID)
	}
	return c.getJSON(ctx, "/api/applications?"+q.Encode())
}

func (c *Client) CreateApplication(ctx context.Context, tenantID, name, description string) (map[string]any, error) {
	body := map[string]any{
		"application": map[string]any{
			"name":        name,
			"description": description,
			"tenantId":    tenantID,
		},
	}
	return c.postJSON(ctx, "/api/applications", body)
}

func (c *Client) ListDeviceProfiles(ctx context.Context, tenantID string, limit int) (map[string]any, error) {
	q := url.Values{}
	q.Set("limit", fmt.Sprintf("%d", limit))
	if tenantID != "" {
		q.Set("tenantId", tenantID)
	}
	return c.getJSON(ctx, "/api/device-profiles?"+q.Encode())
}

func (c *Client) CreateDeviceProfile(ctx context.Context, tenantID, name, description string) (map[string]any, error) {
	body := map[string]any{
		"deviceProfile": map[string]any{
			"tenantId":          tenantID,
			"name":              name,
			"description":       description,
			"region":            "EU868",
			"macVersion":        "1.0.3",
			"regParamsRevision": "A",
			"supportsOtaa":      true,
			"supportsClassB":    false,
			"supportsClassC":    false,
			"allowRoaming":      false,
			"uplinkInterval":    3600,
			"adrAlgorithmId":    "default",
		},
	}
	return c.postJSON(ctx, "/api/device-profiles", body)
}

func (c *Client) GetDeviceProfile(ctx context.Context, profileID string) (map[string]any, error) {
	return c.getJSON(ctx, "/api/device-profiles/"+url.PathEscape(profileID))
}

func (c *Client) UpdateDeviceProfile(ctx context.Context, profileID string, profile map[string]any) (map[string]any, error) {
	return c.putJSON(ctx, "/api/device-profiles/"+url.PathEscape(profileID), map[string]any{"deviceProfile": profile})
}

func (c *Client) CreateDeviceProfileWithCodec(ctx context.Context, tenantID, name, description, codecScript string) (map[string]any, error) {
	body := map[string]any{
		"deviceProfile": map[string]any{
			"tenantId":             tenantID,
			"name":                 name,
			"description":          description,
			"region":               "EU868",
			"macVersion":           "1.0.3",
			"regParamsRevision":    "A",
			"supportsOtaa":         true,
			"supportsClassB":       false,
			"supportsClassC":       false,
			"allowRoaming":         false,
			"uplinkInterval":       3600,
			"adrAlgorithmId":       "default",
			"payloadCodecRuntime":  "JS",
			"payloadCodecScript":   codecScript,
			"autoDetectMeasurements": true,
		},
	}
	return c.postJSON(ctx, "/api/device-profiles", body)
}

func (c *Client) ApplyDeviceProfileCodec(ctx context.Context, profileID, codecScript string) (map[string]any, error) {
	current, err := c.GetDeviceProfile(ctx, profileID)
	if err != nil {
		return nil, err
	}
	profile, _ := current["deviceProfile"].(map[string]any)
	if profile == nil {
		profile = current
	}
	profile["payloadCodecRuntime"] = "JS"
	profile["payloadCodecScript"] = codecScript
	profile["autoDetectMeasurements"] = true
	return c.UpdateDeviceProfile(ctx, profileID, profile)
}

// ListDevices agrège les devices par application (ChirpStack v4 exige applicationId).
func (c *Client) ListDevices(ctx context.Context, tenantID string, limit int) (map[string]any, error) {
	if tenantID == "" {
		q := url.Values{}
		q.Set("limit", fmt.Sprintf("%d", limit))
		return c.getJSON(ctx, "/api/devices?"+q.Encode())
	}

	apps, err := c.ListApplications(ctx, tenantID, 100)
	if err != nil {
		return nil, err
	}

	appItems, _ := apps["result"].([]any)
	if len(appItems) == 0 {
		return map[string]any{"totalCount": 0, "result": []any{}}, nil
	}

	var merged []any
	totalCount := 0

	for _, item := range appItems {
		appID := extractApplicationID(item)
		if appID == "" {
			continue
		}

		q := url.Values{}
		q.Set("limit", fmt.Sprintf("%d", limit))
		q.Set("applicationId", appID)
		devices, err := c.getJSON(ctx, "/api/devices?"+q.Encode())
		if err != nil {
			continue
		}

		totalCount += int(jsonNumber(devices["totalCount"]))
		if rows, ok := devices["result"].([]any); ok {
			merged = append(merged, rows...)
		}
	}

	if len(merged) > limit {
		merged = merged[:limit]
	}
	if merged == nil {
		merged = []any{}
	}

	return map[string]any{
		"totalCount": totalCount,
		"result":     merged,
	}, nil
}

func extractApplicationID(item any) string {
	appMap, ok := item.(map[string]any)
	if !ok {
		return ""
	}
	if app, ok := appMap["application"].(map[string]any); ok {
		if id, ok := app["id"].(string); ok {
			return id
		}
	}
	if id, ok := appMap["id"].(string); ok {
		return id
	}
	return ""
}

func jsonNumber(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	default:
		return 0
	}
}

func (c *Client) GetDevice(ctx context.Context, devEUI string) (map[string]any, error) {
	return c.getJSON(ctx, "/api/devices/"+url.PathEscape(strings.ToLower(devEUI)))
}

func (c *Client) CreateDevice(ctx context.Context, devEUI, name, applicationID, deviceProfileID, joinEUI, description string) (map[string]any, error) {
	device := map[string]any{
		"devEui":          strings.ToLower(devEUI),
		"name":            name,
		"applicationId":   applicationID,
		"deviceProfileId": deviceProfileID,
	}
	if joinEUI != "" {
		device["joinEui"] = strings.ToLower(joinEUI)
	}
	if description != "" {
		device["description"] = description
	}
	return c.postJSON(ctx, "/api/devices", map[string]any{"device": device})
}

func (c *Client) CreateDeviceKeys(ctx context.Context, devEUI, appKey, nwkKey string) (map[string]any, error) {
	devEUI = strings.ToLower(devEUI)
	keys := map[string]any{
		"devEui": devEUI,
		"appKey": strings.ToLower(appKey),
	}
	if nwkKey != "" {
		keys["nwkKey"] = strings.ToLower(nwkKey)
	} else {
		keys["nwkKey"] = strings.ToLower(appKey)
	}
	_, err := c.postJSON(ctx, "/api/devices/"+url.PathEscape(devEUI)+"/keys", map[string]any{"deviceKeys": keys})
	if err != nil {
		return c.putJSON(ctx, "/api/devices/"+url.PathEscape(devEUI)+"/keys", map[string]any{"deviceKeys": keys})
	}
	return keys, nil
}

func (c *Client) UpdateDevice(ctx context.Context, devEUI string, updates map[string]any) (map[string]any, error) {
	current, err := c.GetDevice(ctx, devEUI)
	if err != nil {
		return nil, err
	}
	device, _ := current["device"].(map[string]any)
	if device == nil {
		device = current
	}
	for k, v := range updates {
		device[k] = v
	}
	allowed := map[string]bool{
		"applicationId": true, "description": true, "deviceProfileId": true,
		"isDisabled": true, "joinEui": true, "name": true, "skipFcntCheck": true,
		"tags": true, "variables": true,
	}
	payload := map[string]any{}
	for k, v := range device {
		if allowed[k] {
			payload[k] = v
		}
	}
	return c.putJSON(ctx, "/api/devices/"+url.PathEscape(strings.ToLower(devEUI)), map[string]any{"device": payload})
}

func (c *Client) DeleteDevice(ctx context.Context, devEUI string) error {
	return c.delete(ctx, "/api/devices/"+url.PathEscape(strings.ToLower(devEUI)))
}

func (c *Client) ListGateways(ctx context.Context, tenantID string, limit int) (map[string]any, error) {
	q := url.Values{}
	q.Set("limit", fmt.Sprintf("%d", limit))
	if tenantID != "" {
		q.Set("tenantId", tenantID)
	}
	return c.getJSON(ctx, "/api/gateways?"+q.Encode())
}

func (c *Client) GetGateway(ctx context.Context, gatewayID string) (map[string]any, error) {
	return c.getJSON(ctx, "/api/gateways/"+url.PathEscape(strings.ToLower(gatewayID)))
}

func (c *Client) CreateGateway(ctx context.Context, tenantID, gatewayID, name, description string) (map[string]any, error) {
	gateway := map[string]any{
		"gatewayId":        strings.ToLower(gatewayID),
		"name":             name,
		"tenantId":         tenantID,
		"downlinkPriority": 1,
	}
	if description != "" {
		gateway["description"] = description
	}
	return c.postJSON(ctx, "/api/gateways", map[string]any{"gateway": gateway})
}

func (c *Client) UpdateGateway(ctx context.Context, gatewayID string, updates map[string]any) (map[string]any, error) {
	current, err := c.GetGateway(ctx, gatewayID)
	if err != nil {
		return nil, err
	}
	gateway, _ := current["gateway"].(map[string]any)
	if gateway == nil {
		gateway = current
	}
	for k, v := range updates {
		gateway[k] = v
	}
	allowed := map[string]bool{
		"description": true, "downlinkPriority": true, "location": true,
		"metadata": true, "name": true, "statsInterval": true, "tags": true, "tenantId": true,
	}
	payload := map[string]any{}
	for k, v := range gateway {
		if allowed[k] {
			payload[k] = v
		}
	}
	return c.putJSON(ctx, "/api/gateways/"+url.PathEscape(strings.ToLower(gatewayID)), map[string]any{"gateway": payload})
}

func (c *Client) DeleteGateway(ctx context.Context, gatewayID string) error {
	return c.delete(ctx, "/api/gateways/"+url.PathEscape(strings.ToLower(gatewayID)))
}

func (c *Client) ListTenants(ctx context.Context, limit int) (map[string]any, error) {
	return c.getJSON(ctx, fmt.Sprintf("/api/tenants?limit=%d", limit))
}

func (c *Client) CreateTenant(ctx context.Context, name string, maxDevices, maxGateways int) (map[string]any, error) {
	if maxDevices <= 0 {
		maxDevices = 50
	}
	if maxGateways <= 0 {
		maxGateways = 5
	}
	return c.postJSON(ctx, "/api/tenants", map[string]any{
		"tenant": map[string]any{
			"name":            name,
			"canHaveGateways": true,
			"maxGatewayCount": maxGateways,
			"maxDeviceCount":  maxDevices,
		},
	})
}

func (c *Client) UpdateTenantLimits(ctx context.Context, tenantID string, maxDevices, maxGateways int) error {
	current, err := c.getJSON(ctx, "/api/tenants/"+url.PathEscape(tenantID))
	if err != nil {
		return err
	}
	tenant, _ := current["tenant"].(map[string]any)
	if tenant == nil {
		tenant = current
	}
	tenant["maxDeviceCount"] = maxDevices
	tenant["maxGatewayCount"] = maxGateways
	_, err = c.putJSON(ctx, "/api/tenants/"+url.PathEscape(tenantID), map[string]any{"tenant": tenant})
	return err
}

func (c *Client) DeleteTenant(ctx context.Context, tenantID string) error {
	return c.delete(ctx, "/api/tenants/"+url.PathEscape(tenantID))
}

func (c *Client) EnqueueDownlink(ctx context.Context, devEUI string, dataBase64 string, fPort int, confirmed bool) (map[string]any, error) {
	body := map[string]any{
		"deviceQueueItem": map[string]any{
			"confirmed": confirmed,
			"data":      dataBase64,
			"devEUI":    strings.ToLower(devEUI),
			"fPort":     fPort,
		},
	}
	return c.postJSON(ctx, "/api/devices/"+url.PathEscape(strings.ToLower(devEUI))+"/queue", body)
}

func (c *Client) FlushDownlinkQueue(ctx context.Context, devEUI string) error {
	return c.delete(ctx, "/api/devices/"+url.PathEscape(strings.ToLower(devEUI))+"/queue")
}

func (c *Client) GetDeviceEvents(ctx context.Context, devEUI string, limit int) (map[string]any, error) {
	q := url.Values{}
	q.Set("limit", fmt.Sprintf("%d", limit))
	data, err := c.getJSON(ctx, "/api/devices/"+url.PathEscape(devEUI)+"/events?"+q.Encode())
	if err != nil && strings.Contains(err.Error(), "404") {
		// ChirpStack v4 REST n'expose plus /events — retour gracieux pour la console.
		return map[string]any{"totalCount": 0, "result": []any{}}, nil
	}
	return data, err
}

func (c *Client) Ping(ctx context.Context, tenantID string) error {
	_, err := c.ListGateways(ctx, tenantID, 1)
	return err
}

func (c *Client) CreateMulticastGroup(ctx context.Context, tenantID, applicationID, name, region, class string) (map[string]any, error) {
	groupType := "CLASS_C"
	if strings.ToUpper(class) == "B" {
		groupType = "CLASS_B"
	}
	body := map[string]any{
		"multicastGroup": map[string]any{
			"name":          name,
			"applicationId": applicationID,
			"region":        region,
			"groupType":     groupType,
			"dr":            0,
			"fCnt":          0,
			"frequency":     869525000,
		},
	}
	return c.postJSON(ctx, "/api/multicast-groups", body)
}

func (c *Client) AddDeviceToMulticastGroup(ctx context.Context, multicastGroupID, devEUI string) error {
	body := map[string]any{
		"multicastGroupId": multicastGroupID,
		"devEui":           strings.ToLower(devEUI),
	}
	_, err := c.postJSON(ctx, "/api/multicast-groups/"+url.PathEscape(multicastGroupID)+"/devices", body)
	return err
}

func (c *Client) ListMulticastGroups(ctx context.Context, applicationID string, limit int) (map[string]any, error) {
	q := url.Values{}
	q.Set("limit", fmt.Sprintf("%d", limit))
	q.Set("applicationId", applicationID)
	return c.getJSON(ctx, "/api/multicast-groups?"+q.Encode())
}

func (c *Client) getJSON(ctx context.Context, path string) (map[string]any, error) {
	return c.doJSON(ctx, http.MethodGet, path, nil)
}

func (c *Client) postJSON(ctx context.Context, path string, body any) (map[string]any, error) {
	return c.doJSON(ctx, http.MethodPost, path, body)
}

func (c *Client) putJSON(ctx context.Context, path string, body any) (map[string]any, error) {
	return c.doJSON(ctx, http.MethodPut, path, body)
}

func (c *Client) delete(ctx context.Context, path string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, c.baseURL+path, nil)
	if err != nil {
		return err
	}
	if c.apiToken != "" {
		req.Header.Set("Grpc-Metadata-Authorization", "Bearer "+c.apiToken)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("chirpstack %s: %s", resp.Status, string(body))
	}
	return nil
}

func (c *Client) doJSON(ctx context.Context, method, path string, body any) (map[string]any, error) {
	var reader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reader = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return nil, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.apiToken != "" {
		req.Header.Set("Grpc-Metadata-Authorization", "Bearer "+c.apiToken)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("chirpstack %s: %s", resp.Status, string(raw))
	}
	if len(raw) == 0 {
		return map[string]any{"ok": true}, nil
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	return out, nil
}
