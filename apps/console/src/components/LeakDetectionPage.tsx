"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiMutate } from "@/lib/api";
import { useClientAuth } from "@/lib/useClientAuth";
import { PageHeader, RoleBanner, Section, StatCard, EmptyState } from "@/components/ui";

type LeakEvent = {
  id: string;
  dev_eui: string;
  leak_type: string;
  severity: string;
  status: string;
  title: string;
  details?: Record<string, unknown>;
  flow_m3h?: number;
  index_m3?: number;
  valve_open?: boolean | null;
  detected_at: string;
  resolved_at?: string;
};

type LeakSummary = {
  active_count?: number;
  critical_count?: number;
  warning_count?: number;
  last_24h_count?: number;
};

const SEVERITY_CLASS: Record<string, string> = {
  critical: "text-red-600 font-semibold",
  warning: "text-brand-dark font-medium",
  info: "text-brand",
};

const LEAK_TYPE_LABEL: Record<string, string> = {
  device_flow_alarm: "Alarme débit compteur",
  device_inlet_alarm: "Alarme entrée d'eau",
  device_return_alarm: "Alarme retour d'eau",
  flow_overload: "Surcharge débit",
  flow_with_valve_closed: "Débit vanne fermée",
  high_continuous_flow: "Débit continu élevé",
  night_flow: "Consommation nocturne",
};

function formatFlow(m3h?: number): string {
  if (m3h == null) return "—";
  const lh = m3h * 1000;
  if (lh >= 1000) return `${m3h.toFixed(3)} m³/h`;
  return `${lh.toFixed(0)} L/h`;
}

export default function LeakDetectionPage() {
  const { write } = useClientAuth();
  const [events, setEvents] = useState<LeakEvent[]>([]);
  const [summary, setSummary] = useState<LeakSummary | null>(null);
  const [filter, setFilter] = useState<"active" | "all">("active");
  const [busy, setBusy] = useState("");
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const qs = filter === "active" ? "?status=active&limit=200" : "?limit=200";
      const data = await apiFetch<{ result?: LeakEvent[]; summary?: LeakSummary }>(`/api/v1/shengda/leaks${qs}`);
      setEvents(data?.result ?? []);
      setSummary(data?.summary ?? null);
    } catch {
      setLoadError("Impossible de charger les alertes fuites — vérifiez que shengda-water est démarré et la migration 016 appliquée.");
    }
  }, [filter]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  async function resolve(id: string, status: "resolved" | "false_positive") {
    setBusy(id);
    await apiMutate(`/api/v1/shengda/leaks/${id}`, "PATCH", { status });
    setBusy("");
    load();
  }

  return (
    <div className="p-4 lg:p-6">
      <PageHeader
        title="Détection de fuites"
        subtitle="Analyse des alarmes compteur Shengda et du débit calculé entre relevés"
      />

      <RoleBanner />

      {loadError ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{loadError}</div>
      ) : null}

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Alertes actives" value={summary?.active_count ?? 0} />
        <StatCard label="Critiques" value={summary?.critical_count ?? 0} />
        <StatCard label="Warnings" value={summary?.warning_count ?? 0} />
        <StatCard label="Dernières 24 h" value={summary?.last_24h_count ?? 0} />
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-sm">
          {(["active", "all"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 ${filter === f ? "bg-brand-light font-medium text-brand-dark" : "text-gray-600 hover:bg-gray-50"}`}
            >
              {f === "active" ? "Actives" : "Historique"}
            </button>
          ))}
        </div>
        <Link href="/apps/shengda/water-meters" className="text-sm text-brand hover:underline">
          Compteurs eau →
        </Link>
      </div>

      <Section title="Alertes fuites">
        {events.length === 0 ? (
          <EmptyState message="Aucune alerte — la détection s'exécute à chaque uplink compteur Shengda." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-600">
                  <th className="pb-2 pr-3">Sévérité</th>
                  <th className="pr-3">Alerte</th>
                  <th className="pr-3">Compteur</th>
                  <th className="pr-3">Débit</th>
                  <th className="pr-3">Vanne</th>
                  <th className="pr-3">Détecté</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-b border-gray-100">
                    <td className={`py-2.5 pr-3 capitalize ${SEVERITY_CLASS[e.severity] ?? ""}`}>{e.severity}</td>
                    <td className="pr-3">
                      <div className="font-medium text-gray-900">{e.title}</div>
                      <div className="text-xs text-gray-500">{LEAK_TYPE_LABEL[e.leak_type] ?? e.leak_type}</div>
                    </td>
                    <td className="pr-3 font-mono text-xs">
                      <Link href={`/apps/shengda/water-meters?devEui=${e.dev_eui}`} className="text-brand hover:underline">
                        {e.dev_eui}
                      </Link>
                    </td>
                    <td className="pr-3 text-gray-700">{formatFlow(e.flow_m3h)}</td>
                    <td className="pr-3 text-gray-600">
                      {e.valve_open === true ? "ouverte" : e.valve_open === false ? "fermée" : "—"}
                    </td>
                    <td className="pr-3 text-gray-600">{new Date(e.detected_at).toLocaleString("fr-FR")}</td>
                    <td className="py-2.5 text-right">
                      {e.status === "active" && write ? (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={busy === e.id}
                            onClick={() => resolve(e.id, "resolved")}
                            className="text-xs text-brand hover:underline disabled:opacity-50"
                          >
                            Résoudre
                          </button>
                          <button
                            type="button"
                            disabled={busy === e.id}
                            onClick={() => resolve(e.id, "false_positive")}
                            className="text-xs text-gray-500 hover:underline disabled:opacity-50"
                          >
                            Faux positif
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">{e.status}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        <p className="font-medium text-gray-800">Règles de détection</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>Alarmes natives compteur : flowAlarm, waterInletAlarm, flow_overload</li>
          <li>Débit calculé entre deux relevés : Δindex / Δtemps (seuil par défaut 0,05 m³/h ≈ 50 L/h)</li>
          <li>Fuite probable : consommation avec vanne fermée</li>
          <li>Consommation nocturne suspecte (22h–6h, seuil 0,02 m³/h)</li>
        </ul>
      </div>
    </div>
  );
}
