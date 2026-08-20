package pki

import (
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
)

var cnPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,62}$`)

type Config struct {
	PKIDir          string
	ClientsDir      string
	PublicHost      string
	Port            string
	TUNGatewayIP    string
	SemtechPort     string
	BasicStationPort string
}

func LoadConfig() Config {
	return Config{
		PKIDir:           env("PKI_DIR", "/pki/easy-rsa"),
		ClientsDir:       env("CLIENTS_DIR", "/pki/clients"),
		PublicHost:       env("LNS_PUBLIC_HOST", "localhost"),
		Port:             env("OVPN_PORT", "1194"),
		TUNGatewayIP:     env("OVPN_GATEWAY_IP", "10.8.0.1"),
		SemtechPort:      env("SEMTECH_PORT", "1700"),
		BasicStationPort: env("BASICSTATION_PORT", "3001"),
	}
}

type Manager struct {
	cfg    Config
	logger *slog.Logger
}

func NewManager(cfg Config, logger *slog.Logger) *Manager {
	return &Manager{cfg: cfg, logger: logger}
}

func (m *Manager) EnsureCA() error {
	caPath := filepath.Join(m.cfg.PKIDir, "pki", "ca.crt")
	if _, err := os.Stat(caPath); err == nil {
		return nil
	}
	m.logger.Info("initializing openvpn pki")
	if err := os.MkdirAll(m.cfg.ClientsDir, 0o755); err != nil {
		return err
	}
	src := "/usr/share/easy-rsa"
	if _, err := os.Stat(src); err != nil {
		return fmt.Errorf("easy-rsa not found at %s", src)
	}
	if err := copyDir(src, m.cfg.PKIDir); err != nil {
		return err
	}
	commands := [][]string{
		{"./easyrsa", "init-pki"},
		{"./easyrsa", "--batch", "build-ca", "nopass"},
		{"./easyrsa", "--batch", "build-server-full", "server", "nopass"},
		{"./easyrsa", "gen-dh"},
	}
	for _, cmd := range commands {
		if err := m.runInPKI(cmd[0], cmd[1:]...); err != nil {
			return err
		}
	}
	taKey := filepath.Join(m.cfg.PKIDir, "pki", "ta.key")
	if _, err := os.Stat(taKey); err != nil {
		if err := exec.Command("openvpn", "--genkey", "secret", taKey).Run(); err != nil {
			return fmt.Errorf("ta.key: %w", err)
		}
	}
	return nil
}

func (m *Manager) IssueClient(cn string) ([]byte, error) {
	cn = strings.ToLower(strings.TrimSpace(cn))
	if !cnPattern.MatchString(cn) {
		return nil, fmt.Errorf("invalid common name")
	}
	if err := os.MkdirAll(m.cfg.ClientsDir, 0o755); err != nil {
		return nil, err
	}
	outPath := filepath.Join(m.cfg.ClientsDir, cn+".ovpn")
	if data, err := os.ReadFile(outPath); err == nil && len(data) > 0 {
		return data, nil
	}
	if err := m.runInPKI("./easyrsa", "--batch", "build-client-full", cn, "nopass"); err != nil {
		return nil, err
	}
	profile, err := m.renderClientProfile(cn)
	if err != nil {
		return nil, err
	}
	if err := os.WriteFile(outPath, profile, 0o600); err != nil {
		return nil, err
	}
	return profile, nil
}

func (m *Manager) RevokeClient(cn string) error {
	cn = strings.ToLower(strings.TrimSpace(cn))
	if !cnPattern.MatchString(cn) {
		return fmt.Errorf("invalid common name")
	}
	if err := m.runInPKI("./easyrsa", "--batch", "revoke", cn); err != nil {
		return err
	}
	if err := m.runInPKI("./easyrsa", "gen-crl"); err != nil {
		return err
	}
	_ = os.Remove(filepath.Join(m.cfg.ClientsDir, cn+".ovpn"))
	return nil
}

func (m *Manager) renderClientProfile(cn string) ([]byte, error) {
	pki := filepath.Join(m.cfg.PKIDir, "pki")
	ca, err := os.ReadFile(filepath.Join(pki, "ca.crt"))
	if err != nil {
		return nil, err
	}
	cert, err := os.ReadFile(filepath.Join(pki, "issued", cn+".crt"))
	if err != nil {
		return nil, err
	}
	key, err := os.ReadFile(filepath.Join(pki, "private", cn+".key"))
	if err != nil {
		return nil, err
	}
	ta, err := os.ReadFile(filepath.Join(pki, "ta.key"))
	if err != nil {
		return nil, err
	}

	var b strings.Builder
	fmt.Fprintf(&b, "# Lorawan Platform — profil OpenVPN gateway %s\n", cn)
	fmt.Fprintf(&b, "# Après connexion VPN, configurez la gateway :\n")
	fmt.Fprintf(&b, "#   Semtech UDP  → %s:%s\n", m.cfg.TUNGatewayIP, m.cfg.SemtechPort)
	fmt.Fprintf(&b, "#   Basic Station → %s:%s\n\n", m.cfg.TUNGatewayIP, m.cfg.BasicStationPort)
	fmt.Fprintf(&b, "client\ndev tun\nproto udp\nremote %s %s udp\nresolv-retry infinite\nnobind\npersist-key\npersist-tun\nremote-cert-tls server\ncipher AES-256-GCM\nauth SHA256\nverb 3\nkey-direction 1\n\n", m.cfg.PublicHost, m.cfg.Port)
	b.WriteString("<ca>\n")
	b.Write(ca)
	if !strings.HasSuffix(string(ca), "\n") {
		b.WriteString("\n")
	}
	b.WriteString("</ca>\n\n")
	b.WriteString("<cert>\n")
	b.Write(cert)
	if !strings.HasSuffix(string(cert), "\n") {
		b.WriteString("\n")
	}
	b.WriteString("</cert>\n\n")
	b.WriteString("<key>\n")
	b.Write(key)
	if !strings.HasSuffix(string(key), "\n") {
		b.WriteString("\n")
	}
	b.WriteString("</key>\n\n")
	b.WriteString("<tls-auth>\n")
	b.Write(ta)
	if !strings.HasSuffix(string(ta), "\n") {
		b.WriteString("\n")
	}
	b.WriteString("</tls-auth>\n")
	return []byte(b.String()), nil
}

func (m *Manager) runInPKI(name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.Dir = m.cfg.PKIDir
	cmd.Env = append(os.Environ(), "EASYRSA_BATCH=1")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s %v: %w — %s", name, args, err, strings.TrimSpace(string(out)))
	}
	return nil
}

func copyDir(src, dst string) error {
	if err := os.RemoveAll(dst); err != nil {
		return err
	}
	return exec.Command("cp", "-a", src, dst).Run()
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
