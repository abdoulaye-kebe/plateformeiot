package objectstore

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type Config struct {
	Endpoint  string
	AccessKey string
	SecretKey string
	Bucket    string
	UseSSL    bool
}

type Client struct {
	client *minio.Client
	bucket string
	logger *slog.Logger
}

func New(cfg Config, logger *slog.Logger) (*Client, error) {
	if cfg.Endpoint == "" || cfg.AccessKey == "" {
		return nil, fmt.Errorf("minio not configured")
	}
	if cfg.Bucket == "" {
		cfg.Bucket = "lorawan-payloads"
	}
	client, err := minio.New(cfg.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: cfg.UseSSL,
	})
	if err != nil {
		return nil, err
	}
	c := &Client{client: client, bucket: cfg.Bucket, logger: logger}
	if err := c.ensureBucket(context.Background()); err != nil {
		return nil, err
	}
	return c, nil
}

func (c *Client) Configured() bool { return c != nil && c.client != nil }

func (c *Client) ensureBucket(ctx context.Context) error {
	exists, err := c.client.BucketExists(ctx, c.bucket)
	if err != nil {
		return err
	}
	if !exists {
		return c.client.MakeBucket(ctx, c.bucket, minio.MakeBucketOptions{})
	}
	return nil
}

func (c *Client) PresignedGet(ctx context.Context, objectKey string, expiry time.Duration) (string, error) {
	u, err := c.client.PresignedGetObject(ctx, c.bucket, objectKey, expiry, nil)
	if err != nil {
		return "", err
	}
	return u.String(), nil
}

func (c *Client) PutFirmware(ctx context.Context, tenantID, name string, reader io.Reader, size int64, contentType string) (string, error) {
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	objectKey := fmt.Sprintf("firmware/%s/%s-%d.bin", tenantID, sanitize(name), time.Now().Unix())
	_, err := c.client.PutObject(ctx, c.bucket, objectKey, reader, size, minio.PutObjectOptions{ContentType: contentType})
	if err != nil {
		return "", err
	}
	return objectKey, nil
}

func sanitize(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.NewReplacer(" ", "-", "/", "-", "\\", "-").Replace(s)
	if s == "" {
		return "firmware"
	}
	return s
}
