package ingest

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
)

type TenantResolver interface {
	ByApplication(ctx context.Context, applicationID string) (uuid.UUID, error)
	ByGateway(ctx context.Context, gatewayID string) (uuid.UUID, error)
	ByChirpStackTenant(ctx context.Context, csTenantID string) (uuid.UUID, error)
	DefaultTenant(ctx context.Context) (uuid.UUID, error)
}

type UplinkWriter interface {
	InsertUplink(ctx context.Context, row UplinkRow) error
}

type GatewayWriter interface {
	InsertStats(ctx context.Context, row GatewayRow) error
}

type EventPublisher interface {
	PublishUplink(ctx context.Context, event UplinkEvent) error
	PublishDownlinkAck(ctx context.Context, event DownlinkAckEvent) error
}

type PayloadArchiver interface {
	ArchiveUplink(ctx context.Context, row UplinkRow, rawPayload []byte, payloadHex string, decodedObject []byte) error
}

type Handler struct {
	uplinks   UplinkWriter
	gateways  GatewayWriter
	publisher EventPublisher
	archiver  PayloadArchiver
	tenants   TenantResolver
	region    string
	logger    *slog.Logger
}

func NewHandler(u UplinkWriter, g GatewayWriter, p EventPublisher, archiver PayloadArchiver, tenants TenantResolver, region string, logger *slog.Logger) *Handler {
	return &Handler{uplinks: u, gateways: g, publisher: p, archiver: archiver, tenants: tenants, region: region, logger: logger}
}

func (h *Handler) Handle(topic string, payload []byte) {
	ctx := context.Background()

	if strings.Contains(topic, "/device/") && strings.HasSuffix(topic, "/event/up") {
		h.handleUplink(ctx, topic, payload)
		return
	}
	if strings.Contains(topic, "/device/") && strings.HasSuffix(topic, "/event/ack") {
		h.handleDownlinkAck(ctx, topic, payload)
		return
	}
	if strings.Contains(topic, "/gateway/") && strings.HasSuffix(topic, "/event/stats") {
		h.handleGatewayStats(ctx, payload)
	}
}

func (h *Handler) resolveTenant(ctx context.Context, appID, gatewayID, csTenantID string) *uuid.UUID {
	if h.tenants == nil {
		return nil
	}
	if csTenantID != "" {
		if id, err := h.tenants.ByChirpStackTenant(ctx, csTenantID); err == nil {
			return &id
		}
	}
	if appID != "" {
		if id, err := h.tenants.ByApplication(ctx, appID); err == nil {
			return &id
		}
	}
	if gatewayID != "" {
		if id, err := h.tenants.ByGateway(ctx, gatewayID); err == nil {
			return &id
		}
	}
	if id, err := h.tenants.DefaultTenant(ctx); err == nil {
		return &id
	}
	return nil
}

