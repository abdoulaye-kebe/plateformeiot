package ingest

import (
	"encoding/json"
	"strings"
	"time"

	gw "github.com/chirpstack/chirpstack/api/go/v4/gw"
	"google.golang.org/protobuf/proto"
)

func gatewayIDFromStatsTopic(topic string) string {
	parts := strings.Split(topic, "/")
	for i, part := range parts {
		if part == "gateway" && i+1 < len(parts) {
			return strings.ToLower(parts[i+1])
		}
	}
	return ""
}

func parseGatewayStats(topic string, payload []byte) (gatewayStatsMessage, error) {
	var msg gatewayStatsMessage
	if err := json.Unmarshal(payload, &msg); err == nil {
		if msg.GatewayID != "" || msg.Stats.RXPacketsReceived > 0 || msg.Stats.TXPacketsReceived > 0 {
			if msg.GatewayID == "" {
				msg.GatewayID = gatewayIDFromStatsTopic(topic)
			}
			return msg, nil
		}
	}

	var pb gw.GatewayStats
	if err := proto.Unmarshal(payload, &pb); err != nil {
		return msg, err
	}

	gatewayID := strings.ToLower(pb.GetGatewayId())
	if gatewayID == "" {
		gatewayID = gatewayIDFromStatsTopic(topic)
	}
	if pb.GetTime() != nil {
		msg.Time = pb.GetTime().AsTime().UTC().Format(time.RFC3339Nano)
	}
	msg.GatewayID = gatewayID
	msg.Stats.RXPacketsReceived = int64(pb.GetRxPacketsReceived())
	msg.Stats.TXPacketsReceived = int64(pb.GetTxPacketsReceived())
	return msg, nil
}
