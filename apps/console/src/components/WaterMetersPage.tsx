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

type IntervalUnit = "s" | "min" | "h";

const INTERVAL_MIN = 600;
const INTERVAL_MAX = 86400;

function intervalToSeconds(value: number, unit: IntervalUnit): number {
  if (unit === "h") return Math.round(value * 3600);
  if (unit === "min") return Math.round(value * 60);
  return Math.round(value);
}

function formatInterval(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600} h`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}

const INTERVAL_PRESETS: { label: string; seconds: number }[] = [
  { label: "10 min", seconds: 600 },
  { label: "30 min", seconds: 1800 },
  { label: "1 h", seconds: 3600 },
  { label: "6 h", seconds: 21600 },
  { label: "24 h", seconds: 86400 },
];

export default function WaterMetersPage() {
  const { write } = useClientAuth();
  const [meters, setMeters] = useState<MeterRow[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [readings, setReadings] = useState<ReadingRow[]>([]);
  const [commands, setCommands] = useState<CommandRow[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [intervalValue, setIntervalValue] = useState("1");
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>("h");
  const [reportHour, setReportHour] = useState("0");
  const [intervalErr, setIntervalErr] = useState("");

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

  async function sendCommand(
    action: string,
    extra?: { interval_seconds?: number; report_hour?: number }
  ) {
    if (!selected || !write) return;
    setBusy(action);
    setMessage("");
    setIntervalErr("");
    const body: Record<string, unknown> = { action, ...extra };
    const { error } = await apiMutate(`/api/v1/shengda/meters/${selected}/commands`, "POST", body);
    setBusy("");
    if (error) {
      setMessage(error);
      return;
    }
    if (action === "set_report_interval" && extra?.interval_seconds != null) {
      setMessage(
        `Intervalle de relevé défini à ${formatInterval(extra.interval_seconds)} (${extra.interval_seconds} s) — downlink port 2 envoyé.`
      );
    } else if (action === "set_report_hour" && extra?.report_hour != null) {
      setMessage(`Heure de début de rapport définie à ${extra.report_hour} h — downlink port 2 envoyé.`);
    } else {
      setMessage(`Commande « ${action} » envoyée (port 2, confirmée).`);
    }
    loadDetails(selected);
  }

  function applyIntervalPreset(seconds: number) {
    if (seconds % 3600 === 0) {
      setIntervalValue(String(seconds / 3600));
      setIntervalUnit("h");
    } else if (seconds % 60 === 0) {
      setIntervalValue(String(seconds / 60));
      setIntervalUnit("min");
    } else {
      setIntervalValue(String(seconds));
      setIntervalUnit("s");
    }
    setIntervalErr("");
  }

  function submitInterval(e: React.FormEvent) {
    e.preventDefault();
    const raw = Number(intervalValue.replace(",", "."));
    if (!Number.isFinite(raw) || raw <= 0) {
      setIntervalErr("Saisissez une valeur numérique positive.");
      return;
    }
    const seconds = intervalToSeconds(raw, intervalUnit);
    if (seconds < INTERVAL_MIN || seconds > INTERVAL_MAX) {
      setIntervalErr(`Intervalle hors plage : ${INTERVAL_MIN} à ${INTERVAL_MAX} secondes (10 min à 24 h).`);
      return;
    }
    setIntervalErr("");
    sendCommand("set_report_interval", { interval_seconds: seconds });
  }

  function submitReportHour(e: React.FormEvent) {
    e.preventDefault();
    const hour = Number(reportHour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      setIntervalErr("Heure invalide — choisissez entre 0 et 23.");
      return;
    }
    setIntervalErr("");
    sendCommand("set_report_hour", { report_hour: hour });
  }

  const previewSeconds = (() => {
    const raw = Number(intervalValue.replace(",", "."));
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return intervalToSeconds(raw, intervalUnit);
  })();

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
          {write && (
            <Section title={`Fréquence de relevé — ${selected}`}>
              <p className="mb-4 text-xs text-gray-500">
                Paramètre downlink Shengda T=0x25 — intervalle entre deux rapports périodiques. Plage autorisée :{" "}
                {formatInterval(INTERVAL_MIN)} à {formatInterval(INTERVAL_MAX)}.
              </p>
              <form onSubmit={submitInterval} className="space-y-3">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1 text-xs text-gray-600">
                    Valeur
                    <input
                      type="number"
                      min={0.1}
                      step="any"
                      value={intervalValue}
                      onChange={(e) => {
                        setIntervalValue(e.target.value);
                        setIntervalErr("");
                      }}
                      disabled={!!busy}
                      className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-gray-600">
                    Unité
                    <select
                      value={intervalUnit}
                      onChange={(e) => {
                        setIntervalUnit(e.target.value as IntervalUnit);
                        setIntervalErr("");
                      }}
                      disabled={!!busy}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="s">secondes</option>
                      <option value="min">minutes</option>
                      <option value="h">heures</option>
                    </select>
                  </label>
                  <button
                    type="submit"
                    disabled={!!busy}
                    className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
                  >
                    Appliquer l&apos;intervalle
                  </button>
                </div>
                {previewSeconds != null && (
                  <p
                    className={`text-xs ${
                      previewSeconds < INTERVAL_MIN || previewSeconds > INTERVAL_MAX
                        ? "text-red-600"
                        : "text-gray-500"
                    }`}
                  >
                    = {previewSeconds} s
                    {previewSeconds >= INTERVAL_MIN && previewSeconds <= INTERVAL_MAX
                      ? ` (${formatInterval(previewSeconds)})`
                      : " — hors plage"}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {INTERVAL_PRESETS.map((p) => (
                    <button
                      key={p.seconds}
                      type="button"
                      disabled={!!busy}
                      onClick={() => applyIntervalPreset(p.seconds)}
                      className="rounded-full border border-gray-300 px-3 py-1 text-xs hover:border-brand hover:text-brand disabled:opacity-50"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </form>

              <form onSubmit={submitReportHour} className="mt-6 border-t border-gray-100 pt-4">
                <p className="mb-2 text-xs text-gray-500">
                  Heure de début de fenêtre de rapport (T=0x2B, 0–23 h) — optionnel.
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1 text-xs text-gray-600">
                    Heure (0–23)
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={reportHour}
                      onChange={(e) => {
                        setReportHour(e.target.value);
                        setIntervalErr("");
                      }}
                      disabled={!!busy}
                      className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={!!busy}
                    className="rounded-lg border border-brand px-4 py-2 text-sm font-medium text-brand hover:bg-brand-light disabled:opacity-50"
                  >
                    Définir l&apos;heure
                  </button>
                </div>
              </form>

              {intervalErr && <p className="mt-3 text-xs text-red-600">{intervalErr}</p>}
            </Section>
          )}

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
