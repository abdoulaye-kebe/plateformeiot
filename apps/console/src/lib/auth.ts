const TOKEN_KEY = "lorawan_access_token";
const REFRESH_KEY = "lorawan_refresh_token";

export type AuthSession = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  email?: string;
  roles?: string[];
};

function keycloakBase() {
  return process.env.NEXT_PUBLIC_KEYCLOAK_URL ?? "http://localhost:8082";
}

function realm() {
  return process.env.NEXT_PUBLIC_KEYCLOAK_REALM ?? "lorawan";
}

function clientId() {
  return process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? "lorawan-console";
}

export function getSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as AuthSession;
    if (session.expiresAt < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function saveSession(session: AuthSession) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(session));
  if (session.refreshToken) {
    localStorage.setItem(REFRESH_KEY, session.refreshToken);
  }
}

export async function login(username: string, password: string): Promise<AuthSession> {
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: clientId(),
    username,
    password,
    scope: "tenant",
  });

  const res = await fetch(`${keycloakBase()}/realms/${realm()}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Identifiants invalides");
  }

  const data = await res.json();
  const session: AuthSession = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in ?? 300) * 1000 - 5000,
  };
  saveSession(session);
  return session;
}

export function parseJwtPayload(token: string): Record<string, unknown> {
  const part = token.split(".")[1];
  if (!part) return {};
  const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(json);
}

export function extractRoles(claims: Record<string, unknown>): string[] {
  const roles: string[] = [];
  const realmAccess = claims.realm_access as { roles?: string[] } | undefined;
  if (Array.isArray(realmAccess?.roles)) {
    roles.push(...realmAccess.roles);
  }
  if (Array.isArray(claims.roles)) {
    for (const role of claims.roles) {
      if (typeof role === "string" && !roles.includes(role)) {
        roles.push(role);
      }
    }
  }
  return roles;
}

export function sessionUser(session: AuthSession | null) {
  if (!session) return null;
  const claims = parseJwtPayload(session.accessToken);
  return {
    email: (claims.email as string) ?? (claims.preferred_username as string) ?? "",
    roles: extractRoles(claims),
    tenantId: (claims.tenant_id as string) ?? "",
  };
}
