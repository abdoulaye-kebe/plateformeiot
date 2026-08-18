"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PageHeader, RoleBanner } from "@/components/ui";

type Alert = {
  id: number;
  ruleName: string;
  matchedAt: string;
  event: Record<string, unknown>;
};

type Overview = {
  totalUplinks24h: number;
  activeDevices24h: number;
  activeGateways24h: number;
  avgRssi24h?: number;
};

type Billing = {
  period: string;
  uplinkCount: number;
  activeDevices: number;
  activeGateways: number;
  estimatedEur: string;
};

export default function NocDashboard() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [ov, al, bill] = await Promise.all([
        apiFetch<Overview>("/api/v1/analytics/overview"),
        apiFetch<{ alerts: Alert[] }>("/api/v1/noc/alerts?limit=15"),
        apiFetch<Billing>("/api/v1/billing/usage"),
      ]);
      if (cancelled) return;
      setOverview(ov);
      setAlerts(al?.alerts ?? []);
      setBilling(bill);
      setLoading(false);
    }

    load();
    const timer = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (loading) {
    return <p className="p-8 text-gray-600">Chargement NOC…</p>;
  }

  const widgets = [
    { label: "Uplinks 24h", value: overview?.totalUplinks24h ?? 0, tone: "text-white" },
    { label: "Devices actifs", value: overview?.activeDevices24h ?? 0, tone: "text-brand" },
    { label: "Gateways", value: overview?.activeGateways24h ?? 0, tone: "text-brand" },
    {
      label: "RSSI moyen",
      value:
        overview?.avgRssi24h != null && Number.isFinite(Number(overview.avgRssi24h))
          ? `${Number(overview.avgRssi24h).toFixed(1)} dBm`
          : "—",
      tone: overview?.avgRssi24h != null && overview.avgRssi24h < -115 ? "text-brand-dark" : "text-white",
    },
  ];

  return (
    <div className="p-4 lg:p-6">
      <PageHeader title="Network Operations Center" subtitle="Vue temps réel · alertes · billing" />
      <RoleBanner />

      <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {widgets.map((w) => (
          <article key={w.label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-lg shadow-black/20">
            <p className="text-sm text-gray-600">{w.label}</p>
            <p className={`mt-2 text-3xl font-semibold tabular-nums ${w.tone}`}>{w.value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-medium">Alertes récentes</h2>
            <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-300">{alerts.length} events</span>
          </div>
          {alerts.length === 0 ? (
            <p className="text-sm text-gray-500">Aucune alerte — les règles RSSI déclencheront des events ici.</p>
          ) : (
            <ul className="space-y-2">
              {alerts.map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-neutral-100/60 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium text-brand-dark">{a.ruleName || "Règle"}</p>
                    <p className="text-gray-500">
                      {(a.event?.devEui as string) ?? "device ?"} · RSSI {(a.event?.rssi as number) ?? "—"} dBm
                    </p>
                  </div>
                  <time className="text-xs text-gray-500">
                    {new Date(a.matchedAt).toLocaleTimeString("fr-FR")}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-medium">Billing (mois en cours)</h2>
          {billing ? (
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-600">Période</dt>
                <dd>{billing.period}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Uplinks</dt>
                <dd className="tabular-nums">{billing.uplinkCount.toLocaleString("fr-FR")}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Devices</dt>
                <dd>{billing.activeDevices}</dd>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-3">
                <dt className="text-gray-600">Estimation</dt>
                <dd className="text-lg font-semibold text-brand">{billing.estimatedEur} €</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-sm text-gray-500">Données billing indisponibles (rôle tenant-admin requis).</p>
          )}
        </div>
      </section>
    </div>
  );
}
