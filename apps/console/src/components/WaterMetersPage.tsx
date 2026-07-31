"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiMutate } from "@/lib/api";
import { useClientAuth } from "@/lib/useClientAuth";
import { PageHeader, RoleBanner, Section, EmptyState } from "@/components/ui";

type MeterRow = {
  dev_eui: string;
  name?: string;
  meter_number?: number;
  last_index_m3?: number;
  last_index_liters?: number;
  valve_open?: boolean | null;
  battery_v?: number;
  magnetic_attack?: boolean;
  battery_low?: boolean;
  last_reading_at?: string;
};

type ReadingRow = {
  time: string;
  index_m3?: number;
  battery_v?: number;
  valve_open?: boolean;
  trigger_label?: string;
  raw_hex?: string;
};

type CommandRow = {
  id: string;
  command_type: string;
  status: string;
  created_at: string;
  detail?: string;
};

export default function WaterMetersPage() {
  const { write } = useClientAuth();
  const [meters, setMeters] = useState<MeterRow[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [readings, setReadings] = useState<ReadingRow[]>([]);
  const [commands, setCommands] = useState<CommandRow[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const loadMeters = useCallback(async () => {
    const data = await apiFetch<{ result?: MeterRow[] }>("/api/v1/shengda/meters?limit=200");
    const rows = data?.result ?? [];
    setMeters(rows);
    if (!selected && rows.length > 0) {
      setSelected(rows[0].dev_eui);
    }
  }, [selected]);

  const loadDetails = useCallback(async (devEui: string) => {
    if (!devEui) return;
    const [r, c] = await Promise.all([
      apiFetch<{ result?: ReadingRow[] }>(`/api/v1/shengda/meters/${devEui}/readings?limit=20`),
      apiFetch<{ result?: CommandRow[] }>(`/api/v1/shengda/meters/${devEui}/commands?limit=10`),
    ]);
    setReadings(r?.result ?? []);
    setCommands(c?.result ?? []);
  }, []);

  useEffect(() => {
    loadMeters();
  }, [loadMeters]);

  useEffect(() => {
    if (selected) loadDetails(selected);
  }, [selected, loadDetails]);

  async function sendCommand(action: string) {
    if (!selected || !write) return;
    setBusy(action);
    setMessage("");
    const { error } = await apiMutate(`/api/v1/shengda/meters/${selected}/commands`, "POST", { action });
    setBusy("");
    if (error) {
      setMessage(error);
      return;
    }
    setMessage(`Commande « ${action} » envoyée (port 2, confirmée).`);
    loadDetails(selected);
  }

  const active = meters.find((m) => m.dev_eui === selected);

  return (
    <div className="p-4 lg:p-6">
      <PageHeader
        title="Compteurs d'eau Shengda"
        subtitle="Télérelevé d'index, état vanne et commandes downlink (protocole V1.6)"
      />
      <RoleBanner />

      {message && (
        <p className="mb-4 rounded-lg border border-brand bg-brand-light px-4 py-3 text-sm text-brand-dark">{message}</p>
      )}

      <p className="mb-4 text-sm">
        <Link href="/data/decoders" className="text-brand hover:underline">
          Décodeurs JavaScript ChirpStack →
        </Link>
      </p>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <article className="card-live p-5">
          <p className="text-sm text-gray-600">Compteurs suivis</p>
          <p className="mt-2 text-3xl font-bold">{meters.length}</p>
        </article>
        <article className="card-live p-5">
          <p className="text-sm text-gray-600">Index actuel</p>
          <p className="mt-2 text-3xl font-bold tabular-nums">
            {active?.last_index_m3 != null ? `${active.last_index_m3} m³` : "—"}
          </p>
        </article>
        <article className="card-live p-5">
          <p className="text-sm text-gray-600">Vanne</p>
          <p className="mt-2 text-3xl font-bold">
            {active?.valve_open == null ? "—" : active.valve_open ? "Ouverte" : "Fermée"}
          </p>
        </article>
      </div>

      <Section title="Compteurs">
        {meters.length === 0 ? (
          <EmptyState message="Aucun relevé Shengda encore reçu. Les uplinks sont décodés automatiquement dès réception sur le réseau." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-600">
                  <th className="pb-2">DevEUI</th>
                  <th>Index (m³)</th>
                  <th>Vanne</th>
                  <th>Batterie</th>
                  <th>Alertes</th>
                  <th>Dernier relevé</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {meters.map((m) => (
                  <tr
                    key={m.dev_eui}
                    className={`border-b border-gray-100 cursor-pointer ${selected === m.dev_eui ? "bg-brand-light/40" : ""}`}
                    onClick={() => setSelected(m.dev_eui)}
                  >
                    <td className="py-3 font-mono text-xs">{m.dev_eui}</td>
                    <td className="tabular-nums">{m.last_index_m3 ?? "—"}</td>
                    <td>{m.valve_open == null ? "—" : m.valve_open ? "Ouverte" : "Fermée"}</td>
                    <td>{m.battery_v != null ? `${m.battery_v} V` : "—"}</td>
                    <td className="text-xs">
                      {m.magnetic_attack && <span className="mr-1 text-red-600">Magnétique</span>}
                      {m.battery_low && <span className="text-amber-600">Batterie</span>}
                      {!m.magnetic_attack && !m.battery_low && "—"}
                    </td>
                    <td className="text-xs text-gray-500">
                      {m.last_reading_at ? new Date(m.last_reading_at).toLocaleString("fr-FR") : "—"}
                    </td>
                    <td>
                      <Link href={`/devices/${m.dev_eui}`} className="text-brand hover:underline" onClick={(e) => e.stopPropagation()}>
                        Device →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {selected && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Section
            title={`Contrôle vanne — ${selected}`}
            action={
              write ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => sendCommand("open")}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Ouvrir
                  </button>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => sendCommand("close")}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Fermer
                  </button>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => sendCommand("dredge")}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
                  >
                    Débourrer
                  </button>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => sendCommand("read")}
                    className="rounded-lg border border-brand px-3 py-1.5 text-xs font-medium text-brand hover:bg-brand-light disabled:opacity-50"
                  >
                    Télérelevé
                  </button>
                </div>
              ) : null
            }
          >
            <p className="mb-4 text-xs text-gray-500">
              Downlink port 2, confirmé — hex ouvert <code className="font-mono">261F0045</code>, fermé{" "}
              <code className="font-mono">261F0146</code>. Le device doit être connecté au réseau.
            </p>
            {commands.length === 0 ? (
              <EmptyState message="Aucune commande envoyée." />
            ) : (
              <ul className="space-y-2 text-sm">
                {commands.map((c) => (
                  <li key={c.id} className="flex justify-between rounded border border-gray-100 px-3 py-2">
                    <span>
                      {c.command_type}{" "}
                      <span className="text-xs text-gray-500">{new Date(c.created_at).toLocaleString("fr-FR")}</span>
                    </span>
                    <span className={c.status === "sent" ? "text-emerald-600" : c.status === "failed" ? "text-red-600" : "text-gray-500"}>
                      {c.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Historique des relevés">
            {readings.length === 0 ? (
              <EmptyState message="Pas encore de relevé archivé pour ce compteur." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-600">
                      <th className="pb-2">Date</th>
                      <th>Index m³</th>
                      <th>Vanne</th>
                      <th>Batterie</th>
                      <th>Déclencheur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {readings.map((r, i) => (
                      <tr key={`${r.time}-${i}`} className="border-b border-gray-100">
                        <td className="py-2 text-xs">{new Date(r.time).toLocaleString("fr-FR")}</td>
                        <td className="tabular-nums">{r.index_m3 ?? "—"}</td>
                        <td>{r.valve_open == null ? "—" : r.valve_open ? "Ouverte" : "Fermée"}</td>
                        <td>{r.battery_v != null ? `${r.battery_v} V` : "—"}</td>
                        <td className="text-xs text-gray-500">{r.trigger_label ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}
