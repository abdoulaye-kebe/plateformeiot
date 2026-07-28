"use client";

import { useEffect, useState } from "react";
import { apiFetch, apiMutate } from "@/lib/api";
import { withTenantScope } from "@/lib/tenantScope";
import { useClientAuth } from "@/lib/useClientAuth";
import { PageHeader, Section } from "@/components/ui";

type Deployment = {
  id: string;
  name: string;
  applicationId: string;
  multicastGroupId?: string;
  firmwareObjectKey?: string;
  firmwareSize: number;
  deviceCount: number;
  status: string;
  createdAt: string;
};

type Application = { application?: { id?: string; name?: string } };

const API = process.env.NEXT_PUBLIC_PLATFORM_API_URL ?? "http://localhost:8081";

export default function FuotaPage() {
  const { write } = useClientAuth();
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [form, setForm] = useState({ name: "", applicationId: "", devEuis: "", region: "EU868", class: "C" });
  const [firmwareKey, setFirmwareKey] = useState("");
  const [firmwareSize, setFirmwareSize] = useState(0);
  const [msg, setMsg] = useState("");

  async function load() {
    const [d, apps] = await Promise.all([
      apiFetch<{ result: Deployment[] }>("/api/v1/fuota/deployments"),
      apiFetch<{ result: Application[] }>("/api/v1/lorawan/applications?limit=50"),
    ]);
    setDeployments(d?.result ?? []);
    setApplications(apps?.result ?? []);
  }

  useEffect(() => { load(); }, []);

  async function uploadFirmware(file: File) {
    const fd = new FormData();
    fd.append("firmware", file);
    fd.append("name", file.name);
    const session = typeof window !== "undefined" ? localStorage.getItem("lorawan_session") : null;
    const token = session ? (JSON.parse(session) as { accessToken?: string }).accessToken : "";
    const res = await fetch(`${API}/api/v1/fuota/firmware${withTenantScope("")}`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (!res.ok) {
      setMsg("Échec upload firmware");
      return;
    }
    const data = (await res.json()) as { objectKey: string; size: number };
    setFirmwareKey(data.objectKey);
    setFirmwareSize(data.size);
    setMsg(`Firmware uploadé (${Math.round(data.size / 1024)} Ko)`);
  }

  async function createDeployment(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const devEuis = form.devEuis.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    const { data, error } = await apiMutate<Deployment>("/api/v1/fuota/deployments", "POST", {
      name: form.name,
      applicationId: form.applicationId,
      devEuis,
      region: form.region,
      class: form.class,
      firmwareObjectKey: firmwareKey || undefined,
      firmwareSize,
    });
    if (error) setMsg(error);
    else {
      setMsg(`Déploiement créé — multicast ${data?.multicastGroupId ?? "—"}`);
      load();
    }
  }

  async function start(id: string) {
    const { error } = await apiMutate(`/api/v1/fuota/deployments/${id}/start`, "POST");
    setMsg(error ?? "Déploiement démarré");
    load();
  }

  return (
    <div className="p-4 lg:p-6">
      <PageHeader title="FUOTA" subtitle="Mises à jour firmware LoRaWAN via groupes multicast" />

      {write && (
        <Section title="Nouveau déploiement">
          <form onSubmit={createDeployment} className="grid max-w-xl gap-3">
            <input className="rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm" placeholder="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <select className="rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm" value={form.applicationId} onChange={(e) => setForm({ ...form, applicationId: e.target.value })} required>
              <option value="">Application</option>
              {applications.map((a, i) => {
                const app = a.application ?? a;
                const id = (app as { id?: string }).id ?? "";
                const name = (app as { name?: string }).name ?? id;
                return <option key={id || i} value={id}>{name}</option>;
              })}
            </select>
            <textarea className="rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm font-mono" placeholder="DevEUIs (un par ligne ou séparés par virgule)" value={form.devEuis} onChange={(e) => setForm({ ...form, devEuis: e.target.value })} rows={3} />
            <input type="file" accept=".bin,.hex,.fw" onChange={(e) => e.target.files?.[0] && uploadFirmware(e.target.files[0])} className="text-sm text-gray-600" />
            <button type="submit" className="rounded-lg bg-brand py-2 text-sm hover:bg-brand">Créer déploiement multicast</button>
          </form>
          {msg && <p className="mt-2 text-sm text-brand">{msg}</p>}
        </Section>
      )}

      <Section title="Déploiements">
        {deployments.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun déploiement FUOTA.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-600">
                <th className="pb-2">Nom</th><th>Status</th><th>Devices</th><th>Multicast</th><th />
              </tr>
            </thead>
            <tbody>
              {deployments.map((d) => (
                <tr key={d.id} className="border-b border-gray-200/50">
                  <td className="py-2">{d.name}</td>
                  <td className="text-brand">{d.status}</td>
                  <td>{d.deviceCount}</td>
                  <td className="font-mono text-xs">{d.multicastGroupId || "—"}</td>
                  <td>
                    {write && d.status !== "running" && (
                      <button type="button" onClick={() => start(d.id)} className="text-xs text-sky-400 hover:underline">Démarrer</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-4 text-xs text-gray-500">Le déploiement multicast prépare la mise à jour OTA — le transfert firmware complet s&apos;effectue via le réseau LoRaWAN.</p>
      </Section>
    </div>
  );
}