func (h *Handler) handleUplink(ctx context.Context, topic string, payload []byte) {
	var msg uplinkMessage
	if err := json.Unmarshal(payload, &msg); err != nil {
		h.logger.Warn("uplink parse error", "error", err)
		return
	}

	devEUI := msg.DeviceInfo.DevEUI
	if devEUI == "" {
		parts := strings.Split(topic, "/")
		if len(parts) >= 5 {
			devEUI = parts[3]
		}
	}

	ts := time.Now().UTC()
	if msg.Time != "" {
		if t, err := time.Parse(time.RFC3339Nano, msg.Time); err == nil {
			ts = t.UTC()
		}
	}

	var gatewayID string
	var rssi int
	var snr float64
	if len(msg.RxInfo) > 0 {
		gatewayID = msg.RxInfo[0].GatewayID
		rssi = int(msg.RxInfo[0].RSSI)
		snr = msg.RxInfo[0].SNR
	}

	appID := msg.DeviceInfo.ApplicationID
	if appID == "" {
		parts := strings.Split(topic, "/")
		if len(parts) >= 3 {
			appID = parts[1]
		}
	}

	tenantID := h.resolveTenant(ctx, appID, gatewayID, msg.DeviceInfo.TenantID)

	payloadHex, payloadSize, _ := NormalizePayloadData(msg.Data)
	if payloadSize == 0 && msg.Data != "" {
		payloadSize = len(msg.Data) / 2
		payloadHex = msg.Data
	}

	row := UplinkRow{
		Time:          ts,
		TenantID:      tenantID,
		DevEUI:        strings.ToLower(devEUI),
		ApplicationID: appID,
		GatewayID:     strings.ToLower(gatewayID),
		RSSI:          rssi,
		SNR:           snr,
		DR:            msg.DR,
		FCnt:          msg.FCnt,
		FPort:         msg.FPort,
		Frequency:     msg.TxInfo.Frequency,
		PayloadSize:   payloadSize,
		Region:        h.region,
	}

	if err := h.uplinks.InsertUplink(ctx, row); err != nil {
		h.logger.Error("insert uplink failed", "error", err, "devEui", devEUI)
		return
	}

	if h.archiver != nil {
		var decodedObject []byte
		if len(msg.Object) > 0 {
			decodedObject = msg.Object
		}
		if err := h.archiver.ArchiveUplink(ctx, row, payload, payloadHex, decodedObject); err != nil {
			h.logger.Warn("payload archive failed", "error", err, "devEui", devEUI)
		}
	}

	if h.publisher != nil {
		event := UplinkEvent{
			Time:          ts,
			DevEUI:        row.DevEUI,
			ApplicationID: row.ApplicationID,
			GatewayID:     row.GatewayID,
			RSSI:          row.RSSI,
			SNR:           row.SNR,
			DR:            row.DR,
			FPort:         row.FPort,
			FCnt:          row.FCnt,
			Data:          msg.Data,
			Object:        msg.Object,
		}
		if tenantID != nil {
			event.TenantID = tenantID.String()
		}
		_ = h.publisher.PublishUplink(ctx, event)
	}

	h.logger.Debug("uplink ingested", "devEui", devEUI, "tenantId", tenantID, "rssi", rssi)
}

func (h *Handler) handleDownlinkAck(ctx context.Context, topic string, payload []byte) {
	var msg downlinkAckMessage
	if err := json.Unmarshal(payload, &msg); err != nil {
		h.logger.Warn("downlink ack parse error", "error", err)
		return
	}

	devEUI := strings.ToLower(msg.DeviceInfo.DevEUI)
	if devEUI == "" {
		parts := strings.Split(topic, "/")
		if len(parts) >= 5 {
			devEUI = strings.ToLower(parts[3])
		}
	}
	if devEUI == "" {
		return
	}

	ts := time.Now().UTC()
	if msg.Time != "" {
		if t, err := time.Parse(time.RFC3339Nano, msg.Time); err == nil {
			ts = t.UTC()
		}
	}

	appID := msg.DeviceInfo.ApplicationID
	if appID == "" {
		parts := strings.Split(topic, "/")
		if len(parts) >= 3 {
			appID = parts[1]
		}
	}

	tenantID := h.resolveTenant(ctx, appID, "", msg.DeviceInfo.TenantID)

	payloadHex, _, _ := NormalizePayloadData(msg.Data)

	if h.publisher != nil {
		event := DownlinkAckEvent{
			Time:          ts,
			DevEUI:        devEUI,
			ApplicationID: appID,
			QueueItemID:   msg.QueueItemID,
			Acknowledged:  msg.Acknowledged,
			FCntDown:      msg.FCntDown,
			FPort:         msg.FPort,
			PayloadHex:    payloadHex,
		}
		if tenantID != nil {
			event.TenantID = tenantID.String()
		}
		if err := h.publisher.PublishDownlinkAck(ctx, event); err != nil {
			h.logger.Warn("downlink ack publish failed", "error", err, "devEui", devEUI)
		}
	}

	h.logger.Info(
		"downlink ack",
		"devEui", devEUI,
		"acknowledged", msg.Acknowledged,
		"fCntDown", msg.FCntDown,
		"tenantId", tenantID,
	)
}

