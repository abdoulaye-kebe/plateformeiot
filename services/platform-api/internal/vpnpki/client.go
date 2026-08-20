package vpnpki

import (
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Client struct {
	baseURL    string
	httpClient *http.Client
}

func NewClient(baseURL string) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{
			Timeout: 60 * time.Second,
		},
	}
}

func (c *Client) Enabled() bool {
	return c != nil && c.baseURL != ""
}

func (c *Client) IssueProfile(gatewayID string) ([]byte, error) {
	if !c.Enabled() {
		return nil, fmt.Errorf("vpn-pki not configured")
	}
	req, err := http.NewRequest(http.MethodPost, c.baseURL+"/clients/"+gatewayID, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("vpn-pki: %s", strings.TrimSpace(string(body)))
	}
	return body, nil
}

func (c *Client) Revoke(gatewayID string) error {
	if !c.Enabled() {
		return fmt.Errorf("vpn-pki not configured")
	}
	req, err := http.NewRequest(http.MethodDelete, c.baseURL+"/clients/"+gatewayID, nil)
	if err != nil {
		return err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("vpn-pki: %s", strings.TrimSpace(string(body)))
	}
	return nil
}
