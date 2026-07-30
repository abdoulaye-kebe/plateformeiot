package handler

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

func testMQTTConnector(ctx context.Context, raw json.RawMessage, payload map[string]any) connectorTestResult {
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
		return connectorTestResult{Success: false, Detail: "invalid mqtt config"}
	}
	topic := cfg.Topic
	if strings.Contains(topic, "{") {
		if v, ok := payload["tenantId"].(string); ok {
			topic = strings.ReplaceAll(topic, "{tenantId}", v)
		}
	}
	if cfg.ClientID == "" {
		cfg.ClientID = "lorawan-connector-test"
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
	if !token.WaitTimeout(10*time.Second) || token.Error() != nil {
		return connectorTestResult{Success: false, Detail: fmt.Sprintf("mqtt connect: %v", token.Error())}
	}
	defer client.Disconnect(250)

	body, _ := json.Marshal(payload)
	qos := cfg.QoS
	if qos > 2 {
		qos = 1
	}
	pub := client.Publish(topic, qos, false, body)
	if !pub.WaitTimeout(10*time.Second) || pub.Error() != nil {
		return connectorTestResult{Success: false, Detail: fmt.Sprintf("mqtt publish: %v", pub.Error())}
	}
	return connectorTestResult{Success: true, Detail: fmt.Sprintf("published to %s", topic)}
}
