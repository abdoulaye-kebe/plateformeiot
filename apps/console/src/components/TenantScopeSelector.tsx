"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getAdminTenantScope, setAdminTenantScope } from "@/lib/tenantScope";
import { useClientAuth } from "@/lib/useClientAuth";

type Tenant = { id: string; name: string; slug: string; status?: string };

export default function TenantScopeSelector() {
  const { isAdmin } = useClientAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    if (!isAdmin) return;
    setSelected(getAdminTenantScope() ?? "");
    apiFetch<{ result: Tenant[] }>("/api/v1/tenants").then((data) => {
      const list = data?.result ?? [];
      setTenants(list);
      if (!getAdminTenantScope() && list[0]) {
        setAdminTenantScope(list[0].id);
        setSelected(list[0].id);
      }
    });
  }, [isAdmin]);

  if (!isAdmin || tenants.length === 0) return null;

  return (
    <div className="border-b border-slate-800 px-4 py-3">
      <label className="mb-1 block text-[10px] uppercase tracking-widest text-slate-500">Tenant actif</label>
      <select
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs"
        value={selected}
        onChange={(e) => {
          setSelected(e.target.value);
          setAdminTenantScope(e.target.value || null);
          window.location.reload();
        }}
      >
        {tenants.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} ({t.slug}){t.status === "suspended" ? " — suspendu" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
