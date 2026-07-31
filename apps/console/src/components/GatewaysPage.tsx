"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiMutate } from "@/lib/api";
import { useClientAuth } from "@/lib/useClientAuth";
import { PageHeader, RoleBanner, Section, EmptyState, StatusBadge } from "@/components/ui";

type GatewayRow = {
  gatewayId?: string;
  name?: string;
  state?: string;
  lastSeenAt?: string;
  rfScanSupported?: boolean;
  gateway?: Record<string, unknown> & { rfScanSupported?: boolean; lastSeenAt?: string; state?: string };
};

function rfScanCapable(row: GatewayRow) {
  return Boolean(row.rfScanSupported ?? row.gateway?.rfScanSupported);
}

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
    <div className="p-4 lg:p-6">
      <PageHeader
        title="Gateways"
        subtitle="Infrastructure radio LoRaWAN"
        action={
          <button type="button" onClick={() => write && setShowForm(!showForm)} disabled={!write}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${write ? "bg-brand hover:bg-brand-dark" : "bg-gray-100 text-gray-600 cursor-not-allowed"}`}>
            {showForm ? "Annuler" : "+ Ajouter gateway"}
          </button>
        }
      />
      <RoleBanner />

      {showForm && write && (
        <form onSubmit={createGateway} className="mb-8 grid gap-3 rounded-xl border border-gray-200 bg-white p-6 sm:grid-cols-3">
          <input className="rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm" placeholder="Gateway ID" value={form.gatewayId} onChange={(e) => setForm({ ...form, gatewayId: e.target.value })} required />
          <input className="rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm" placeholder="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className="rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <button type="submit" className="sm:col-span-3 rounded-lg bg-brand py-2 font-medium">Créer gateway</button>
          {error && <p className="sm:col-span-3 text-sm text-red-600">{error}</p>}
        </form>
      )}

      <Section title={`Gateways (${gateways.length})`}>
        {gateways.length === 0 ? (
          <EmptyState message="Aucune gateway — ajoutez-en une pour recevoir des uplinks." />
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-600 border-b border-gray-200"><th className="pb-2">Nom</th><th>ID</th><th>État</th><th>Dernière activité</th><th>RF</th><th></th></tr></thead>
            <tbody>
              {gateways.map((g) => {
                const id = gwIdOf(g);
                const name = g.name ?? (g.gateway as { name?: string })?.name ?? id;
                const state = g.state ?? (g.gateway as { state?: string })?.state ?? "UNKNOWN";
                const lastSeen = g.lastSeenAt ?? (g.gateway as { lastSeenAt?: string })?.lastSeenAt;
                const rf = rfScanCapable(g);
                return (
                  <tr key={id} className="border-b border-gray-200/50">
                    <td className="py-3 font-medium">{name}</td>
                    <td className="font-mono text-xs text-gray-500">{id}</td>
                    <td><StatusBadge status={state} /></td>
                    <td className="text-xs text-gray-500">{lastSeen ? new Date(lastSeen).toLocaleString("fr-FR") : "Jamais"}</td>
                    <td>{rf ? <span className="text-xs font-medium text-brand">Scan RF</span> : <span className="text-xs text-gray-400">—</span>}</td>
                    <td className="text-right"><Link href={`/gateways/${id}`} className="text-brand hover:underline">Détails →</Link></td>
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
