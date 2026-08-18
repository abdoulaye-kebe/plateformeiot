"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { PageHeader, StatCard, Section, RoleBanner } from "@/components/ui";

export default function AnalyticsDashboard({ embedded = false }: { embedded?: boolean }) {
  const [overview, setOverview] = useState<Record<string, number | undefined> | null>(null);
  const [traffic, setTraffic] = useState<{ bucket: string; uplinkCount: number; avgRssi?: number }[]>([]);
  const [rules, setRules] = useState<{ id: string; name: string; enabled: boolean; description: string }[]>([]);

  useEffect(() => {
    async function load() {
      const [ov, tr, ru] = await Promise.all([
        apiFetch<Record<string, number>>("/api/v1/analytics/overview"),
        apiFetch<{ points: typeof traffic }>("/api/v1/analytics/traffic?hours=24"),
        apiFetch<{ result: typeof rules }>("/api/v1/rules/"),
      ]);
      setOverview(ov);
      setTraffic(tr?.points ?? []);
      setRules(ru?.result ?? []);
    }
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className={embedded ? "p-4 lg:p-6" : "p-4 lg:p-6"}>
      {!embedded && (
        <>
          <PageHeader title="Analytics" subtitle="Trafic MQTT · TimescaleDB · métriques radio 24h" />
          <RoleBanner />
        </>
      )}
      {embedded && (
        <>
          <h1 className="mb-1 text-xl font-bold">Analytics</h1>
          <p className="mb-6 text-sm text-gray-600">Trafic MQTT · TimescaleDB · métriques radio 24h</p>
        </>
      )}

      <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Uplinks 24h" value={overview?.totalUplinks24h ?? 0} />
        <StatCard label="Devices actifs" value={overview?.activeDevices24h ?? 0} />
        <StatCard label="Gateways actifs" value={overview?.activeGateways24h ?? 0} />
        <StatCard label="RSSI moyen" value={overview?.avgRssi24h != null ? `${Number(overview.avgRssi24h).toFixed(1)} dBm` : "—"} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Trafic horaire">
          {traffic.length === 0 ? (
            <p className="text-sm text-gray-500">Aucune donnée — vérifiez que vos devices envoient du trafic et que l&apos;intégration MQTT est active.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {traffic.slice(-12).map((p) => (
                <li key={p.bucket} className="flex justify-between text-gray-700">
                  <span>{new Date(p.bucket).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                  <span>{p.uplinkCount} uplinks {Number.isFinite(Number(p.avgRssi)) ? `· RSSI ${Number(p.avgRssi).toFixed(0)}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Règles liées">
          <ul className="space-y-2 text-sm">
            {rules.map((r) => (
              <li key={r.id} className="rounded-lg border border-gray-200 p-3">
                <p className="font-medium">{r.name}</p>
                <p className="text-gray-500">{r.description || "—"}</p>
              </li>
            ))}
          </ul>
          <Link href="/rules" className="mt-3 inline-block text-xs text-brand hover:underline">Gérer les règles →</Link>
        </Section>
      </div>
    </div>
  );
}
