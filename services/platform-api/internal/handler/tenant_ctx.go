package handler

import (
	"context"
	"fmt"
	"net/http"

	"github.com/google/uuid"
	"github.com/lorawan-platform/platform-api/internal/auth"
	"github.com/lorawan-platform/platform-api/internal/store"
)

func (d Deps) effectiveTenantID(r *http.Request) string {
	user, ok := auth.UserFromContext(r.Context())
	if ok && user.TenantID != "" {
		return user.TenantID
	}
	if d.AuthEnabled {
		return ""
	}
	return d.TenantID
}

func (d Deps) platformTenantID(ctx context.Context, r *http.Request) (*uuid.UUID, bool) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok || user.TenantID == "" {
		return nil, false
	}
	tenant, err := d.TenantStore.GetByChirpStackTenantID(ctx, user.TenantID)
	if err != nil {
		return nil, false
	}
	return &tenant.ID, true
}

func (d Deps) requirePlatformAdmin(w http.ResponseWriter, r *http.Request) bool {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		return !d.AuthEnabled
	}
	for _, role := range user.Roles {
		if role == "platform-admin" {
			return true
		}
	}
	writeError(w, http.StatusForbidden, "platform-admin required")
	return false
}

func hasAnyRole(user *auth.User, roles ...string) bool {
	for _, want := range roles {
		for _, have := range user.Roles {
			if have == want {
				return true
			}
		}
	}
	return false
}

func (d Deps) canWriteLoRaWAN(r *http.Request) bool {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		return !d.AuthEnabled
	}
	return hasAnyRole(user, "platform-admin", "tenant-admin", "operator")
}

// dataTenantScope retourne le tenant plateforme pour analytics/NOC/billing/rules.
// Les clients doivent avoir un tenant ; platform-admin peut filtrer via ?tenantId=.
func (d Deps) dataTenantScope(w http.ResponseWriter, r *http.Request) (*uuid.UUID, bool) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		if d.AuthEnabled {
			writeError(w, http.StatusUnauthorized, "authentication required")
			return nil, false
		}
		return nil, true
	}

	if hasAnyRole(user, "platform-admin") {
		if q := r.URL.Query().Get("tenantId"); q != "" {
			id, err := uuid.Parse(q)
			if err != nil {
				writeError(w, http.StatusBadRequest, "invalid tenantId")
				return nil, false
			}
			if err := d.assertTenantActive(w, r.Context(), id); err != nil {
				return nil, false
			}
			return &id, true
		}
		if tid, ok := d.platformTenantID(r.Context(), r); ok {
			if err := d.assertTenantActive(w, r.Context(), *tid); err != nil {
				return nil, false
			}
			return tid, true
		}
		writeError(w, http.StatusBadRequest, "tenantId required for platform-admin")
		return nil, false
	}

	tid, ok := d.platformTenantID(r.Context(), r)
	if !ok {
		writeError(w, http.StatusForbidden, "tenant not assigned to user")
		return nil, false
	}
	if err := d.assertTenantActive(w, r.Context(), *tid); err != nil {
		return nil, false
	}
	return tid, true
}

func (d Deps) rulesTenantScope(w http.ResponseWriter, r *http.Request) (*uuid.UUID, bool) {
	return d.dataTenantScope(w, r)
}

func (d Deps) resolveTenantForList(ctx context.Context, r *http.Request) ([]store.Tenant, error) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		return d.TenantStore.List(ctx)
	}
	if hasAnyRole(user, "platform-admin") {
		return d.TenantStore.List(ctx)
	}
	if user.TenantID == "" {
		return []store.Tenant{}, nil
	}
	t, err := d.TenantStore.GetByChirpStackTenantID(ctx, user.TenantID)
	if err != nil {
		return []store.Tenant{}, nil
	}
	return []store.Tenant{t}, nil
}

func (d Deps) requireChirpStackTenant(w http.ResponseWriter, r *http.Request) (string, bool) {
	csID := d.effectiveTenantID(r)
	if csID == "" {
		writeError(w, http.StatusForbidden, "tenant not assigned")
		return "", false
	}
	return csID, true
}

func (d Deps) assertTenantActive(w http.ResponseWriter, ctx context.Context, platformTenantID uuid.UUID) error {
	tenant, err := d.TenantStore.GetByID(ctx, platformTenantID)
	if err != nil {
		writeError(w, http.StatusForbidden, "tenant not found")
		return err
	}
	if tenant.Status == "suspended" {
		writeError(w, http.StatusForbidden, "tenant suspended")
		return fmt.Errorf("tenant suspended")
	}
	return nil
}
