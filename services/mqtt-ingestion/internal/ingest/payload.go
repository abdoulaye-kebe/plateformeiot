package ingest

import (
	"encoding/base64"
	"encoding/hex"
	"strings"
)

// NormalizePayloadData convertit le champ ChirpStack "data" (base64 ou hex) en hex minuscule.
func NormalizePayloadData(data string) (payloadHex string, size int, ok bool) {
	data = strings.TrimSpace(data)
	if data == "" {
		return "", 0, false
	}
	if isHexPayload(data) {
		raw, err := hex.DecodeString(data)
		if err != nil {
			return "", 0, false
		}
		return strings.ToLower(data), len(raw), true
	}
	raw, err := base64.StdEncoding.DecodeString(data)
	if err != nil {
		return "", 0, false
	}
	return hex.EncodeToString(raw), len(raw), true
}

func isHexPayload(s string) bool {
	if len(s)%2 != 0 {
		return false
	}
	for _, c := range s {
		switch {
		case c >= '0' && c <= '9':
		case c >= 'a' && c <= 'f':
		case c >= 'A' && c <= 'F':
		default:
			return false
		}
	}
	return true
}
