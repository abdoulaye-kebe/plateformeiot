package lwm2mserver

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"sync"
	"time"

	coap "github.com/plgd-dev/go-coap/v2"
	"github.com/plgd-dev/go-coap/v2/message"
	"github.com/plgd-dev/go-coap/v2/message/codes"
	"github.com/plgd-dev/go-coap/v2/mux"
	"github.com/lorawan-platform/device-connectivity/internal/ingest"
	"github.com/lorawan-platform/device-connectivity/internal/store"
)

type Server struct {
	endpoints     *store.EndpointStore
	processor     *ingest.Processor
	logger        *slog.Logger
	registrations sync.Map
}

func Start(addr string, endpoints *store.EndpointStore, processor *ingest.Processor, logger *slog.Logger) error {
	s := &Server{endpoints: endpoints, processor: processor, logger: logger}
	r := mux.NewRouter()
	r.Handle("/rd", mux.HandlerFunc(s.handleRegister))
	r.HandleFunc("/*", s.handleAny)
	logger.Info("lwm2m server listening", "addr", addr)
	return coap.ListenAndServe("udp", addr, r)
}

func (s *Server) handleRegister(w mux.ResponseWriter, r *mux.Message) {
	if r.Code != codes.POST {
		_ = w.SetResponse(codes.MethodNotAllowed, message.TextPlain, bytes.NewReader(nil))
		return
	}
	ep := endpointFromQueries(r)
	if ep == "" {
		_ = w.SetResponse(codes.BadRequest, message.TextPlain, bytes.NewReader([]byte("missing ep")))
		return
	}
	device, err := s.endpoints.GetByExternalID(context.Background(), "lwm2m", ep)
	if err != nil {
		_ = w.SetResponse(codes.Forbidden, message.TextPlain, bytes.NewReader([]byte("unknown endpoint")))
		return
	}
	regID := fmt.Sprintf("%s-%d", ep, time.Now().Unix())
	regPath := "/rd/" + regID
	s.registrations.Store(ep, regPath)
	if body := messageBody(r); len(body) > 0 {
		_ = s.processor.Handle(context.Background(), ingest.Input{
			Endpoint: device,
			Protocol: "lwm2m",
			Raw:      body,
			Metadata: map[string]any{"event": "register", "links": string(body)},
		})
	}
	var locOpts []message.Option
	for _, seg := range strings.Split(strings.Trim(regPath, "/"), "/") {
		locOpts = append(locOpts, message.Option{ID: message.LocationPath, Value: []byte(seg)})
	}
	_ = w.SetResponse(codes.Created, message.AppJSON, bytes.NewReader(nil), locOpts...)
}

func (s *Server) handleAny(w mux.ResponseWriter, r *mux.Message) {
	path, err := r.Options.Path()
	if err != nil || path == "/rd" {
		return
	}
	ep := s.endpointForPath(path)
	if ep == "" {
		if r.Code == codes.GET {
			_ = w.SetResponse(codes.NotFound, message.TextPlain, bytes.NewReader(nil))
		}
		return
	}
	device, err := s.endpoints.GetByExternalID(context.Background(), "lwm2m", ep)
	if err != nil {
		_ = w.SetResponse(codes.Forbidden, message.TextPlain, bytes.NewReader([]byte("unknown endpoint")))
		return
	}
	body := messageBody(r)
	if len(body) > 0 && (r.Code == codes.POST || r.Code == codes.PUT) {
		_ = s.processor.Handle(context.Background(), ingest.Input{
			Endpoint: device,
			Protocol: "lwm2m",
			Raw:      body,
			Metadata: map[string]any{"event": "resource", "path": path, "method": r.Code.String()},
		})
	}
	switch r.Code {
	case codes.GET:
		_ = w.SetResponse(codes.Content, message.AppJSON, bytes.NewReader([]byte(`{"status":"ok"}`)))
	case codes.POST, codes.PUT:
		_ = w.SetResponse(codes.Changed, message.AppJSON, bytes.NewReader(nil))
	case codes.DELETE:
		_ = w.SetResponse(codes.Deleted, message.AppJSON, bytes.NewReader(nil))
	default:
		_ = w.SetResponse(codes.Valid, message.AppJSON, bytes.NewReader(nil))
	}
}

func (s *Server) endpointForPath(path string) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) >= 2 && parts[0] == "rd" {
		regPath := "/" + strings.Join(parts[:2], "/")
		var found string
		s.registrations.Range(func(key, value any) bool {
			if value == regPath {
				found, _ = key.(string)
				return false
			}
			return true
		})
		return found
	}
	return ""
}

func endpointFromQueries(r *mux.Message) string {
	if r == nil || r.Message == nil {
		return ""
	}
	queries, err := r.Options.Queries()
	if err != nil {
		return ""
	}
	for _, q := range queries {
		if strings.HasPrefix(q, "ep=") {
			return strings.TrimSpace(strings.TrimPrefix(q, "ep="))
		}
	}
	return ""
}

func messageBody(r *mux.Message) []byte {
	if r == nil || r.Body == nil {
		return nil
	}
	data, err := io.ReadAll(r.Body)
	if err != nil {
		return nil
	}
	_, _ = r.Body.Seek(0, io.SeekStart)
	return data
}
