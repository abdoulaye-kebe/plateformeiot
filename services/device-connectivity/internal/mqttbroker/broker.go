package mqttbroker

import (
	"context"
	"log/slog"
	"strings"

	mqtt "github.com/mochi-mqtt/server/v2"
	"github.com/mochi-mqtt/server/v2/listeners"
	"github.com/mochi-mqtt/server/v2/packets"
	"github.com/lorawan-platform/device-connectivity/internal/ingest"
	"github.com/lorawan-platform/device-connectivity/internal/store"
)

type Broker struct {
	server *mqtt.Server
}

func New(addr string, endpoints *store.EndpointStore, processor *ingest.Processor, logger *slog.Logger) (*Broker, error) {
	srv := mqtt.New(nil)
	hook := &authHook{endpoints: endpoints, processor: processor, logger: logger}
	if err := srv.AddHook(hook, nil); err != nil {
		return nil, err
	}
	tcp := listeners.NewTCP(listeners.Config{ID: "iot-tcp", Address: addr})
	if err := srv.AddListener(tcp); err != nil {
		return nil, err
	}
	return &Broker{server: srv}, nil
}

func (b *Broker) Start() error {
	return b.server.Serve()
}

func (b *Broker) Close() error {
	return b.server.Close()
}

type authHook struct {
	mqtt.HookBase
	endpoints *store.EndpointStore
	processor *ingest.Processor
	logger    *slog.Logger
}

func (h *authHook) ID() string { return "platform-db-auth" }

func (h *authHook) Provides(b byte) bool {
	return b == mqtt.OnConnectAuthenticate || b == mqtt.OnACLCheck || b == mqtt.OnPublished
}

func (h *authHook) OnConnectAuthenticate(cl *mqtt.Client, pk packets.Packet) bool {
	username := strings.TrimSpace(string(pk.Connect.Username))
	password := string(pk.Connect.Password)
	if username == "" || password == "" {
		return false
	}
	_, err := h.endpoints.AuthenticateMQTT(context.Background(), username, password)
	return err == nil
}

func (h *authHook) OnACLCheck(cl *mqtt.Client, topic string, write bool) bool {
	deviceID := deviceIDFromClient(cl)
	if deviceID == "" {
		return false
	}
	allowedPub := "devices/" + deviceID + "/telemetry"
	allowedSub := "devices/" + deviceID + "/command"
	if write {
		return topic == allowedPub || strings.HasPrefix(topic, allowedPub+"/")
	}
	return topic == allowedSub || strings.HasPrefix(topic, allowedSub+"/")
}

func (h *authHook) OnPublished(cl *mqtt.Client, pk packets.Packet) {
	if pk.FixedHeader.Type != packets.Publish {
		return
	}
	topic := pk.TopicName
	if !strings.Contains(topic, "/telemetry") {
		return
	}
	parts := strings.Split(topic, "/")
	if len(parts) < 3 || parts[0] != "devices" {
		return
	}
	externalID := parts[1]
	ep, err := h.endpoints.GetByExternalID(context.Background(), "mqtt", externalID)
	if err != nil {
		return
	}
	payload := pk.Payload
	if len(payload) == 0 {
		return
	}
	if err := h.processor.Handle(context.Background(), ingest.Input{
		Endpoint: ep,
		Protocol: "mqtt",
		Raw:      payload,
		Metadata: map[string]any{"topic": topic, "qos": pk.FixedHeader.Qos},
	}); err != nil {
		h.logger.Warn("mqtt telemetry failed", "device", externalID, "error", err)
	}
}

func deviceIDFromClient(cl *mqtt.Client) string {
	if cl == nil {
		return ""
	}
	if len(cl.Properties.Username) > 0 {
		return strings.TrimSpace(string(cl.Properties.Username))
	}
	return strings.TrimSpace(cl.ID)
}
