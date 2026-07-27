package handler

import (
	"net/http"
	"strings"

	"github.com/lorawan-platform/platform-api/internal/auth"
	"github.com/lorawan-platform/platform-api/internal/store"
)

func (d Deps) combinedAuth(next http.Handler) http.Handler {
	jwtHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if d.Auth != nil {
			d.Auth.Middleware()(next).ServeHTTP(w, r)
			return
		}
		next.ServeHTTP(w, r)
	})

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		apiKey := strings.TrimSpace(r.Header.Get("X-API-Key"))
		if apiKey == "" {
			if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer lwp_") {
				apiKey = strings.TrimPrefix(h, "Bearer ")
			}
		}
		if apiKey != "" && d.APIKeys != nil {
			validated, err := d.APIKeys.Validate(r.Context(), apiKey)
			if err != nil {
				writeError(w, http.StatusUnauthorized, "invalid api key")
				return
			}
			tenant, err := d.TenantStore.GetByID(r.Context(), validated.TenantID)
			if err != nil {
				writeError(w, http.StatusForbidden, "tenant not found")
				return
			}
			if tenant.Status == "suspended" {
				writeError(w, http.StatusForbidden, "tenant suspended")
				return
			}
			csID := ""
			if tenant.ChirpStackTenantID != nil {
				csID = *tenant.ChirpStackTenantID
			}
			user := &auth.User{
				Subject:  "api-key:" + validated.KeyID.String(),
				Email:    "api-key@" + tenant.Slug,
				Roles:    store.ScopesToRoles(validated.Scopes),
				TenantID: csID,
			}
			ctx := r.Context()
			ctx = auth.WithUser(ctx, user)
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}
		jwtHandler(w, r)
	})
}
