package handler

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/lorawan-platform/platform-api/internal/store"
)

func normalizePayloadHex(payload string) (string, error) {
	raw := strings.TrimSpace(strings.ReplaceAll(payload, " ", ""))
	if raw == "" {
		return "", fmt.Errorf("payload vide")
	}
	if _, err := hex.DecodeString(raw); err == nil && len(raw)%2 == 0 {
		return strings.ToLower(raw), nil
	}
	b, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return "", fmt.Errorf("payload invalide")
	}
	return hex.EncodeToString(b), nil
}

func (d Deps) decodeShengdaPayload(ctx context.Context, payload string) (map[string]any, error) {
	normalized, err := normalizePayloadHex(payload)
	if err != nil {
		return nil, err
	}
	body, _ := json.Marshal(map[string]string{"hex": normalized})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, shengdaWaterURL()+"/decode", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("decode %s: %s", resp.Status, string(raw))
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func formatDecodePreview(decoded map[string]any) string {
	if decoded == nil {
		return ""
	}
	parts := []string{}
	if v, ok := decoded["indexM3"]; ok && v != nil {
		parts = append(parts, fmt.Sprintf("%v m³", v))
	}
	if v, ok := decoded["valveOpen"]; ok && v != nil {
		if open, ok := v.(bool); ok {
			if open {
				parts = append(parts, "vanne ouverte")
			} else {
				parts = append(parts, "vanne fermée")
			}
		}
	}
	if v, ok := decoded["batteryV"]; ok && v != nil {
		parts = append(parts, fmt.Sprintf("%v V", v))
	}
	if len(parts) > 0 {
		return strings.Join(parts, " · ")
	}
	if v, ok := decoded["vendor"]; ok && v != nil {
		return fmt.Sprintf("%v", v)
	}
	return ""
}

type dataMessageRow struct {
	store.PayloadRecord
	Decoded       map[string]any `json:"decoded,omitempty"`
	DecodePreview string         `json:"decodePreview,omitempty"`
}
