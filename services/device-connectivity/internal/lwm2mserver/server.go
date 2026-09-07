package lwm2mserver

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/plgd-dev/go-coap/v2/message"
	"github.com/plgd-dev/go-coap/v2/message/codes"
	coapNet "github.com/plgd-dev/go-coap/v2/net"
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
	mux := coapNet.NewMux()
	mux.Handle("/rd", coapNet.HandlerFunc(s.handleRegister))
	mux.HandleFunc("/*", s.handleAny)
	logger.Info("lwm2m server listening", "addr", addr)
	return coapNet.ListenAndServe("udp", addr, mux)
}

func (s *Server) handleRegister(w coapNet.ResponseWriter, r *coapNet.Message) {
	if r.Code() != codes.POST {
		_ = w.SetResponse(codes.MethodNotAllowed, message.TextPlain, nil)
		return
	}
	q, err := r.Queries()
	if err != nil {
		_ = w.SetResponse(codes.BadRequest, message.TextPlain, []byte("bad query"))
		return
	}
	ep := strings.TrimSpace(q.Get("ep"))
	if ep == "" {
		_ = w.SetResponse(codes.BadRequest, message.TextPlain, []byte("missing ep"))
		return
	}
	device, err := s.endpoints.GetByExternalID(context.Background(), "lwm2m", ep)
	if err != nil {
		_ = w.SetResponse(codes.Forbidden, message.TextPlain, []byte("unknown endpoint"))
		return
	}
	regID := fmt.Sprintf("%s-%d", ep, time.Now().Unix())
	regPath := "/rd/" + regID
	s.registrations.Store(ep, regPath)
	if body := r.Body(); len(body) > 0 {
		_ = s.processor.Handle(context.Background(), ingest.Input{
			Endpoint: device,
			Protocol: "lwm2m",
			Raw:      body,
			Metadata: map[string]any{"event": "register", "links": string(body)},
		})
	}
	_ = w.SetOption(message.LocationPath, strings.Split(strings.Trim(regPath, "/"), "/"))
	_ = w.SetResponse(codes.Created, message.AppJSON, nil)
}

func (s *Server) handleAny(w coapNet.ResponseWriter, r *coapNet.Message) {
	path := r.Path()
	if path == "/rd" {
		return
	}
	ep := s.endpointForPath(path)
	if ep == "" {
		if r.Code() == codes.GET {
			_ = w.SetResponse(codes.NotFound, message.TextPlain, nil)
		}
		return
	}
	device, err := s.endpoints.GetByExternalID(context.Background(), "lwm2m", ep)
	if err != nil {
		_ = w.SetResponse(codes.Forbidden, message.TextPlain, []byte("unknown endpoint"))
		return
	}
	body := r.Body()
	if len(body) > 0 && (r.Code() == codes.POST || r.Code() == codes.PUT) {
		_ = s.processor.Handle(context.Background(), ingest.Input{
			Endpoint: device,
			Protocol: "lwm2m",
			Raw:      body,
			Metadata: map[string]any{"event": "resource", "path": path, "method": r.Code().String()},
		})
	}
	switch r.Code() {
	case codes.GET:
		_ = w.SetResponse(codes.Content, message.AppJSON, []byte(`{"status":"ok"}`))
	case codes.POST, codes.PUT:
		_ = w.SetResponse(codes.Changed, message.AppJSON, nil)
	case codes.DELETE:
		_ = w.SetResponse(codes.Deleted, message.AppJSON, nil)
	default:
		_ = w.SetResponse(codes.Valid, message.AppJSON, nil)
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
