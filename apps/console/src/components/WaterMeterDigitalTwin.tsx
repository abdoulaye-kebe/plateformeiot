"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const METER_IMG = "/twin/shengda-meter.png";
const GATEWAY_IMG = "/twin/lorawan-gateway.png";

export type TwinReading = {
  time: string;
  index_m3?: number;
  battery_v?: number;
  valve_open?: boolean;
  trigger_label?: string;
};

export type TwinCommand = {
  id: string;
  command_type: string;
  status: string;
  created_at: string;
};

export type TwinLeak = {
  id: string;
  leak_type: string;
  severity: string;
  title: string;
  flow_m3h?: number;
  detected_at: string;
};

export type TwinMeter = {
  dev_eui: string;
  name?: string;
  last_index_m3?: number;
  last_index_liters?: number;
  valve_open?: boolean | null;
  battery_v?: number;
  magnetic_attack?: boolean;
  battery_low?: boolean;
  last_reading_at?: string;
};

export type NetworkContext = {
  gatewayId?: string;
  gatewayName?: string;
  gatewayState?: string;
  gatewayLastSeen?: string;
  rssi?: number;
  snr?: number;
  dr?: number;
  deviceStatus?: string;
  uplinkCount24h?: number;
};

type Props = {
  meter?: TwinMeter;
  readings?: TwinReading[];
  commands?: TwinCommand[];
  leaks?: TwinLeak[];
  network?: NetworkContext;
  write?: boolean;
  busy?: string;
  queueCount?: number;
  onCommand?: (action: string) => void | Promise<void>;
};

const ORANGE = "#FF7900";

function asNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function computeFlowM3h(readings: TwinReading[]): number | null {
  const withIndex = readings
    .map((r) => ({ ...r, index_m3: asNumber(r.index_m3) }))
    .filter((r) => r.index_m3 != null);
  if (withIndex.length < 2) return null;
  const a = withIndex[1];
  const b = withIndex[0];
  const t0 = new Date(a.time).getTime();
  const t1 = new Date(b.time).getTime();
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return null;
  const hours = (t1 - t0) / 3_600_000;
  if (hours <= 0 || hours > 48) return null;
  const delta = (b.index_m3 as number) - (a.index_m3 as number);
  if (delta < 0) return null;
  return Math.round((delta / hours) * 10000) / 10000;
}

function healthStatus(
  meter: TwinMeter | undefined,
  leaks: TwinLeak[],
  flowM3h: number | null,
  valveOpen: boolean | null | undefined,
  network?: NetworkContext
): { label: string; tone: "ok" | "warn" | "crit" } {
  if (leaks.some((l) => l.severity === "critical")) return { label: "Alerte critique", tone: "crit" };
  if (meter?.magnetic_attack) return { label: "Attaque magnétique", tone: "crit" };
  if (valveOpen === false && flowM3h != null && flowM3h > 0.02) return { label: "Fuite probable", tone: "crit" };
  if (network?.deviceStatus === "offline") return { label: "Capteur offline", tone: "crit" };
  if (network?.gatewayState === "OFFLINE") return { label: "Gateway offline", tone: "warn" };
  if (leaks.length > 0 || meter?.battery_low) return { label: "Attention requise", tone: "warn" };
  return { label: "Nominal", tone: "ok" };
}

function formatFlow(m3h: number | null): string {
  if (m3h == null) return "—";
  const lh = m3h * 1000;
  if (lh < 1) return `${(lh * 1000).toFixed(0)} mL/h`;
  if (lh < 1000) return `${lh.toFixed(1)} L/h`;
  return `${m3h.toFixed(3)} m³/h`;
}

function rssiQuality(rssi?: number): { label: string; color: string; pct: number } {
  if (rssi == null) return { label: "—", color: "#94A3B8", pct: 0 };
  if (rssi >= -90) return { label: "Excellent", color: "#059669", pct: 95 };
  if (rssi >= -105) return { label: "Bon", color: "#10B981", pct: 75 };
  if (rssi >= -115) return { label: "Faible", color: "#F59E0B", pct: 45 };
  return { label: "Critique", color: "#DC2626", pct: 20 };
}

