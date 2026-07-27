const KEY = "lorawan_admin_tenant_scope";

export function getAdminTenantScope(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY);
}

export function setAdminTenantScope(tenantId: string | null) {
  if (typeof window === "undefined") return;
  if (tenantId) localStorage.setItem(KEY, tenantId);
  else localStorage.removeItem(KEY);
}

export function withTenantScope(path: string): string {
  if (typeof window === "undefined") return path;
  const scope = getAdminTenantScope();
  if (!scope) return path;
  const sep = path.includes("?") ? "&" : "?";
  if (path.includes("tenantId=")) return path;
  return `${path}${sep}tenantId=${encodeURIComponent(scope)}`;
}
