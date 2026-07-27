package archive

import (
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
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

type Archiver struct {
	client *minio.Client
	bucket string
	logger *slog.Logger
}

func New(cfg Config, logger *slog.Logger) (*Archiver, error) {
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
	a := &Archiver{client: client, bucket: cfg.Bucket, logger: logger}
	if err := a.ensureBucket(context.Background()); err != nil {
		return nil, err
	}
	return a, nil
}

func (a *Archiver) ensureBucket(ctx context.Context) error {
	exists, err := a.client.BucketExists(ctx, a.bucket)
	if err != nil {
		return err
	}
	if !exists {
		if err := a.client.MakeBucket(ctx, a.bucket, minio.MakeBucketOptions{}); err != nil {
			return err
		}
		a.logger.Info("minio bucket created", "bucket", a.bucket)
	}
	return nil
}

type ArchiveInput struct {
	Time          time.Time
	TenantID      *uuid.UUID
	DevEUI        string
	ApplicationID string
	GatewayID     string
	PayloadHex    string
	PayloadSize   int
	FPort         int
	FCnt          int64
	RawJSON       []byte
}

type ArchiveResult struct {
	ObjectKey string
}

func (a *Archiver) Store(ctx context.Context, in ArchiveInput) (*ArchiveResult, error) {
	tenantPart := "unknown"
	if in.TenantID != nil {
		tenantPart = in.TenantID.String()
	}
	ts := in.Time.UTC().Format("20060102T150405.000Z")
	objectKey := fmt.Sprintf("tenants/%s/devices/%s/%s.json",
		tenantPart,
		strings.ToLower(in.DevEUI),
		ts,
	)

	contentType := "application/json"
	data := in.RawJSON
	if len(data) == 0 {
		data = []byte("{}")
	}

	_, err := a.client.PutObject(ctx, a.bucket, objectKey, bytes.NewReader(data), int64(len(data)), minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return nil, err
	}
	return &ArchiveResult{ObjectKey: objectKey}, nil
}

func (a *Archiver) PresignedGet(ctx context.Context, objectKey string, expiry time.Duration) (string, error) {
	u, err := a.client.PresignedGetObject(ctx, a.bucket, objectKey, expiry, nil)
	if err != nil {
		return "", err
	}
	return u.String(), nil
}