function formatSnr(value: unknown): string {
  const n = asNumber(value);
  return n != null ? `${n.toFixed(1)} dB` : "—";
}

function formatRssi(value: unknown): string {
  const n = asNumber(value);
  return n != null ? `${Math.round(n)} dBm` : "—";
}

function deviceStatusLabel(status?: string): string {
  if (status === "online") return "En ligne";
  if (status === "sleeping") return "Veille";
  if (status === "offline") return "Hors ligne";
  return status ?? "—";
}

function formatDateFr(value?: string): string {
  if (!value) return "";
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function NetworkTopology({
  devEui,
  indexM3,
  indexLiters,
  valveOpen,
  batteryV,
  flowM3h,
  isFlowing,
  network,
  linkActive,
}: {
  devEui: string;
  indexM3?: number;
  indexLiters?: number;
  valveOpen?: boolean | null;
  batteryV?: number;
  flowM3h: number | null;
  isFlowing: boolean;
  network?: NetworkContext;
  linkActive: boolean;
}) {
  const valveColor = valveOpen === false ? "#DC2626" : valveOpen === true ? "#059669" : "#94A3B8";
  const valveLabel = valveOpen === false ? "Fermée" : valveOpen === true ? "Ouverte" : "Vanne";
  const batt = asNumber(batteryV);
  const rssi = rssiQuality(asNumber(network?.rssi));
  const gwOnline = network?.gatewayState === "ONLINE";
  const gwColor = gwOnline ? "#059669" : network?.gatewayState === "OFFLINE" ? "#DC2626" : "#F59E0B";

  return (
    <div
      className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,260px)_minmax(0,1fr)]"
      role="img"
      aria-label="Topologie réseau jumeau numérique"
    >
      {/* ── Compteur capteur ── */}
      <div className="flex flex-col">
        <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-widest text-brand">Capteur · Shengda</p>
        <div className="flex flex-1 flex-col rounded-xl border-2 p-3" style={{ borderColor: ORANGE }}>
          <div className="relative overflow-hidden rounded-lg bg-white shadow-inner">
            {/* img natif : évite l'optimiseur Next.js (400 en standalone Docker) */}
            <img
              src={METER_IMG}
              alt="Compteur d'eau LoRaWAN Shengda"
              width={400}
              height={400}
              className="mx-auto h-auto w-full max-h-[180px] object-contain p-3"
            />
            <span
              className="absolute bottom-2 right-2 rounded-full px-2.5 py-1 text-[10px] font-bold text-white shadow"
              style={{ background: valveColor }}
            >
              {valveLabel}
            </span>
            {isFlowing && (
              <span className="absolute left-2 top-2 rounded-full bg-sky-500/90 px-2 py-0.5 text-[9px] font-bold text-white">
                ● Débit
              </span>
            )}
          </div>
          <div className="mt-3 space-y-1 text-center">
            <p className="font-mono text-[9px] text-neutral-400">{devEui}</p>
            <p className="text-2xl font-bold tabular-nums text-brand">{indexM3 != null ? `${indexM3.toFixed(3)} m³` : "—"}</p>
            <div className="flex flex-wrap justify-center gap-3 text-[11px] text-neutral-300">
              <span>{batt != null ? `${batt} V` : "Batt. —"}</span>
              <span className="text-sky-300">{formatFlow(flowM3h)}</span>
              {indexLiters != null && <span className="text-neutral-500">{indexLiters.toLocaleString("fr-FR")} imp.</span>}
            </div>
          </div>
        </div>
      </div>

      {/* ── Lien LoRaWAN ── */}
      <div className="flex flex-col justify-center py-2">
        <p className="mb-3 text-center text-[10px] font-bold uppercase tracking-widest text-neutral-400">
          Lien LoRaWAN EU868
        </p>
        <div className="relative flex items-center justify-center py-4">
          <div
            className={`h-0.5 w-full ${linkActive ? "bg-gradient-to-r from-brand via-emerald-400 to-brand" : "border-t-2 border-dashed border-neutral-600 bg-transparent"}`}
          />
          {linkActive && (
            <div className="absolute inset-0 flex items-center justify-around px-2">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-2.5 w-2.5 rounded-full shadow"
                  style={{ background: rssi.color, animation: `pulse 1.5s ease-in-out ${i * 0.4}s infinite` }}
                />
              ))}
            </div>
          )}
        </div>
        <div className="rounded-xl border bg-neutral-900/80 p-3" style={{ borderColor: rssi.color }}>
          <p className="text-center text-xs text-neutral-200">RSSI {formatRssi(network?.rssi)}</p>
          <p className="text-center text-xs text-neutral-200">SNR {formatSnr(network?.snr)}</p>
          <p className="mt-1 text-center text-[11px] font-medium" style={{ color: rssi.color }}>
            {rssi.label} · DR{network?.dr ?? "?"}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-800">
            <div className="h-full rounded-full transition-all" style={{ width: `${rssi.pct}%`, background: rssi.color }} />
          </div>
        </div>
        <div className="mt-3 hidden text-center text-[10px] text-neutral-500 lg:block">
          {linkActive ? "↔ Uplink / Downlink actif" : "Lien inactif ou device offline"}
        </div>
      </div>

      {/* ── Gateway ── */}
      <div className="flex flex-col">
        <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-widest" style={{ color: gwColor }}>
          Gateway · {network?.gatewayState ?? "—"}
        </p>
        <div className="flex flex-1 flex-col rounded-xl border-2 p-3" style={{ borderColor: gwColor }}>
          <div className="relative overflow-hidden rounded-lg bg-black">
            <img
              src={GATEWAY_IMG}
              alt="Passerelle LoRaWAN"
              width={400}
              height={280}
              className="mx-auto h-auto w-full max-h-[160px] object-contain"
            />
            <span
              className="absolute left-2 top-2 rounded px-2 py-0.5 text-[9px] font-bold uppercase text-white shadow"
              style={{ background: gwColor }}
            >
              {network?.gatewayState ?? "—"}
            </span>
          </div>
          <div className="mt-3 space-y-1 text-center">
            <p className="font-mono text-[10px] text-neutral-300">{network?.gatewayId ?? "—"}</p>
            <p className="text-sm font-medium text-neutral-200">{network?.gatewayName ?? "Passerelle LoRaWAN"}</p>
            {network?.gatewayLastSeen && formatDateFr(network.gatewayLastSeen) && (
              <p className="text-[10px] text-neutral-500">
                Vu {formatDateFr(network.gatewayLastSeen)}
              </p>
            )}
            <p className="text-[10px] text-neutral-500">EU868 · Multi-plateforme</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  tone,
  disabled,
  loading,
  onClick,
}: {
  label: string;
  tone: "green" | "red" | "neutral" | "brand";
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
}) {
  const cls =
    tone === "green"
      ? "bg-emerald-600 hover:bg-emerald-700 text-white"
      : tone === "red"
        ? "bg-red-600 hover:bg-red-700 text-white"
        : tone === "brand"
          ? "border-2 border-brand text-brand hover:bg-brand-light"
          : "border border-gray-400 text-gray-700 hover:bg-gray-100";
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${cls}`}
    >
      {loading ? "Envoi…" : label}
    </button>
  );
}

function EventTimeline({ readings, commands }: { readings: TwinReading[]; commands: TwinCommand[] }) {
  const safeReadings = Array.isArray(readings) ? readings : [];
  const safeCommands = Array.isArray(commands) ? commands : [];
  const events = useMemo(() => {
    const items: { time: string; kind: string; label: string; detail?: string }[] = [];
    for (const r of safeReadings.slice(0, 6)) {
      const idx = asNumber(r.index_m3);
      items.push({
        time: r.time,
        kind: "reading",
        label: `Uplink · ${idx != null ? `${idx} m³` : "—"}`,
        detail: r.trigger_label,
      });
    }
    for (const c of safeCommands.slice(0, 4)) {
      items.push({
        time: c.created_at,
        kind: "command",
        label: `Downlink · ${c.command_type}`,
        detail: c.status,
      });
    }
    return items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 8);
  }, [safeReadings, safeCommands]);

  if (events.length === 0) return <p className="text-xs text-gray-500">Aucun événement réseau récent.</p>;

  return (
    <ul className="space-y-2">
      {events.map((e, i) => (
        <li key={`${e.time}-${i}`} className="flex gap-3 text-xs">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${e.kind === "command" ? "bg-brand" : "bg-sky-400"}`} />
          <div>
            <p className="font-medium text-gray-800">{e.label}</p>
            <p className="text-gray-500">
              {new Date(e.time).toLocaleString("fr-FR")}
              {e.detail ? ` · ${e.detail}` : ""}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

