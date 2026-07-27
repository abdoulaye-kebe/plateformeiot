"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiMutate } from "@/lib/api";
import { useClientAuth } from "@/lib/useClientAuth";
import { PageHeader, RoleBanner, Section, EmptyState, StatusBadge } from "@/components/ui";

type GatewayRow = { gatewayId?: string; name?: string; state?: string; gateway?: Record<string, unknown> };

export default function GatewaysPage() {
  const { write, viewerOnly } = useClientAuth();
  const [gateways, setGateways] = useState<GatewayRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ gatewayId: "", name: "", description: "" });
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const data = await apiFetch<{ result: GatewayRow[] }>("/api/v1/lorawan/gateways?limit=100");
    setGateways(data?.result ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  function gwIdOf(row: GatewayRow) {
    return (row.gatewayId ?? (row.gateway as { gatewayId?: string })?.gatewayId ?? "").toLowerCase();
  }

  async function createGateway(e: React.FormEvent) {
    e.preventDefault();
    const { error: err } = await apiMutate("/api/v1/lorawan/gateways", "POST", form);
    if (err) { setError(err); return; }
    setShowForm(false);
    setForm({ gatewayId: "", name: "", description: "" });
    load();
  }

  return (
    <div className="p-8">
      <PageHeader
        title="Gateways"
        subtitle="Infrastructure radio LoRaWAN"
        action={
          <button type="button" onClick={() => write && setShowForm(!showForm)} disabled={!write}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${write ? "bg-emerald-600 hover:bg-emerald-500" : "bg-slate-700 text-slate-400 cursor-not-allowed"}`}>
            {showForm ? "Annuler" : "+ Ajouter gateway"}
          </button>
        }
      />
      <RoleBanner />

      {showForm && write && (
        <form onSubmit={createGateway} className="mb-8 grid gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-6 sm:grid-cols-3">
          <input className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" placeholder="Gateway ID" value={form.gatewayId} onChange={(e) => setForm({ ...form, gatewayId: e.target.value })} required />
          <input className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" placeholder="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <button type="submit" className="sm:col-span-3 rounded-lg bg-emerald-600 py-2 font-medium">Créer gateway</button>
          {error && <p className="sm:col-span-3 text-sm text-red-400">{error}</p>}
        </form>
      )}

      <Section title={`Gateways (${gateways.length})`}>
        {gateways.length === 0 ? (
          <EmptyState message="Aucune gateway — ajoutez-en une pour recevoir des uplinks." />
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-400 border-b border-slate-800"><th className="pb-2">Nom</th><th>ID</th><th>État</th><th></th></tr></thead>
            <tbody>
              {gateways.map((g) => {
                const id = gwIdOf(g);
                const name = g.name ?? (g.gateway as { name?: string })?.name ?? id;
                const state = g.state ?? (g.gateway as { state?: string })?.state ?? "UNKNOWN";
                return (
                  <tr key={id} className="border-b border-slate-800/50">
                    <td className="py-3 font-medium">{name}</td>
                    <td className="font-mono text-xs text-slate-500">{id}</td>
                    <td><StatusBadge status={state} /></td>
                    <td className="text-right"><Link href={`/gateways/${id}`} className="text-emerald-400 hover:underline">Détails →</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}
