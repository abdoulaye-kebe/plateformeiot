package auth

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
)

type contextKey string

const UserContextKey contextKey = "authUser"

type User struct {
	Subject  string
	Email    string
	Roles    []string
	TenantID string
}

type Validator struct {
	jwks     keyfunc.Keyfunc
	issuer   string
	jwksURL  string
	required bool
	enabled  bool
	initOnce sync.Once
	initErr  error
}

func NewValidator(jwksURL, issuer string, enabled, required bool) *Validator {
	return &Validator{jwksURL: jwksURL, issuer: issuer, required: required, enabled: enabled}
}

func (v *Validator) init(ctx context.Context) error {
	v.initOnce.Do(func() {
		v.jwks, v.initErr = keyfunc.NewDefaultCtx(ctx, []string{v.jwksURL})
	})
	return v.initErr
}

func (v *Validator) Middleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !v.enabled {
				next.ServeHTTP(w, r)
				return
			}

			tokenStr := extractBearer(r.Header.Get("Authorization"))
			if tokenStr == "" {
				if v.required {
					http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
					return
				}
				next.ServeHTTP(w, r)
				return
			}

			if err := v.init(r.Context()); err != nil {
				http.Error(w, fmt.Sprintf(`{"error":"jwks: %s"}`, err.Error()), http.StatusInternalServerError)
				return
			}

			user, err := v.parseToken(tokenStr)
			if err != nil {
				http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
				return
			}

			ctx := context.WithValue(r.Context(), UserContextKey, user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func (v *Validator) parseToken(tokenStr string) (*User, error) {
	token, err := jwt.Parse(tokenStr, v.jwks.Keyfunc, jwt.WithIssuer(v.issuer))
	if err != nil || !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, fmt.Errorf("invalid claims")
	}

	user := &User{}
	if sub, ok := claims["sub"].(string); ok && sub != "" {
		user.Subject = sub
	} else if un, ok := claims["preferred_username"].(string); ok {
		user.Subject = un
	} else {
		user.Subject = fmt.Sprintf("%v", claims["sub"])
	}
	if email, ok := claims["email"].(string); ok {
		user.Email = email
	}
	if tid, ok := claims["tenant_id"].(string); ok {
		user.TenantID = tid
	}
	user.Roles = extractRoles(claims)
	return user, nil
}

func UserFromContext(ctx context.Context) (*User, bool) {
	u, ok := ctx.Value(UserContextKey).(*User)
	return u, ok
}

func WithUser(ctx context.Context, user *User) context.Context {
	return context.WithValue(ctx, UserContextKey, user)
}

func RequireRoles(roles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user, ok := UserFromContext(r.Context())
			if !ok {
				next.ServeHTTP(w, r)
				return
			}
			if hasRole(user.Roles, "platform-admin") {
				next.ServeHTTP(w, r)
				return
			}
			for _, want := range roles {
				if hasRole(user.Roles, want) {
					next.ServeHTTP(w, r)
					return
				}
			}
			http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		})
	}
}

func hasRole(roles []string, want string) bool {
	for _, r := range roles {
		if r == want {
			return true
		}
	}
	return false
}

func extractBearer(h string) string {
	if h == "" {
		return ""
	}
	parts := strings.SplitN(h, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return parts[1]
}

func extractRoles(claims jwt.MapClaims) []string {
	var roles []string
	if ra, ok := claims["realm_access"].(map[string]any); ok {
		if list, ok := ra["roles"].([]any); ok {
			for _, item := range list {
				if s, ok := item.(string); ok {
					roles = append(roles, s)
				}
			}
		}
	}
	if list, ok := claims["roles"].([]any); ok {
		for _, item := range list {
			if s, ok := item.(string); ok {
				roles = append(roles, s)
			}
		}
	}
	return roles
}
