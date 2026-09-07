package ingest

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/lorawan-platform/device-connectivity/internal/natsbus"
	"github.com/lorawan-platform/device-connectivity/internal/store"
)

type Processor struct {
	endpoints *store.EndpointStore
	nats      *natsbus.Publisher
	logger    *slog.Logger
}

func NewProcessor(endpoints *store.EndpointStore, nats *natsbus.Publisher, logger *slog.Logger) *Processor {
	return &Processor{endpoints: endpoints, nats: nats, logger: logger}
}

type Input struct {
	Endpoint *store.Endpoint
	Protocol string
	Raw      []byte
	Metadata map[string]any
}

func (p *Processor) Handle(ctx context.Context, in Input) error {
	now := time.Now().UTC()
	_ = p.endpoints.TouchLastSeen(ctx, in.Endpoint.ID, now)

	var payloadJSON []byte
	var payloadRaw string
	if len(in.Raw) > 0 {
		payloadRaw = string(in.Raw)
		if json.Valid(in.Raw) {
			payloadJSON = in.Raw
		} else {
			wrapped, _ := json.Marshal(map[string]string{"raw": payloadRaw})
			payloadJSON = wrapped
		}
	}

	metaBytes, _ := json.Marshal(in.Metadata)
	row := store.TelemetryRow{
		Time:             now,
		TenantID:         in.Endpoint.TenantID,
		DeviceEndpointID: in.Endpoint.ID,
		Protocol:         in.Protocol,
		ExternalID:       in.Endpoint.ExternalID,
		PayloadJSON:      payloadJSON,
		PayloadRaw:       payloadRaw,
		PayloadSize:      len(in.Raw),
		Metadata:         metaBytes,
	}
	if err := p.endpoints.InsertTelemetry(ctx, row); err != nil {
		p.logger.Warn("telemetry insert failed", "error", err, "device", in.Endpoint.ExternalID)
		return err
	}

	if p.nats != nil {
		event := natsbus.TelemetryEvent{
			Event:      "telemetry",
			Protocol:   in.Protocol,
			Time:       now,
			TenantID:   in.Endpoint.TenantID.String(),
			DeviceID:   in.Endpoint.ID.String(),
			ExternalID: in.Endpoint.ExternalID,
			Name:       in.Endpoint.Name,
			Payload:    payloadJSON,
			Metadata:   metaBytes,
		}
		if err := p.nats.PublishTelemetry(ctx, event); err != nil {
			p.logger.Warn("nats publish failed", "error", err)
		}
	}

	p.logger.Info("telemetry ingested",
		"protocol", in.Protocol,
		"device", in.Endpoint.ExternalID,
		"tenant", in.Endpoint.TenantID.String(),
		"bytes", len(in.Raw),
	)
	return nil
}

func EndpointID(id uuid.UUID) string { return id.String() }
