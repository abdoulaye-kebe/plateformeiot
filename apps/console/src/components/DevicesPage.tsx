"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiMutate } from "@/lib/api";
import { useClientAuth } from "@/lib/useClientAuth";
import { PageHeader, RoleBanner, Section, EmptyState } from "@/components/ui";

type DeviceRow = { devEui?: string; name?: string; applicationId?: string; device?: Record<string, unknown> };
type AppRow = { id?: string; application?: { id?: string; name?: string } };
type ProfileRow = { id?: string; deviceProfile?: { id?: string; name?: string } };

export default function DevicesPage() {
  const { write, viewerOnly } = useClientAuth();
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [apps, setApps] = useState<AppRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ devEui: "", name: "", applicationId: "", deviceProfileId: "", joinEui: "" });
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [d, a, p] = await Promise.all([
      apiFetch<{ result: DeviceRow[] }>("/api/v1/lorawan/devices?limit=100"),
      apiFetch<{ result: AppRow[] }>("/api/v1/lorawan/applications?limit=50"),
      apiFetch<{ result: ProfileRow[] }>("/api/v1/lorawan/device-profiles?limit=50"),
    ]);
    setDevices(Array.isArray(d?.result) ? d.result : []);
    setApps(a?.result ?? []);
    setProfiles(p?.result ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  function devEuiOf(row: DeviceRow) {
    return (row.devEui ?? (row.device as { devEui?: string })?.devEui ?? "").toLowerCase();
  }

  async function createDevice(e: React.FormEvent) {
    e.preventDefault();
    const { error: err } = await apiMutate("/api/v1/lorawan/devices", "POST", form);
    if (err) { setError(err); return; }
    setShowForm(false);
    setForm({ devEui: "", name: "", applicationId: "", deviceProfileId: "", joinEui: "" });
    load();
  }

  return (
    <div className="p-8">
      <PageHeader
        title="Devices"
        subtitle="Capteurs et actuators LoRaWAN de votre tenant"
        action={
          <button type="button" onClick={() => write && setShowForm(!showForm)} disabled={!write}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${write ? "bg-emerald-600 hover:bg-emerald-500" : "bg-slate-700 text-slate-400 cursor-not-allowed"}`}>
            {showForm ? "Annuler" : "+ Ajouter device"}
          </button>
        }
      />
      <RoleBanner />

      {showForm && write && (
        <form onSubmit={createDevice} className="mb-8 grid gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-6 sm:grid-cols-2">
          <input className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" placeholder="DevEUI (16 hex)" value={form.devEui} onChange={(e) => setForm({ ...form, devEui: e.target.value })} required />
          <input className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" placeholder="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <select className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" value={form.applicationId} onChange={(e) => setForm({ ...form, applicationId: e.target.value })} required>
            <option value="">Application…</option>
            {apps.map((a) => { const id = a.application?.id ?? a.id ?? ""; return <option key={id} value={id}>{a.application?.name ?? id}</option>; })}
          </select>
          <select className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" value={form.deviceProfileId} onChange={(e) => setForm({ ...form, deviceProfileId: e.target.value })} required>
            <option value="">Device profile…</option>
            {profiles.map((p) => { const id = p.deviceProfile?.id ?? p.id ?? ""; return <option key={id} value={id}>{p.deviceProfile?.name ?? id}</option>; })}
          </select>
          <input className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm sm:col-span-2" placeholder="JoinEUI (OTAA, optionnel)" value={form.joinEui} onChange={(e) => setForm({ ...form, joinEui: e.target.value })} />
          <button type="submit" className="sm:col-span-2 rounded-lg bg-emerald-600 py-2 font-medium">Créer device</button>
          {error && <p className="sm:col-span-2 text-sm text-red-400">{error}</p>}
        </form>
      )}

      <Section title={`Devices (${devices.length})`}>
        {devices.length === 0 ? (
          <EmptyState message={viewerOnly ? "Aucun device enregistré." : "Créez une application puis ajoutez un device via la console."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-400 border-b border-slate-800"><th className="pb-2">Nom</th><th>DevEUI</th><th></th></tr></thead>
              <tbody>
                {devices.map((d) => {
                  const eui = devEuiOf(d);
                  const name = d.name ?? (d.device as { name?: string })?.name ?? eui;
                  return (
                    <tr key={eui} className="border-b border-slate-800/50">
                      <td className="py-3 font-medium">{name}</td>
                      <td className="font-mono text-xs text-slate-500">{eui}</td>
                      <td className="text-right"><Link href={`/devices/${eui}`} className="text-emerald-400 hover:underline">Détails →</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
