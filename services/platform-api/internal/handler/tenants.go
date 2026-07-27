package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/lorawan-platform/platform-api/internal/keycloak"
	"github.com/lorawan-platform/platform-api/internal/store"
)

type createTenantRequest struct {
	Name                string  `json:"name"`
	Slug                string  `json:"slug"`
	Plan                string  `json:"plan"`
	ChirpStackTenantID  *string `json:"chirpstackTenantId"`
	ProvisionChirpStack bool    `json:"provisionChirpstack"`
	ProvisionKeycloak   bool    `json:"provisionKeycloak"`
	AdminEmail          string  `json:"adminEmail"`
	AdminUsername       string  `json:"adminUsername"`
	AdminPassword       string  `json:"adminPassword"`
	AdminRole           string  `json:"adminRole"`
}

type createTenantResponse struct {
	ID                 uuid.UUID                `json:"id"`
	Name               string                   `json:"name"`
	Slug               string                   `json:"slug"`
	ChirpStackTenantID *string                  `json:"chirpstackTenantId,omitempty"`
	Plan               string                   `json:"plan"`
	Status             string                   `json:"status"`
	CreatedAt          any                      `json:"createdAt"`
	ProvisionedUser    *keycloak.ProvisionedUser `json:"provisionedUser,omitempty"`
	KeycloakError      string                   `json:"keycloakError,omitempty"`
}

