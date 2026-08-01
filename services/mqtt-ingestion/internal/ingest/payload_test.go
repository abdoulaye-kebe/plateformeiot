package ingest

import "testing"

func TestNormalizePayloadData_base64(t *testing.T) {
	hex, size, ok := NormalizePayloadData("JBaVnZDXFAILAABmRoAOzMAACMBiQw==")
	if !ok {
		t.Fatal("expected ok")
	}
	if size != 22 {
		t.Fatalf("size=%d want 22", size)
	}
	if hex[:2] != "24" {
		t.Fatalf("expected Shengda frame 0x24, got %s", hex[:4])
	}
}

func TestNormalizePayloadData_hex(t *testing.T) {
	hex, size, ok := NormalizePayloadData("2416999D90D7")
	if !ok {
		t.Fatal("expected ok")
	}
	if size != 6 {
		t.Fatalf("size=%d want 6", size)
	}
	if hex != "2416999d90d7" {
		t.Fatalf("got %s", hex)
	}
}
