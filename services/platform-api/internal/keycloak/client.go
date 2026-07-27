package keycloak

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"path"
	"strings"
	"sync"
	"time"
)

type Config struct {
	AdminURL  string
	Realm     string
	AdminUser string
	AdminPass string
}

type Client struct {
	cfg        Config
	httpClient *http.Client
	mu         sync.Mutex
	token      string
	tokenExp   time.Time
}

type ProvisionedUser struct {
	KeycloakUserID    string `json:"keycloakUserId"`
	Email             string `json:"email"`
	Username          string `json:"username"`
	Role              string `json:"role"`
	TemporaryPassword string `json:"temporaryPassword,omitempty"`
	InviteEmailSent   bool   `json:"inviteEmailSent,omitempty"`
	InviteEmailError  string `json:"inviteEmailError,omitempty"`
}

type ProvisionInput struct {
	Email              string
	Username           string
	Password           string
	Role               string
	FirstName          string
	LastName           string
	ChirpStackTenantID string
	SendInvite         bool
	ConsoleClientID    string
	RedirectURI        string
}

func NewClient(cfg Config) *Client {
	return &Client{
		cfg: cfg,
		httpClient: &http.Client{
			Timeout: 20 * time.Second,
		},
	}
}

func (c *Client) Configured() bool {
	return c.cfg.AdminURL != "" && c.cfg.Realm != "" && c.cfg.AdminUser != "" && c.cfg.AdminPass != ""
}

var tenantRoles = map[string]struct{}{
	"tenant-admin": {},
	"operator":     {},
	"viewer":       {},
}

func ValidTenantRole(role string) bool {
	_, ok := tenantRoles[role]
	return ok
}

func (c *Client) ProvisionTenantUser(ctx context.Context, in ProvisionInput) (*ProvisionedUser, error) {
	if !c.Configured() {
		return nil, fmt.Errorf("keycloak admin not configured")
	}
	if in.ChirpStackTenantID == "" {
		return nil, fmt.Errorf("chirpstack tenant id required")
	}
	if in.Email == "" {
		return nil, fmt.Errorf("email required")
	}
	if in.Role == "" {
		in.Role = "tenant-admin"
	}
	if !ValidTenantRole(in.Role) {
		return nil, fmt.Errorf("invalid role: %s (allowed: tenant-admin, operator, viewer)", in.Role)
	}
	if in.Username == "" {
		in.Username = strings.NewReplacer("@", "_", ".", "_").Replace(in.Email)
	}
	if in.FirstName == "" {
		switch in.Role {
		case "operator":
			in.FirstName = "Operator"
		case "viewer":
			in.FirstName = "Viewer"
		default:
			in.FirstName = "Admin"
		}
	}
	if in.LastName == "" {
		in.LastName = in.Username
	}
	tempPassword := in.Password == ""
	password := in.Password
	if password == "" {
		var err error
		password, err = randomPassword(16)
		if err != nil {
			return nil, err
		}
	}
	credentialTemporary := false
	emailVerified := true
	if in.SendInvite {
		credentialTemporary = true
		emailVerified = false
	}

	token, err := c.adminToken(ctx)
	if err != nil {
		return nil, err
	}

	if existing, err := c.findUserByEmail(ctx, token, in.Email); err != nil {
		return nil, err
	} else if existing != "" {
		return nil, fmt.Errorf("keycloak user already exists: %s", in.Email)
	}

	userID, err := c.createUser(ctx, token, in, password, credentialTemporary, emailVerified)
	if err != nil {
		return nil, err
	}

	if err := c.assignRealmRole(ctx, token, userID, in.Role); err != nil {
		return nil, fmt.Errorf("assign role: %w", err)
	}

	if in.SendInvite {
		if err := c.SendInvitationEmail(ctx, userID, in.ConsoleClientID, in.RedirectURI); err != nil {
			return &ProvisionedUser{
				KeycloakUserID:   userID,
				Email:            in.Email,
				Username:         in.Username,
				Role:             in.Role,
				InviteEmailError: err.Error(),
			}, nil
		}
	}

	out := &ProvisionedUser{
		KeycloakUserID: userID,
		Email:          in.Email,
		Username:       in.Username,
		Role:           in.Role,
	}
	if in.SendInvite {
		out.InviteEmailSent = true
	}
	if tempPassword && !in.SendInvite {
		out.TemporaryPassword = password
	}
	return out, nil
}