func (h *Handler) handleGatewayStats(ctx context.Context, payload []byte) {
	var msg gatewayStatsMessage
	if err := json.Unmarshal(payload, &msg); err != nil {
		h.logger.Warn("gateway stats parse error", "error", err)
		return
	}
	ts := time.Now().UTC()
	if msg.Time != "" {
		if t, err := time.Parse(time.RFC3339Nano, msg.Time); err == nil {
			ts = t.UTC()
		}
	}
	gatewayID := strings.ToLower(msg.GatewayID)
	tenantID := h.resolveTenant(ctx, "", gatewayID, "")
	row := GatewayRow{
		Time:                ts,
		TenantID:            tenantID,
		GatewayID:           gatewayID,
		RXPacketsReceived:   msg.Stats.RXPacketsReceived,
		TXPacketsReceived:   msg.Stats.TXPacketsReceived,
		Region:              h.region,
	}
	if err := h.gateways.InsertStats(ctx, row); err != nil {
		h.logger.Error("insert gateway stats failed", "error", err)
	}
}

type uplinkMessage struct {
	Time       string          `json:"time"`
	DR         int             `json:"dr"`
	FCnt       int64           `json:"fCnt"`
	FPort      int             `json:"fPort"`
	Data       string          `json:"data"`
	Object     json.RawMessage `json:"object"`
	DeviceInfo struct {
		DevEUI        string `json:"devEui"`
		ApplicationID string `json:"applicationId"`
		TenantID      string `json:"tenantId"`
	} `json:"deviceInfo"`
	RxInfo []struct {
		GatewayID string  `json:"gatewayId"`
		RSSI      float64 `json:"rssi"`
		SNR       float64 `json:"snr"`
	} `json:"rxInfo"`
	TxInfo struct {
		Frequency int64 `json:"frequency"`
	} `json:"txInfo"`
}

type gatewayStatsMessage struct {
	Time      string `json:"time"`
	GatewayID string `json:"gatewayId"`
	Stats     struct {
		RXPacketsReceived int64 `json:"rxPacketsReceived"`
		TXPacketsReceived int64 `json:"txPacketsReceived"`
	} `json:"stats"`
}

type downlinkAckMessage struct {
	Time        string `json:"time"`
	QueueItemID string `json:"queueItemId"`
	Acknowledged bool  `json:"acknowledged"`
	FCntDown    int64  `json:"fCntDown"`
	FPort       int    `json:"fPort"`
	Data        string `json:"data"`
	DeviceInfo  struct {
		DevEUI        string `json:"devEui"`
		ApplicationID string `json:"applicationId"`
		TenantID      string `json:"tenantId"`
	} `json:"deviceInfo"`
}

type UplinkRow struct {
	Time          time.Time
	TenantID      *uuid.UUID
	DevEUI        string
	ApplicationID string
	GatewayID     string
	RSSI          int
	SNR           float64
	DR            int
	FCnt          int64
	FPort         int
	Frequency     int64
	PayloadSize   int
	Region        string
}

type GatewayRow struct {
	Time              time.Time
	TenantID          *uuid.UUID
	GatewayID         string
	RXPacketsReceived int64
	TXPacketsReceived int64
	Region            string
}

type UplinkEvent struct {
	Time          time.Time       `json:"time"`
	TenantID      string          `json:"tenantId,omitempty"`
	DevEUI        string          `json:"devEui"`
	ApplicationID string          `json:"applicationId"`
	GatewayID     string          `json:"gatewayId"`
	RSSI          int             `json:"rssi"`
	SNR           float64         `json:"snr"`
	DR            int             `json:"dr"`
	FPort         int             `json:"fPort"`
	FCnt          int64           `json:"fCnt"`
	Data          string          `json:"data,omitempty"`
	Object        json.RawMessage `json:"object,omitempty"`
}

type DownlinkAckEvent struct {
	Time          time.Time `json:"time"`
	TenantID      string    `json:"tenantId,omitempty"`
	DevEUI        string    `json:"devEui"`
	ApplicationID string    `json:"applicationId,omitempty"`
	QueueItemID   string    `json:"queueItemId,omitempty"`
	Acknowledged  bool      `json:"acknowledged"`
	FCntDown      int64     `json:"fCntDown,omitempty"`
	FPort         int       `json:"fPort,omitempty"`
	PayloadHex    string    `json:"payloadHex,omitempty"`
}
