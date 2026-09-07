package natsbus

import (
	"context"
	"encoding/json"
	"time"

	"github.com/nats-io/nats.go"
)

const SubjectTelemetry = "platform.events.telemetry"
const SubjectUplink = "platform.events.uplink"

type TelemetryEvent struct {
	Event      string          `json:"event"`
	Protocol   string          `json:"protocol"`
	Time       time.Time       `json:"time"`
	TenantID   string          `json:"tenantId,omitempty"`
	DeviceID   string          `json:"deviceId"`
	ExternalID string          `json:"externalId"`
	Name       string          `json:"name,omitempty"`
	Payload    json.RawMessage `json:"payload,omitempty"`
	Metadata   json.RawMessage `json:"metadata,omitempty"`
}

func Connect(url string) (*nats.Conn, error) {
	return nats.Connect(url)
}

type Publisher struct{ nc *nats.Conn }

func NewPublisher(nc *nats.Conn) *Publisher { return &Publisher{nc: nc} }

func (p *Publisher) PublishTelemetry(ctx context.Context, event TelemetryEvent) error {
	data, err := json.Marshal(event)
	if err != nil {
		return err
	}
	return p.nc.Publish(SubjectTelemetry, data)
}