func (c *Client) adminToken(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.token != "" && time.Now().Before(c.tokenExp.Add(-30*time.Second)) {
		return c.token, nil
	}

	form := url.Values{}
	form.Set("grant_type", "password")
	form.Set("client_id", "admin-cli")
	form.Set("username", c.cfg.AdminUser)
	form.Set("password", c.cfg.AdminPass)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		strings.TrimRight(c.cfg.AdminURL, "/")+"/realms/master/protocol/openid-connect/token",
		strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("keycloak token %s: %s", resp.Status, string(body))
	}

	var parsed struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", err
	}
	if parsed.AccessToken == "" {
		return "", fmt.Errorf("empty keycloak access token")
	}

	c.token = parsed.AccessToken
	if parsed.ExpiresIn > 0 {
		c.tokenExp = time.Now().Add(time.Duration(parsed.ExpiresIn) * time.Second)
	} else {
		c.tokenExp = time.Now().Add(5 * time.Minute)
	}
	return c.token, nil
}

func (c *Client) adminBase() string {
	return strings.TrimRight(c.cfg.AdminURL, "/") + "/admin/realms/" + url.PathEscape(c.cfg.Realm)
}

func (c *Client) findUserByEmail(ctx context.Context, token, email string) (string, error) {
	q := url.Values{}
	q.Set("email", email)
	q.Set("exact", "true")

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.adminBase()+"/users?"+q.Encode(), nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("keycloak search user %s: %s", resp.Status, string(body))
	}

	var users []struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &users); err != nil {
		return "", err
	}
	if len(users) > 0 {
		return users[0].ID, nil
	}
	return "", nil
}

func (c *Client) createUser(ctx context.Context, token string, in ProvisionInput, password string, temporary, emailVerified bool) (string, error) {
	payload := map[string]any{
		"username":      in.Username,
		"email":         in.Email,
		"firstName":     in.FirstName,
		"lastName":      in.LastName,
		"enabled":       true,
		"emailVerified": emailVerified,
		"attributes": map[string][]string{
			"tenant_id": {in.ChirpStackTenantID},
		},
		"credentials": []map[string]any{{
			"type":      "password",
			"value":     password,
			"temporary": temporary,
		}},
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.adminBase()+"/users", bytes.NewReader(b))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("keycloak create user %s: %s", resp.Status, string(body))
	}

	loc := resp.Header.Get("Location")
	if loc == "" {
		return "", fmt.Errorf("keycloak create user: missing Location header")
	}
	userID := path.Base(loc)
	if userID == "" || userID == "." {
		return "", fmt.Errorf("keycloak create user: invalid user id from Location")
	}
	return userID, nil
}

func (c *Client) assignRealmRole(ctx context.Context, token, userID, roleName string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.adminBase()+"/roles/"+url.PathEscape(roleName), nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("keycloak get role %s: %s", resp.Status, string(body))
	}

	var role map[string]any
	if err := json.Unmarshal(body, &role); err != nil {
		return err
	}

	b, err := json.Marshal([]map[string]any{role})
	if err != nil {
		return err
	}

	req, err = http.NewRequestWithContext(ctx, http.MethodPost,
		c.adminBase()+"/users/"+url.PathEscape(userID)+"/role-mappings/realm",
		bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err = c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("keycloak assign role %s: %s", resp.Status, string(body))
	}
	return nil
}

func (c *Client) SendInvitationEmail(ctx context.Context, userID, clientID, redirectURI string) error {
	if !c.Configured() {
		return fmt.Errorf("keycloak admin not configured")
	}
	token, err := c.adminToken(ctx)
	if err != nil {
		return err
	}
	if clientID == "" {
		clientID = "lorawan-console"
	}
	q := url.Values{}
	q.Set("client_id", clientID)
	if redirectURI != "" {
		q.Set("redirect_uri", redirectURI)
	}
	body := []byte(`["UPDATE_PASSWORD"]`)
	req, err := http.NewRequestWithContext(ctx, http.MethodPut,
		c.adminBase()+"/users/"+url.PathEscape(userID)+"/execute-actions-email?"+q.Encode(),
		bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		raw, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("keycloak invite email %s: %s", resp.Status, string(raw))
	}
	return nil
}

func randomPassword(length int) (string, error) {
	const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	out := make([]byte, length)
	for i := range out {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(chars))))
		if err != nil {
			return "", err
		}
		out[i] = chars[n.Int64()]
	}
	return string(out), nil
}