func (d Deps) createTenant(w http.ResponseWriter, r *http.Request) {
	var req createTenantRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if req.Name == "" || req.Slug == "" {
		if req.Slug == "" && req.Name != "" {
			req.Slug = slugify(req.Name)
		}
	}
	if req.Name == "" || req.Slug == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.Plan == "" {
		req.Plan = "starter"
	}
	if req.ProvisionKeycloak && req.AdminEmail == "" {
		req.AdminEmail = fmt.Sprintf("%s-admin@lorawan.local", strings.ToLower(req.Slug))
	}
	if req.AdminRole == "" {
		req.AdminRole = "tenant-admin"
	}

	if existing, err := d.TenantStore.GetBySlug(r.Context(), req.Slug); err == nil {
		writeJSON(w, http.StatusConflict, map[string]any{
			"error": fmt.Sprintf("le tenant « %s » existe déjà (slug %s)", existing.Name, existing.Slug),
			"existingTenant": existing,
		})
		return
	} else if !errors.Is(err, store.ErrTenantNotFound) {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	csTenantID := req.ChirpStackTenantID
	maxDevices, maxGateways := 50, 5
	if plan, err := d.Plans.Get(r.Context(), req.Plan); err == nil && plan != nil {
		maxDevices = plan.MaxDevices
		maxGateways = plan.MaxGateways
	}
	if req.ProvisionChirpStack && d.ChirpStackConfigured && csTenantID == nil {
		created, err := d.ChirpStack.CreateTenant(r.Context(), req.Name, maxDevices, maxGateways)
		if err != nil {
			msg := "chirpstack tenant: " + err.Error()
			if strings.Contains(err.Error(), "401") {
				msg += " — utilisez une clé API ChirpStack globale (admin), pas une clé tenant : ./scripts/setup-chirpstack.sh"
			}
			writeError(w, http.StatusBadGateway, msg)
			return
		}
		if tenantObj, ok := created["id"].(string); ok {
			csTenantID = &tenantObj
		} else if tenantWrap, ok := created["tenant"].(map[string]any); ok {
			if id, ok := tenantWrap["id"].(string); ok {
				csTenantID = &id
			}
		}
	}

	if req.ProvisionKeycloak && csTenantID == nil {
		writeError(w, http.StatusBadRequest, "chirpstack tenant id required for keycloak provisioning (enable provisionChirpstack or set chirpstackTenantId)")
		return
	}

	tenant, err := d.TenantStore.Create(r.Context(), req.Name, req.Slug, req.Plan, csTenantID)
	if err != nil {
		if csTenantID != nil && req.ProvisionChirpStack && d.ChirpStackConfigured {
			_ = d.ChirpStack.DeleteTenant(r.Context(), *csTenantID)
		}
		if strings.Contains(err.Error(), "tenants_slug_key") {
			writeError(w, http.StatusConflict, fmt.Sprintf("le slug « %s » est déjà utilisé", req.Slug))
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if csTenantID != nil && d.ChirpStackConfigured {
		apps, err := d.ChirpStack.ListApplications(r.Context(), *csTenantID, 100)
		if err == nil {
			if items, ok := apps["result"].([]any); ok {
				var mapped []map[string]any
				for _, item := range items {
					if m, ok := item.(map[string]any); ok {
						mapped = append(mapped, m)
					}
				}
				_ = d.TenantResources.SyncApplicationsFromChirpStack(r.Context(), tenant.ID, mapped)
			}
		}
	}

	resp := createTenantResponse{
		ID:                 tenant.ID,
		Name:               tenant.Name,
		Slug:               tenant.Slug,
		ChirpStackTenantID: tenant.ChirpStackTenantID,
		Plan:               tenant.Plan,
		Status:             tenant.Status,
		CreatedAt:          tenant.CreatedAt,
	}

	if req.ProvisionKeycloak && d.Keycloak != nil && d.Keycloak.Configured() && csTenantID != nil {
		user, err := d.provisionKeycloakMember(r.Context(), tenant.ID, *csTenantID, keycloak.ProvisionInput{
			Email:    req.AdminEmail,
			Username: req.AdminUsername,
			Password: req.AdminPassword,
			Role:     req.AdminRole,
		})
		if err != nil {
			d.Logger.Error("keycloak provisioning failed", "tenant", tenant.Slug, "error", err)
			resp.KeycloakError = err.Error()
		} else {
			resp.ProvisionedUser = user
		}
	}

	writeJSON(w, http.StatusCreated, resp)
}

func (d Deps) getTenant(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid tenant id")
		return
	}
	tenant, err := d.TenantStore.GetByID(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "tenant not found")
		return
	}
	writeJSON(w, http.StatusOK, tenant)
}

func (d Deps) myTenant(w http.ResponseWriter, r *http.Request) {
	csID := d.effectiveTenantID(r)
	if csID == "" {
		writeError(w, http.StatusNotFound, "no tenant in session")
		return
	}
	tenant, err := d.TenantStore.GetByChirpStackTenantID(r.Context(), csID)
	if err != nil {
		writeError(w, http.StatusNotFound, "tenant not found")
		return
	}
	plan, _ := d.Plans.Get(r.Context(), tenant.Plan)
	writeJSON(w, http.StatusOK, tenantPublic(tenant, plan))
}

type createTenantMemberRequest struct {
	Email     string `json:"email"`
	Username  string `json:"username"`
	Password  string `json:"password"`
	Role      string `json:"role"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	SendInvite bool  `json:"sendInvite"`
}

type createTenantMemberResponse struct {
	Member          store.TenantMember      `json:"member"`
	ProvisionedUser *keycloak.ProvisionedUser `json:"provisionedUser"`
}

func (d Deps) provisionKeycloakMember(ctx context.Context, tenantID uuid.UUID, csTenantID string, in keycloak.ProvisionInput) (*keycloak.ProvisionedUser, error) {
	if d.Keycloak == nil || !d.Keycloak.Configured() {
		return nil, fmt.Errorf("keycloak admin not configured")
	}
	if csTenantID == "" {
		return nil, fmt.Errorf("tenant has no chirpstack id")
	}
	in.ChirpStackTenantID = csTenantID
	user, err := d.Keycloak.ProvisionTenantUser(ctx, in)
	if err != nil {
		return nil, err
	}
	if d.TenantMembers != nil {
		if _, err := d.TenantMembers.Create(ctx, tenantID, user.KeycloakUserID, user.Email, user.Role); err != nil {
			d.Logger.Error("tenant_members insert failed", "tenantId", tenantID.String(), "error", err)
		}
	}
	return user, nil
}

func (d Deps) createTenantMember(w http.ResponseWriter, r *http.Request) {
	tenantID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid tenant id")
		return
	}

	var req createTenantMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if req.Email == "" {
		writeError(w, http.StatusBadRequest, "email is required")
		return
	}
	if req.Role == "" {
		req.Role = "operator"
	}
	if !keycloak.ValidTenantRole(req.Role) {
		writeError(w, http.StatusBadRequest, "role must be tenant-admin, operator, or viewer")
		return
	}

	tenant, err := d.TenantStore.GetByID(r.Context(), tenantID)
	if err != nil {
		writeError(w, http.StatusNotFound, "tenant not found")
		return
	}
	if tenant.ChirpStackTenantID == nil || *tenant.ChirpStackTenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant has no chirpstack id — cannot provision keycloak user")
		return
	}

	user, err := d.provisionKeycloakMember(r.Context(), tenant.ID, *tenant.ChirpStackTenantID, keycloak.ProvisionInput{
		Email:           req.Email,
		Username:        req.Username,
		Password:        req.Password,
		Role:            req.Role,
		FirstName:       req.FirstName,
		LastName:        req.LastName,
		SendInvite:      req.SendInvite,
		ConsoleClientID: "lorawan-console",
		RedirectURI:     d.KeycloakConsoleURL + "/login",
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, "keycloak: "+err.Error())
		return
	}

	members, _ := d.TenantMembers.ListByTenant(r.Context(), tenantID)
	var member store.TenantMember
	for _, m := range members {
		if m.KeycloakUserID == user.KeycloakUserID {
			member = m
			break
		}
	}

	writeJSON(w, http.StatusCreated, createTenantMemberResponse{
		Member:          member,
		ProvisionedUser: user,
	})
}

func (d Deps) listTenantMembers(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid tenant id")
		return
	}
	if d.TenantMembers == nil {
		writeJSON(w, http.StatusOK, map[string]any{"result": []any{}})
		return
	}
	members, err := d.TenantMembers.ListByTenant(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"result": members})
}

type updateTenantStatusRequest struct {
	Status string `json:"status"`
}

func (d Deps) updateTenantStatus(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid tenant id")
		return
	}
	var req updateTenantStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if req.Status != "active" && req.Status != "suspended" {
		writeError(w, http.StatusBadRequest, "status must be active or suspended")
		return
	}
	if err := d.TenantStore.UpdateStatus(r.Context(), id, req.Status); err != nil {
		writeError(w, http.StatusNotFound, "tenant not found")
		return
	}
	tenant, _ := d.TenantStore.GetByID(r.Context(), id)
	writeJSON(w, http.StatusOK, tenant)
}

func (d Deps) deleteTenant(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid tenant id")
		return
	}
	tenant, err := d.TenantStore.GetByID(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "tenant not found")
		return
	}
	if tenant.Slug == "chirpstack-default" {
		writeError(w, http.StatusBadRequest, "cannot delete default tenant")
		return
	}
	if tenant.ChirpStackTenantID != nil && d.ChirpStackConfigured {
		_ = d.ChirpStack.DeleteTenant(r.Context(), *tenant.ChirpStackTenantID)
	}
	if err := d.TenantStore.Delete(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func slugify(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	var b strings.Builder
	prevDash := false
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			prevDash = false
			continue
		}
		if !prevDash {
			b.WriteByte('-')
			prevDash = true
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return "tenant"
	}
	if len(out) > 48 {
		return out[:48]
	}
	return out
}
