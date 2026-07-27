"use client";

import { useEffect, useState } from "react";
import { apiFetch, apiMutate } from "@/lib/api";
import { useClientAuth } from "@/lib/useClientAuth";
import { PageHeader, Section, StatCard } from "@/components/ui";

type Anomaly = {
  id: string;
  anomalyType: string;
  severity: string;
  devEui?: string;
  title: string;
  details: Record<string, unknown>;
  detectedAt: string;
  resolvedAt?: string;
};

type Summary = {
  openCount: number;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
};

const SEVERITY_COLOR: Record<string, string> = {
  critical: "text-red-400",
  warning: "text-amber-300",
  info: "text-sky-300",
};

export default function AnomaliesPage() {
  const { write } = useClientAuth();
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);

  async function load() {
    const data = await apiFetch<{ result: Anomaly[]; summary: Summary }>("/api/v1/analytics/anomalies?limit=100");
    setAnomalies(data?.result ?? []);
    setSummary(data?.summary ?? null);
  }

  useEffect(() => { load(); }, []);

  async function resolve(id: string) {
    await apiMutate(`/api/v1/analytics/anomalies/${id}/resolve`, "PATCH");
    load();
  }

  return (
    <div className="p-8">
      <PageHeader title="Anomalies" subtitle="Détection automatique RSSI, silence devices, pics de trafic" />

      <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Anomalies ouvertes" value={summary?.openCount ?? 0} tone="text-amber-300" />
        <StatCard label="Critiques" value={summary?.bySeverity?.critical ?? 0} tone="text-red-400" />
        <StatCard label="Warnings" value={summary?.bySeverity?.warning ?? 0} />
        <StatCard label="Devices silencieux" value={summary?.byType?.silent_device ?? 0} />
      </section>

      <Section title="Événements détectés">
        {anomalies.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune anomalie — le worker analyse le trafic toutes les 5 minutes.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-slate-400">
                <th className="pb-2">Sévérité</th>
                <th>Titre</th>
                <th>Device</th>
                <th>Type</th>
                <th>Détecté</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {anomalies.map((a) => (
                <tr key={a.id} className="border-b border-slate-800/50">
                  <td className={`py-2 capitalize ${SEVERITY_COLOR[a.severity] ?? ""}`}>{a.severity}</td>
                  <td>{a.title}</td>
                  <td className="font-mono text-xs">{a.devEui || "—"}</td>
                  <td className="text-slate-400">{a.anomalyType}</td>
                  <td className="text-slate-400">{new Date(a.detectedAt).toLocaleString("fr-FR")}</td>
                  <td>
                    {!a.resolvedAt && write && (
                      <button type="button" onClick={() => resolve(a.id)} className="text-xs text-emerald-400 hover:underline">
                        Résoudre
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}
