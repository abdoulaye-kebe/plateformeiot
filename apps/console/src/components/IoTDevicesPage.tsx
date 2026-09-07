"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiMutate } from "@/lib/api";
import { useClientAuth } from "@/lib/useClientAuth";
import { PageHeader, RoleBanner, EmptyState } from "@/components/ui";

type IoTDevice = {
  id: string;
  name: string;
  protocol: "mqtt" | "lwm2m";
  externalId: string;
  status?: string;
  lastSeenAt?: string;
};

type Connectivity = {
  mqtt?: { brokerUrl?: string; telemetryTopic?: string; commandTopic?: string };
  lwm2m?: { serverUrl?: string; register?: string };
};

type ProvisionInfo = {
  mqtt?: {
    broker?: string;
    username?: string;
    password?: string;
    telemetryTopic?: string;
    commandTopic?: string;
    examplePayload?: string;
  };
  lwm2m?: {
    server?: string;
    endpoint?: string;
    registerUri?: string;
    pskIdentity?: string;
    psk?: string;
    securityMode?: string;
  };
};

export default function IoTDevicesPage() {
  const { write } = useClientAuth();
  const [devices, setDevices] = useState<IoTDevice[]>([]);
  const [connectivity, setConnectivity] = useState<Connectivity | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", protocol: "mqtt", externalId: "" });
  const [provision, setProvision] = useState<ProvisionInfo | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [d, c] = await Promise.all([
      apiFetch<{ result: IoTDevice[] }>("/api/v1/iot/devices?limit=100"),
      apiFetch<Connectivity>("/api/v1/iot/connectivity"),
    ]);
    setDevices(Array.isArray(d?.result) ? d.result : []);
    setConnectivity(c ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createDevice(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const { data, error: err } = await apiMutate<{ provision?: ProvisionInfo; credentials?: Record<string, string> }>(
      "/api/v1/iot/devices",
      "POST",
      form,
    );
    if (err) {
      setError(err);
      return;
    }
    setShowForm(false);
    setForm({ name: "", protocol: "mqtt", externalId: "" });
    setProvision(data?.provision ?? null);
    load();
  }

  async function showProvision(id: string) {
    const data = await apiFetch<{ provision: ProvisionInfo }>(`/api/v1/iot/devices/${id}/provision`);
    setProvision(data?.provision ?? null);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Devices LTE-M"
        subtitle="MQTT natif et LwM2M — capteurs IP / cellulaire (distinct des devices LoRaWAN)"
      />
      <RoleBanner />

      {connectivity && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
            <h3 className="font-semibold text-gray-900">MQTT</h3>
            <p className="mt-2 font-mono text-xs text-gray-600">{connectivity.mqtt?.brokerUrl}</p>
            <p className="mt-1 text-gray-500">Topic : {connectivity.mqtt?.telemetryTopic}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
            <h3 className="font-semibold text-gray-900">LwM2M</h3>
            <p className="mt-2 font-mono text-xs text-gray-600">{connectivity.lwm2m?.serverUrl}</p>
            <p className="mt-1 text-gray-500">{connectivity.lwm2m?.register}</p>
          </div>
        </div>
      )}

      {provision && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <div className="flex items-start justify-between gap-4">
            <h3 className="font-semibold text-emerald-900">Paramètres de connexion</h3>
            <button type="button" className="text-emerald-700 underline" onClick={() => setProvision(null)}>
              Fermer
            </button>
          </div>
          <pre className="mt-3 overflow-x-auto rounded bg-white p-3 text-xs text-gray-800">
            {JSON.stringify(provision, null, 2)}
          </pre>
        </div>
      )}

      {write && (
        <div>
          {!showForm ? (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
            >
              + Provisionner un device LTE-M
            </button>
          ) : (
            <form onSubmit={createDevice} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3 max-w-lg">
              <h3 className="font-semibold">Nouveau device</h3>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <input
                className="w-full rounded border px-3 py-2 text-sm"
                placeholder="Nom (ex. Compteur LTE Dakar)"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
              <select
                className="w-full rounded border px-3 py-2 text-sm"
                value={form.protocol}
                onChange={(e) => setForm({ ...form, protocol: e.target.value })}
              >
                <option value="mqtt">MQTT</option>
                <option value="lwm2m">LwM2M</option>
              </select>
              <input
                className="w-full rounded border px-3 py-2 text-sm font-mono"
                placeholder="ID device (externalId / endpoint LwM2M)"
                value={form.externalId}
                onChange={(e) => setForm({ ...form, externalId: e.target.value })}
                required
              />
              <div className="flex gap-2">
                <button type="submit" className="rounded bg-orange-600 px-4 py-2 text-sm text-white">
                  Créer et afficher credentials
                </button>
                <button type="button" className="rounded border px-4 py-2 text-sm" onClick={() => setShowForm(false)}>
                  Annuler
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : devices.length === 0 ? (
        <EmptyState message="Aucun device LTE-M — provisionnez un device MQTT ou LwM2M." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Protocole</th>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-medium">{d.name}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs uppercase text-blue-800">{d.protocol}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{d.externalId}</td>
                  <td className="px-4 py-3 capitalize">{d.status ?? "offline"}</td>
                  <td className="px-4 py-3 space-x-2">
                    <button type="button" className="text-orange-600 underline" onClick={() => showProvision(d.id)}>
                      Connexion
                    </button>
                    <Link href={`/iot-devices/${d.id}`} className="text-gray-600 underline">
                      Télémétrie
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-500">
        LoRaWAN reste géré via{" "}
        <Link href="/devices" className="text-orange-600 underline">
          Devices LoRaWAN
        </Link>
        . Ouvrez les ports <strong>1885/TCP</strong> (MQTT IoT LTE-M) et <strong>5684/UDP</strong> (LwM2M DTLS) sur votre VM.
      </p>
    </div>
  );
}
