import { getSession, sessionUser, extractRoles } from "./auth";
import { withTenantScope } from "./tenantScope";

const API = process.env.NEXT_PUBLIC_PLATFORM_API_URL ?? "http://localhost:8081";

function authHeaders(init?: RequestInit): Headers {
  const session = typeof window !== "undefined" ? getSession() : null;
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (session?.accessToken) headers.set("Authorization", `Bearer ${session.accessToken}`);
  return headers;
}

function scopedPath(path: string): string {
  const session = typeof window !== "undefined" ? getSession() : null;
  const roles = sessionUser(session)?.roles ?? [];
  if (roles.includes("platform-admin")) {
    return withTenantScope(path);
  }
  return path;
}

export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${API}${scopedPath(path)}`, { ...init, headers: authHeaders(init), cache: "no-store" });
    if (!res.ok) return null;
    if (res.status === 204) return {} as T;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function apiMutate<T = unknown>(path: string, method: string, body?: unknown): Promise<{ data: T | null; error?: string }> {
  try {
    const res = await fetch(`${API}${scopedPath(path)}`, {
      method,
      headers: authHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { data: null, error: (err as { error?: string }).error ?? res.statusText };
    }
    if (res.status === 204) return { data: {} as T };
    return { data: (await res.json()) as T };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "network error" };
  }
}

export function serverApiBase() {
  return process.env.PLATFORM_API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_PLATFORM_API_URL ?? "http://localhost:8081";
}

export function canWrite(roles: string[]) {
  if (roles.length === 0) return true;
  return roles.some((r) => ["platform-admin", "tenant-admin", "operator"].includes(r));
}

export function isViewerOnly(roles: string[]) {
  return roles.includes("viewer") && !canWrite(roles);
}

export function isPlatformAdmin(roles: string[]) {
  return roles.includes("platform-admin");
}

export { extractRoles };