type TwinMode = "simulation" | "live";

function simCommandLabel(action: string): string {
  if (action === "open") return "Ouvrir vanne";
  if (action === "close") return "Fermer vanne";
  if (action === "read") return "Télérelevé";
  if (action === "dredge") return "Débourrer";
  return action;
}

export default function WaterMeterDigitalTwin({
  meter,
  readings,
  commands,
  leaks,
  network,
  write,
  busy,
  queueCount = 0,
  onCommand,
}: Props) {
  const safeReadings = Array.isArray(readings) ? readings : [];
  const safeCommands = Array.isArray(commands) ? commands : [];
  const safeLeaks = Array.isArray(leaks) ? leaks : [];

  const [syncLabel, setSyncLabel] = useState("");
  const [mode, setMode] = useState<TwinMode>("simulation");
  const [simValveOpen, setSimValveOpen] = useState<boolean | null>(null);
  const [simCommands, setSimCommands] = useState<TwinCommand[]>([]);
  const [simBusy, setSimBusy] = useState("");
  const [simNote, setSimNote] = useState("");

  const devEui = meter?.dev_eui ?? "";
  const realValveOpen = meter?.valve_open ?? safeReadings[0]?.valve_open;
  const valveOpen = mode === "simulation" && simValveOpen != null ? simValveOpen : realValveOpen;
  const indexM3 = asNumber(meter?.last_index_m3 ?? safeReadings[0]?.index_m3);
  const indexLiters = asNumber(meter?.last_index_liters);
  const batteryV = asNumber(meter?.battery_v ?? safeReadings[0]?.battery_v);
  const lastAt = meter?.last_reading_at ?? safeReadings[0]?.time;

  const displayedCommands = mode === "simulation" ? simCommands : safeCommands;
  const activeBusy = mode === "simulation" ? simBusy : busy;

  const flowM3h = useMemo(() => computeFlowM3h(safeReadings), [safeReadings]);
  const health = healthStatus(meter, safeLeaks, flowM3h, valveOpen, mode === "live" ? network : undefined);
  const isFlowing = valveOpen !== false && flowM3h != null && flowM3h > 0.001;
  const linkActive =
    mode === "simulation" || (network?.deviceStatus !== "offline" && network?.gatewayState !== "OFFLINE");

  const healthColor = health.tone === "crit" ? "#DC2626" : health.tone === "warn" ? "#D97706" : "#059669";

  useEffect(() => {
    setSimValveOpen(null);
    setSimCommands([]);
    setSimNote("");
  }, [devEui]);

  useEffect(() => {
    if (!lastAt) {
      setSyncLabel("");
      return;
    }
    const t = new Date(lastAt).getTime();
    if (!Number.isFinite(t)) {
      setSyncLabel("");
      return;
    }
    const ageMin = Math.round((Date.now() - t) / 60_000);
    setSyncLabel(
      ageMin >= 0 && ageMin < 120
        ? ` · sync il y a ${ageMin} min`
        : ` · sync ${new Date(lastAt).toLocaleString("fr-FR")}`
    );
  }, [lastAt]);

  async function cmd(action: string) {
    if (!write || activeBusy) return;

    if (mode === "simulation") {
      setSimBusy(action);
      setSimNote("");
      await new Promise((r) => setTimeout(r, 400));
      if (action === "open") setSimValveOpen(true);
      if (action === "close") setSimValveOpen(false);
      setSimCommands((prev) => [
        {
          id: `sim-${Date.now()}`,
          command_type: simCommandLabel(action),
          status: "simulated",
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setSimNote(`Simulation : « ${simCommandLabel(action)} » — aucun downlink envoyé au réseau.`);
      setSimBusy("");
      return;
    }

    if (!onCommand) return;
    await onCommand(action);
  }

  function resetSimulation() {
    setSimValveOpen(null);
    setSimCommands([]);
    setSimNote("");
  }

  return (
    <section className="mb-8 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Jumeau numérique réseau</h2>
          <p className="text-sm text-gray-500">
            Capteur ↔ Gateway ↔ Plateforme
            {mode === "simulation" ? " — mode simulation (local)" : " — contrôle live"}
            {syncLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {write && (
            <div className="flex rounded-lg border border-gray-300 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setMode("simulation")}
                className={`rounded-md px-3 py-1.5 font-medium ${
                  mode === "simulation" ? "bg-sky-600 text-white" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                Simulation
              </button>
              <button
                type="button"
                onClick={() => setMode("live")}
                className={`rounded-md px-3 py-1.5 font-medium ${
                  mode === "live" ? "bg-brand text-white" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                Live réseau
              </button>
            </div>
          )}
          <span className="rounded-full px-3 py-1 text-xs font-bold text-white" style={{ background: healthColor }}>
            {health.label}
          </span>
        </div>
      </div>

      {mode === "simulation" && (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <strong>Mode simulation</strong> — les actions modifient uniquement le jumeau à l&apos;écran. Aucune commande
          n&apos;est envoyée à ChirpStack ni au compteur physique. Passez en <strong>Live réseau</strong> pour piloter le
          device réel.
        </p>
      )}

      {mode === "live" && write && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Mode live</strong> — chaque action envoie un downlink confirmé (port 2) vers le compteur via la gateway.
        </p>
      )}

      <div
        className={`overflow-hidden rounded-2xl border-2 bg-gradient-to-b from-neutral-900 to-neutral-950 p-4 sm:p-6 ${
          mode === "simulation" ? "border-sky-500" : "border-brand"
        }`}
      >
        <NetworkTopology
          devEui={devEui}
          indexM3={indexM3}
          indexLiters={indexLiters}
          valveOpen={valveOpen}
          batteryV={batteryV}
          flowM3h={flowM3h}
          isFlowing={isFlowing}
          network={network}
          linkActive={linkActive}
        />

        {mode === "simulation" && (
          <p className="mb-3 text-center text-[10px] font-bold uppercase tracking-widest text-sky-400">
            ● Jumeau virtuel — réseau non impacté
          </p>
        )}

        {/* Actions */}
        {write ? (
          <div className="mt-4 border-t border-neutral-700 pt-4">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-brand">
              {mode === "simulation" ? "Simuler une action sur le jumeau" : "Agir sur le jumeau → push device"}
            </p>
            <div className="flex flex-wrap gap-2">
              <ActionButton label="Ouvrir vanne" tone="green" loading={activeBusy === "open"} disabled={!!activeBusy} onClick={() => cmd("open")} />
              <ActionButton label="Fermer vanne" tone="red" loading={activeBusy === "close"} disabled={!!activeBusy} onClick={() => cmd("close")} />
              <ActionButton label="Télérelevé" tone="brand" loading={activeBusy === "read"} disabled={!!activeBusy} onClick={() => cmd("read")} />
              <ActionButton label="Débourrer" tone="neutral" loading={activeBusy === "dredge"} disabled={!!activeBusy} onClick={() => cmd("dredge")} />
              {mode === "simulation" && (simValveOpen != null || simCommands.length > 0) && (
                <button
                  type="button"
                  onClick={resetSimulation}
                  className="rounded-lg border border-neutral-500 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
                >
                  Réinitialiser
                </button>
              )}
            </div>
            {mode === "simulation" ? (
              <p className="mt-2 text-[11px] text-sky-300/80">
                État vanne simulé
                {simValveOpen == null ? " — aligné sur le device réel" : simValveOpen ? " — ouverte (virtuel)" : " — fermée (virtuel)"}
                {simNote ? ` · ${simNote}` : ""}
              </p>
            ) : (
              <p className="mt-2 text-[11px] text-neutral-500">
                Downlink port 2 confirmé · Class A — transmis au prochain uplink
                {queueCount > 0 ? ` · ${queueCount} commande(s) en file ChirpStack` : " · file vide"}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-4 text-xs text-neutral-500">Mode lecture seule — connectez-vous en operator/admin pour piloter le capteur.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {[
          { label: "Index", value: indexM3 != null ? `${indexM3} m³` : "—" },
          { label: "Vanne", value: valveOpen == null ? "—" : valveOpen ? "Ouverte" : "Fermée" },
          { label: "Capteur", value: deviceStatusLabel(network?.deviceStatus) },
          { label: "Gateway", value: network?.gatewayState ?? "—" },
          { label: "RSSI", value: formatRssi(network?.rssi) },
          { label: "Uplinks 24h", value: network?.uplinkCount24h ?? "—" },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-[10px] font-bold uppercase text-gray-500">{m.label}</p>
            <p className="mt-1 text-sm font-bold text-gray-900">{m.value}</p>
          </div>
        ))}
      </div>

      {network?.gatewayId && (
        <p className="text-xs text-gray-500">
          Gateway :{" "}
          <Link href={`/gateways/${network.gatewayId}`} className="font-mono text-brand hover:underline">
            {network.gatewayId}
          </Link>
          {" · "}
          <Link href={`/devices/${devEui}`} className="text-brand hover:underline">
            Fiche device LoRaWAN →
          </Link>
        </p>
      )}

      {safeLeaks.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-xs font-bold uppercase text-red-800">Alertes fuites synchronisées</p>
          <ul className="mt-2 space-y-1">
            {safeLeaks.map((l, i) => (
              <li key={l.id ?? `leak-${i}`} className="text-sm text-red-900">
                {l.title ?? l.leak_type}
              </li>
            ))}
          </ul>
          <Link href="/apps/shengda/leak-detection" className="mt-2 inline-block text-xs text-red-700 hover:underline">
            Voir détection fuites →
          </Link>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-brand-dark">Flux réseau (uplink / downlink)</p>
          <EventTimeline readings={safeReadings} commands={displayedCommands} />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-brand-dark">Chaîne jumeau → physique</p>
          <dl className="space-y-2 text-sm">
            {[
              ["Action jumeau", "POST /shengda/meters/{devEui}/commands"],
              ["Downlink", "ChirpStack queue port 2 → gateway → capteur"],
              ["Uplink retour", "Capteur → gateway → mqtt-ingestion → jumeau"],
              ["Sync jumeau", "Refresh auto 15 s + état vanne/index"],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-2 border-b border-gray-100 pb-2 last:border-0">
                <dt className="w-28 shrink-0 font-medium text-gray-800">{k}</dt>
                <dd className="font-mono text-[11px] text-gray-600">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
