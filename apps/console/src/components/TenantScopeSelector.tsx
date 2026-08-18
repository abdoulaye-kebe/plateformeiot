"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getAdminTenantScope, setAdminTenantScope } from "@/lib/tenantScope";
import { useClientAuth } from "@/lib/useClientAuth";

type Tenant = { id: string; name: string; slug: string; status?: string };

type Props = {
  variant?: "sidebar" | "header";
};

export default function TenantScopeSelector({ variant = "sidebar" }: Props) {
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

  if (variant === "header") {
    return (
      <select
        className="w-full max-w-none rounded border border-white/30 bg-black px-2 py-2 text-sm text-white lg:max-w-[130px] lg:py-1 lg:text-xs"
        value={selected}
        onChange={(e) => {
          setSelected(e.target.value);
          setAdminTenantScope(e.target.value || null);
          window.location.reload();
        }}
        title="Tenant actif"
      >
        {tenants.map((t) => (
          <option key={t.id} value={t.id} className="text-black">
            {t.slug}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="border-b border-gray-200 px-4 py-3">
      <label className="mb-1 block text-[10px] uppercase tracking-widest text-gray-500">Tenant actif</label>
      <select
        className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs"
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
