"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, apiMutate } from "@/lib/api";
import { useClientAuth } from "@/lib/useClientAuth";
import { DashboardCard, MetricLarge, SparkBars } from "@/components/dashboard-ui";
import { RoleBanner } from "@/components/ui";

type Dashboard = {
  id: string;
  name: string;
  description: string;
  deviceEuis: string[];
};

type DeviceRadio = {
  devEui: string;
  uplinkCount: number;
  avgRssi?: number;
  avgSnr?: number;
};

type TrafficPoint = { bucket: string; uplinkCount: number; avgRssi?: number };

type PayloadRow = {
  id: number;
  devEui: string;
  time: string;
  fPort?: number;
  payloadSize?: number;
};

type DeviceMeta = { devEui: string; name: string };

export default function CustomDashboardView({ dashboardId }: { dashboardId: string }) {
  const router = useRouter();
  const { write } = useClientAuth();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [deviceMeta, setDeviceMeta] = useState<Record<string, string>>({});
  const [radios, setRadios] = useState<DeviceRadio[]>([]);
  const [traffic, setTraffic] = useState<TrafficPoint[]>([]);
  const [payloads, setPayloads] = useState<PayloadRow[]>([]);

  const load = useCallback(async () => {
    const dash = await apiFetch<Dashboard>(`/api/v1/dashboards/${dashboardId}`);
    if (!dash) return;
    setDashboard(dash);

    const [devicesRes, trafficRes] = await Promise.all([
      apiFetch<{ result: { devEui?: string; name?: string; device?: { devEui?: string; name?: string } }[] }>(
        "/api/v1/lorawan/devices?limit=200",
      ),
      apiFetch<{ points: TrafficPoint[] }>(
        `/api/v1/analytics/devices/traffic?hours=24&devEuis=${dash.deviceEuis.join(",")}`,
      ),
    ]);

    const meta: Record<string, string> = {};
    for (const row of devicesRes?.result ?? []) {
      const id = (row.devEui ?? row.device?.devEui ?? "").toLowerCase();
      if (id) meta[id] = row.name ?? row.device?.name ?? id;
    }
    setDeviceMeta(meta);

    const radioResults = await Promise.all(
      dash.deviceEuis.map((devEui) =>
        apiFetch<DeviceRadio>(`/api/v1/analytics/devices/${devEui}/radio?hours=24`).then((r) => r ?? { devEui, uplinkCount: 0 }),
      ),
    );
    setRadios(radioResults);

    setTraffic(trafficRes?.points ?? []);

    const payloadLists = await Promise.all(
      dash.deviceEuis.slice(0, 5).map((devEui) =>
        apiFetch<{ result: PayloadRow[] }>(`/api/v1/lorawan/devices/${devEui}/payloads?limit=5`).then((p) => p?.result ?? []),
      ),
    );
    const merged = payloadLists
      .flat()
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 10);
    setPayloads(merged);
  }, [dashboardId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const totalUplinks = useMemo(() => radios.reduce((s, r) => s + r.uplinkCount, 0), [radios]);
  const sparkValues = useMemo(() => {
    if (traffic.length > 0) return traffic.map((p) => p.uplinkCount);
    return [0, 0, 0, totalUplinks, 0, 0, 0];
  }, [traffic, totalUplinks]);

  async function remove() {
    if (!dashboard || !confirm(`Supprimer le dashboard « ${dashboard.name} » ?`)) return;
    await apiMutate(`/api/v1/dashboards/${dashboardId}`, "DELETE");
    router.push("/");
  }

  if (!dashboard) {
    return <div className="p-6 text-sm text-gray-500">Chargement…</div>;
  }

  return (
    <div className="mx-auto max-w-[1400px] p-4 lg:p-5">
      <RoleBanner />

      <header className="mb-5 flex flex-wrap items-start justify-between gap-4 border-b border-gray-300 bg-white px-4 py-5">
        <div>
          <h1 className="text-xl font-bold text-black">{dashboard.name}</h1>
          {dashboard.description && <p className="mt-1 text-sm text-gray-600">{dashboard.description}</p>}
          <p className="mt-1 text-xs text-gray-500">{dashboard.deviceEuis.length} device(s) · {totalUplinks} uplinks (24h)</p>
        </div>
        {write && (
          <button type="button" onClick={remove} className="rounded-lg border border-red-400 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
            Supprimer
          </button>
        )}
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <DashboardCard title="Trafic agrégé (24h)" className="lg:col-span-2">
          {traffic.length === 0 ? (
            <p className="text-sm text-gray-500">Aucun uplink sur la période pour les devices sélectionnés.</p>
          ) : (
            <>
              <MetricLarge value={totalUplinks} label="uplinks totaux" />
              <div className="mt-4">
                <SparkBars values={sparkValues} />
              </div>
              <ul className="mt-4 space-y-1 text-sm text-gray-600">
                {traffic.slice(-8).map((p) => (
                  <li key={p.bucket} className="flex justify-between">
                    <span>{new Date(p.bucket).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                    <span>{p.uplinkCount} uplinks{Number.isFinite(Number(p.avgRssi)) ? ` · RSSI ${Number(p.avgRssi).toFixed(0)}` : ""}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </DashboardCard>

        <DashboardCard title="Devices">
          <ul className="divide-y divide-gray-100">
            {radios.map((r) => (
              <li key={r.devEui} className="py-3">
                <Link href={`/devices/${r.devEui}`} className="font-medium text-brand hover:underline">
                  {deviceMeta[r.devEui] ?? r.devEui}
                </Link>
                <p className="font-mono text-xs text-gray-500">{r.devEui}</p>
                <p className="mt-1 text-sm text-gray-700">
                  {r.uplinkCount} uplinks
                  {Number.isFinite(Number(r.avgRssi)) ? ` · RSSI ${Number(r.avgRssi).toFixed(1)} dBm` : ""}
                  {Number.isFinite(Number(r.avgSnr)) ? ` · SNR ${Number(r.avgSnr).toFixed(1)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </DashboardCard>
      </div>

      <div className="mt-4">
        <DashboardCard title="Derniers payloads">
          {payloads.length === 0 ? (
            <p className="text-sm text-gray-500">Aucun payload archivé pour ces devices.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-600">
                  <th className="pb-2">Device</th>
                  <th>Reçu</th>
                  <th>Port</th>
                  <th>Taille</th>
                </tr>
              </thead>
              <tbody>
                {payloads.map((p) => (
                  <tr key={`${p.devEui}-${p.id}`} className="border-b border-gray-100">
                    <td className="py-2">
                      <Link href={`/devices/${p.devEui}`} className="text-brand hover:underline">
                        {deviceMeta[p.devEui] ?? p.devEui}
                      </Link>
                    </td>
                    <td>{new Date(p.time).toLocaleString("fr-FR")}</td>
                    <td>{p.fPort ?? "—"}</td>
                    <td>{p.payloadSize != null ? `${p.payloadSize} o` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DashboardCard>
      </div>
    </div>
  );
}
