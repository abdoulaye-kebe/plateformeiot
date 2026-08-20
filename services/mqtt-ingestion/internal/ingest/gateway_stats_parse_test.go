package ingest

import (
	"testing"
	"time"

	gw "github.com/chirpstack/chirpstack/api/go/v4/gw"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func TestParseGatewayStatsJSON(t *testing.T) {
	payload := []byte(`{"gatewayId":"abc123","stats":{"rxPacketsReceived":10,"txPacketsReceived":2}}`)
	msg, err := parseGatewayStats("eu868/gateway/abc123/event/stats", payload)
	if err != nil {
		t.Fatal(err)
	}
	if msg.GatewayID != "abc123" || msg.Stats.RXPacketsReceived != 10 {
		t.Fatalf("unexpected msg: %+v", msg)
	}
}

func TestParseGatewayStatsProtobuf(t *testing.T) {
	now := time.Now().UTC()
	pb := &gw.GatewayStats{
		GatewayId:         "2cf7f11075000140",
		Time:              timestamppb.New(now),
		RxPacketsReceived: 42,
		TxPacketsReceived: 3,
	}
	payload, err := proto.Marshal(pb)
	if err != nil {
		t.Fatal(err)
	}
	msg, err := parseGatewayStats("eu868/gateway/2cf7f11075000140/event/stats", payload)
	if err != nil {
		t.Fatal(err)
	}
	if msg.GatewayID != "2cf7f11075000140" {
		t.Fatalf("gatewayId=%q", msg.GatewayID)
	}
	if msg.Stats.RXPacketsReceived != 42 || msg.Stats.TXPacketsReceived != 3 {
		t.Fatalf("stats=%+v", msg.Stats)
	}
}
