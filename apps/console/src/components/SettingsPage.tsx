"use client";

import { useEffect, useState } from "react";
import { apiFetch, apiMutate } from "@/lib/api";
import { useClientAuth } from "@/lib/useClientAuth";
import { PageHeader, Section } from "@/components/ui";

type Tenant = { id: string; name: string; slug: string; plan: string; status: string; features?: string[] };
type Billing = { period: string; uplinkCount: number; activeDevices: number; activeGateways: number; estimatedEur: string };
type APIKey = { id: string; name: string; prefix: string; scopes: string[]; createdAt: string; revokedAt?: string };

export default function SettingsPage() {
  const { user, isTenantAdmin } = useClientAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [keys, setKeys] = useState<APIKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [keyError, setKeyError] = useState("");

  const loadKeys = () => apiFetch<{ result: APIKey[] }>("/api/v1/api-keys").then((d) => setKeys(d?.result ?? []));

  useEffect(() => {
    apiFetch<Tenant>("/api/v1/tenants/me").then(setTenant);
    if (isTenantAdmin) {
      apiFetch<Billing>("/api/v1/billing/usage").then(setBilling);
      loadKeys();
    }
  }, [isTenantAdmin]);

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    setKeyError("");
    setCreatedKey(null);
    const { data, error } = await apiMutate<{ plainKey: string }>("/api/v1/api-keys", "POST", {
      name: newKeyName,
      scopes: ["read", "write"],
    });
    if (error || !data?.plainKey) {
      setKeyError(error ?? "Erreur");
      return;
    }
    setCreatedKey(data.plainKey);
    setNewKeyName("");
    loadKeys();
  }

  async function revokeKey(id: string) {
    await apiMutate(`/api/v1/api-keys/${id}`, "DELETE");
    loadKeys();
  }

  return (
    <div className="p-8">
      <PageHeader title="Paramètres" subtitle="Compte, tenant, clés API et facturation" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Profil utilisateur">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-slate-400">Email</dt><dd>{user?.email || "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Rôles</dt><dd>{user?.roles?.join(", ") || "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Organisation</dt><dd>{tenant?.name || "—"}</dd></div>
          </dl>
        </Section>

        <Section title="Tenant">
          {tenant ? (
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between"><dt className="text-slate-400">Nom</dt><dd>{tenant.name}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Slug</dt><dd>{tenant.slug}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Plan</dt><dd className="text-emerald-300">{tenant.plan}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Statut</dt><dd>{tenant.status}</dd></div>
            </dl>
          ) : (
            <p className="text-sm text-slate-500">Tenant non trouvé — contactez l&apos;administrateur.</p>
          )}
        </Section>

        {isTenantAdmin && (
          <>
            <Section title="Billing (mois en cours)">
              {billing ? (
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between"><dt className="text-slate-400">Période</dt><dd>{billing.period}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-400">Uplinks</dt><dd>{billing.uplinkCount.toLocaleString("fr-FR")}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-400">Estimation</dt><dd className="text-lg font-semibold text-emerald-300">{billing.estimatedEur} €</dd></div>
                </dl>
              ) : (
                <p className="text-sm text-slate-500">Données billing indisponibles.</p>
              )}
            </Section>

            <Section title="Clés API">
              <form onSubmit={createKey} className="mb-4 flex gap-2">
                <input className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" placeholder="Nom de la clé" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} required />
                <button type="submit" className="rounded-lg bg-emerald-700 px-3 py-2 text-sm">Créer</button>
              </form>
              {createdKey && (
                <p className="mb-3 rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 text-xs font-mono text-amber-100">
                  Copiez maintenant : {createdKey}
                </p>
              )}
              {keyError && <p className="mb-2 text-xs text-red-400">{keyError}</p>}
              <ul className="space-y-2 text-sm">
                {keys.filter((k) => !k.revokedAt).map((k) => (
                  <li key={k.id} className="flex items-center justify-between rounded border border-slate-800 px-3 py-2">
                    <span>{k.name} <span className="font-mono text-xs text-slate-500">lwp_{k.prefix}_…</span></span>
                    <button type="button" className="text-xs text-red-400" onClick={() => revokeKey(k.id)}>Révoquer</button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate-500">Header : <code>X-API-Key: lwp_…</code></p>
            </Section>
          </>
        )}

        <Section title="Intégrations">
          <ul className="space-y-2 text-sm text-slate-300">
            <li>MQTT broker — contactez votre administrateur pour les paramètres de connexion</li>
            <li>Webhooks règles → configurable dans /rules</li>
            <li>API REST → clés dans cette page (tenant-admin)</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
