package natsbus

import (
	"context"
	"encoding/json"

	"github.com/lorawan-platform/mqtt-ingestion/internal/ingest"
	"github.com/nats-io/nats.go"
)

const SubjectUplink = "platform.events.uplink"

func Connect(url string) (*nats.Conn, error) {
	return nats.Connect(url)
}

type Publisher struct{ nc *nats.Conn }

func NewPublisher(nc *nats.Conn) *Publisher { return &Publisher{nc: nc} }

func (p *Publisher) PublishUplink(ctx context.Context, event ingest.UplinkEvent) error {
	data, err := json.Marshal(event)
	if err != nil {
		return err
	}
	return p.nc.Publish(SubjectUplink, data)
}
