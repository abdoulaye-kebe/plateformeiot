"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiMutate } from "@/lib/api";
import { useClientAuth } from "@/lib/useClientAuth";
import { PageHeader, RoleBanner, Section, EmptyState } from "@/components/ui";

type App = { id?: string; name?: string; description?: string; application?: { id?: string; name?: string; description?: string } };

export default function ApplicationsPage() {
  const { write, viewerOnly } = useClientAuth();
  const [apps, setApps] = useState<App[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const data = await apiFetch<{ result: App[] }>("/api/v1/lorawan/applications?limit=50");
    setApps(Array.isArray(data?.result) ? data.result : []);
  }, []);

  useEffect(() => { load(); }, [load]);

  function appId(a: App) { return a.application?.id ?? a.id ?? ""; }
  function appName(a: App) { return a.application?.name ?? a.name ?? appId(a); }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const { error: err } = await apiMutate("/api/v1/lorawan/applications", "POST", form);
    if (err) { setError(err); return; }
    setShowForm(false);
    setForm({ name: "", description: "" });
    load();
  }

  return (
    <div className="p-8">
      <PageHeader
        title="Applications"
        subtitle="Organisez vos devices par application LoRaWAN"
        action={
          <button type="button" onClick={() => write && setShowForm(!showForm)} disabled={!write}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${write ? "bg-emerald-600 hover:bg-emerald-500" : "bg-slate-700 text-slate-400 cursor-not-allowed"}`}>
            {showForm ? "Annuler" : "+ Nouvelle application"}
          </button>
        }
      />
      <RoleBanner />

      {showForm && write && (
        <form onSubmit={create} className="mb-8 grid gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-6 sm:grid-cols-2">
          <input className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" placeholder="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <button type="submit" className="sm:col-span-2 rounded-lg bg-emerald-600 py-2 font-medium">Créer</button>
          {error && <p className="sm:col-span-2 text-sm text-red-400">{error}</p>}
        </form>
      )}

      <Section title={`Applications (${apps.length})`}>
        {apps.length === 0 ? (
          <EmptyState message={viewerOnly ? "Aucune application. Demandez à un operator d'en créer une." : "Créez une application avant d'ajouter des devices."} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {apps.map((a) => (
              <article key={appId(a)} className="rounded-lg border border-slate-800 p-4">
                <p className="font-medium">{appName(a)}</p>
                <p className="mt-1 text-xs text-slate-500 font-mono">{appId(a)}</p>
                <p className="mt-2 text-sm text-slate-400">{a.application?.description ?? a.description ?? "—"}</p>
              </article>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
