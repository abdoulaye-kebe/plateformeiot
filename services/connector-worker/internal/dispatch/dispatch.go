package dispatch

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/lorawan-platform/connector-worker/internal/store"
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
	FCnt          int64     `json:"fCnt"`
	Data          string    `json:"data,omitempty"`
}

func BuildPayload(event UplinkEvent) map[string]any {
	return map[string]any{
		"event":    "uplink",
		"tenantId": event.TenantID,
		"time":     event.Time.UTC().Format(time.RFC3339Nano),
		"device": map[string]any{
			"devEui":        event.DevEUI,
			"applicationId": event.ApplicationID,
		},
		"radio": map[string]any{
			"rssi": event.RSSI,
			"snr":  event.SNR,
			"dr":   event.DR,
		},
		"payload": map[string]any{
			"fPort": event.FPort,
			"fCnt":  event.FCnt,
			"hex":   event.Data,
		},
		"gatewayId": event.GatewayID,
	}
}

type Dispatcher struct {
	client *http.Client
}

func New() *Dispatcher {
	return &Dispatcher{client: &http.Client{Timeout: 15 * time.Second}}
}

func (d *Dispatcher) Dispatch(ctx context.Context, c store.Connector, payload map[string]any) error {
	switch c.Type {
	case "http":
		return d.dispatchHTTP(ctx, c.Config, payload)
	case "mqtt":
		return d.dispatchMQTT(ctx, c.Config, payload)
	default:
		return fmt.Errorf("unknown connector type %s", c.Type)
	}
}

func (d *Dispatcher) dispatchHTTP(ctx context.Context, raw json.RawMessage, payload map[string]any) error {
	var cfg struct {
		URL        string            `json:"url"`
		Headers    map[string]string `json:"headers"`
		TimeoutSec int               `json:"timeoutSec"`
	}
	if err := json.Unmarshal(raw, &cfg); err != nil || cfg.URL == "" {
		return fmt.Errorf("invalid http config")
	}
	timeout := 15 * time.Second
	if cfg.TimeoutSec > 0 {
		timeout = time.Duration(cfg.TimeoutSec) * time.Second
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, cfg.URL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Lorawan-Event", "uplink")
	for k, v := range cfg.Headers {
		req.Header.Set(k, v)
	}
	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("http %s", resp.Status)
	}
	return nil
}

func (d *Dispatcher) dispatchMQTT(ctx context.Context, raw json.RawMessage, payload map[string]any) error {
	var cfg struct {
		BrokerURL   string `json:"brokerUrl"`
		Topic       string `json:"topic"`
		Username    string `json:"username"`
		Password    string `json:"password"`
		ClientID    string `json:"clientId"`
		QoS         byte   `json:"qos"`
		TLSInsecure bool   `json:"tlsInsecure"`
	}
	if err := json.Unmarshal(raw, &cfg); err != nil || cfg.BrokerURL == "" || cfg.Topic == "" {
		return fmt.Errorf("invalid mqtt config")
	}
	topic := expandTopic(cfg.Topic, payload)
	if cfg.ClientID == "" {
		cfg.ClientID = "lorawan-connector"
	}
	opts := mqtt.NewClientOptions().AddBroker(cfg.BrokerURL).SetClientID(cfg.ClientID)
	if cfg.Username != "" {
		opts.SetUsername(cfg.Username)
		opts.SetPassword(cfg.Password)
	}
	if strings.HasPrefix(cfg.BrokerURL, "ssl://") || strings.HasPrefix(cfg.BrokerURL, "tls://") || strings.HasPrefix(cfg.BrokerURL, "mqtts://") {
		opts.SetTLSConfig(&tls.Config{InsecureSkipVerify: cfg.TLSInsecure}) //nolint:gosec
	}
	client := mqtt.NewClient(opts)
	token := client.Connect()
	if !token.WaitTimeout(10 * time.Second) || token.Error() != nil {
		return fmt.Errorf("mqtt connect: %w", token.Error())
	}
	defer client.Disconnect(250)

	body, _ := json.Marshal(payload)
	qos := cfg.QoS
	if qos > 2 {
		qos = 1
	}
	pub := client.Publish(topic, qos, false, body)
	if !pub.WaitTimeout(10 * time.Second) || pub.Error() != nil {
		return fmt.Errorf("mqtt publish: %w", pub.Error())
	}
	return nil
}

func expandTopic(tmpl string, payload map[string]any) string {
	out := tmpl
	repl := map[string]string{
		"{tenantId}": "",
		"{devEui}":   "",
		"{applicationId}": "",
	}
	if v, ok := payload["tenantId"].(string); ok {
		repl["{tenantId}"] = v
	}
	if dev, ok := payload["device"].(map[string]any); ok {
		if v, ok := dev["devEui"].(string); ok {
			repl["{devEui}"] = v
		}
		if v, ok := dev["applicationId"].(string); ok {
			repl["{applicationId}"] = v
		}
	}
	for k, v := range repl {
		out = strings.ReplaceAll(out, k, v)
	}
	return out
}
