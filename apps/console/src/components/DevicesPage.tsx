"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, apiMutate } from "@/lib/api";
import { useClientAuth } from "@/lib/useClientAuth";
import DevicesShell from "@/components/DevicesShell";
import { CopyIcon, DeviceStatusDot } from "@/components/DataShell";
import { profileId, profileLabel, type ProfileRow } from "@/lib/lorawanProfiles";
import { PageHeader, RoleBanner, EmptyState } from "@/components/ui";

type LorawanMeta = {
  status?: string;
  lastComm?: string;
  connectivity?: string;
  applicationName?: string;
  uplinkCount24h?: number;
};

type DeviceRow = {
  devEui?: string;
  name?: string;
  applicationId?: string;
  device?: Record<string, unknown> & { devEui?: string; name?: string; applicationId?: string };
  lorawan?: LorawanMeta;
};

type AppRow = { id?: string; application?: { id?: string; name?: string } };

export default function DevicesPage() {
  const { write, viewerOnly } = useClientAuth();
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [apps, setApps] = useState<AppRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ devEui: "", name: "", applicationId: "", deviceProfileId: "", joinEui: "", appKey: "" });
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [appFilter, setAppFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [d, a, p] = await Promise.all([
      apiFetch<{ result: DeviceRow[]; totalCount?: number }>("/api/v1/lorawan/devices?limit=500"),
      apiFetch<{ result: AppRow[] }>("/api/v1/lorawan/applications?limit=50"),
      apiFetch<{ result: ProfileRow[] }>("/api/v1/lorawan/device-profiles?limit=50"),
    ]);
    setDevices(Array.isArray(d?.result) ? d.result : []);
    setApps(a?.result ?? []);
    setProfiles(p?.result ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function devEuiOf(row: DeviceRow) {
    return (row.devEui ?? row.device?.devEui ?? "").toLowerCase();
  }

  function nameOf(row: DeviceRow) {
    return row.name ?? row.device?.name ?? devEuiOf(row);
  }

  const filtered = useMemo(() => {
    return devices.filter((d) => {
      const eui = devEuiOf(d);
      const name = nameOf(d);
      const appId = d.applicationId ?? d.device?.applicationId ?? "";
      const q = search.toLowerCase();
      if (appFilter && appId !== appFilter) return false;
      if (!q) return true;
      return eui.includes(q) || name.toLowerCase().includes(q) || String(appId).includes(q);
    });
  }, [devices, search, appFilter]);

  async function createDevice(e: React.FormEvent) {
    e.preventDefault();
    const { error: err } = await apiMutate("/api/v1/lorawan/devices", "POST", form);
    if (err) {
      setError(err);
      return;
    }
    setShowForm(false);
    setForm({ devEui: "", name: "", applicationId: "", deviceProfileId: "", joinEui: "", appKey: "" });
    load();
  }

  function toggleAll(checked: boolean) {
    if (checked) setSelected(new Set(filtered.map(devEuiOf)));
    else setSelected(new Set());
  }

  function toggleOne(eui: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(eui)) next.delete(eui);
      else next.add(eui);
      return next;
    });
  }

  return (
    <DevicesShell>
      <div className="p-4 lg:p-6">
        <PageHeader
          title="All devices"
          subtitle="Inventaire LoRaWAN — statut, dernière communication, connectivité"
          action={
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => write && setShowForm(!showForm)}
                disabled={!write}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${write ? "bg-brand hover:bg-brand-dark text-white" : "bg-gray-100 text-gray-600 cursor-not-allowed"}`}
              >
                {showForm ? "Annuler" : "+ Add device"}
              </button>
            </div>
          }
        />
        <RoleBanner />

        <nav className="mb-4 text-xs text-gray-500">
          <span>Devices</span>
          <span className="mx-1">›</span>
          <span className="text-gray-800">All connectivities</span>
        </nav>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <select
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            value={appFilter}
            onChange={(e) => setAppFilter(e.target.value)}
          >
            <option value="">All connectivities</option>
            <option value="">LoRaWAN</option>
            {apps.map((a) => {
              const id = a.application?.id ?? a.id ?? "";
              return (
                <option key={id} value={id}>
                  {a.application?.name ?? id}
                </option>
              );
            })}
          </select>
          <input
            className="min-w-[240px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Search or filter results…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {showForm && write && (
          <form onSubmit={createDevice} className="mb-6 grid gap-3 rounded-xl border border-gray-200 bg-white p-6 sm:grid-cols-2">
            <input className="rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm" placeholder="DevEUI (16 hex)" value={form.devEui} onChange={(e) => setForm({ ...form, devEui: e.target.value })} required />
            <input className="rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm" placeholder="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <select className="rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm" value={form.applicationId} onChange={(e) => setForm({ ...form, applicationId: e.target.value })} required>
              <option value="">Application…</option>
              {apps.map((a) => {
                const id = a.application?.id ?? a.id ?? "";
                return (
                  <option key={id} value={id}>
                    {a.application?.name ?? id}
                  </option>
                );
              })}
            </select>
            <select className="rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm" value={form.deviceProfileId} onChange={(e) => setForm({ ...form, deviceProfileId: e.target.value })} required>
              <option value="">Device profile…</option>
              {profiles.map((p) => {
                const id = profileId(p);
                return (
                  <option key={id} value={id}>
                    {profileLabel(p)}
                  </option>
                );
              })}
            </select>
            {write && (
              <p className="text-xs text-gray-500 sm:col-span-2">
                Pas de profil ?{" "}
                <Link href="/device-profiles" className="text-brand hover:underline">
                  Créer un device profile →
                </Link>
              </p>
            )}
            <input className="rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm sm:col-span-2" placeholder="App EUI / JoinEUI (16 hex, OTAA)" value={form.joinEui} onChange={(e) => setForm({ ...form, joinEui: e.target.value })} />
            <input className="rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm sm:col-span-2 font-mono" placeholder="AppKey (32 hex, OTAA)" value={form.appKey} onChange={(e) => setForm({ ...form, appKey: e.target.value })} />
            <p className="sm:col-span-2 text-xs text-gray-500">
              Pour OTAA : renseignez App EUI (JoinEUI) et AppKey comme dans ChirpStack. La clé doit correspondre à celle programmée sur le capteur.
            </p>
            <button type="submit" className="sm:col-span-2 rounded-lg bg-brand py-2 font-medium text-white">
              Créer device
            </button>
            {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}
          </form>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-4 text-sm text-gray-600">
          <span>
            {selected.size} selected / {filtered.length} devices
          </span>
          <button type="button" onClick={load} className="text-brand hover:underline">
            {loading ? "Refresh…" : "Refresh"}
          </button>
        </div>

        {filtered.length === 0 ? (
          <EmptyState message={viewerOnly ? "Aucun device enregistré." : "Créez une application puis ajoutez un device."} />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-600">
                  <th className="px-3 py-2">
                    <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={(e) => toggleAll(e.target.checked)} />
                  </th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Device ID</th>
                  <th className="px-3 py-2">Group</th>
                  <th className="px-3 py-2">Last comm.</th>
                  <th className="px-3 py-2">Connectivity</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => {
                  const eui = devEuiOf(d);
                  const lw = d.lorawan ?? {};
                  return (
                    <tr key={eui} className="border-b border-gray-100 hover:bg-gray-50/80">
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={selected.has(eui)} onChange={() => toggleOne(eui)} />
                      </td>
                      <td className="px-3 py-2 font-medium">{nameOf(d)}</td>
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs text-gray-600">{eui}</span>
                        <CopyIcon value={eui} />
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">{lw.applicationName ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500">
                        {lw.lastComm ? new Date(lw.lastComm).toLocaleString("fr-FR") : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">{lw.connectivity ?? "LoRaWAN"}</td>
                      <td className="px-3 py-2">
                        <DeviceStatusDot status={lw.status} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link href={`/devices/${eui}`} className="text-brand hover:underline text-xs">
                          Détails →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DevicesShell>
  );
}
