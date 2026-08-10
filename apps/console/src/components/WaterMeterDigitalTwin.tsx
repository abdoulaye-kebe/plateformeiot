"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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

function deviceStatusLabel(status?: string): string {
  if (status === "online") return "En ligne";
  if (status === "sleeping") return "Veille";
  if (status === "offline") return "Hors ligne";
  return status ?? "—";
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
  const batt = asNumber(batteryV);
  const rssi = rssiQuality(network?.rssi);
  const gwOnline = network?.gatewayState === "ONLINE";
  const gwColor = gwOnline ? "#059669" : network?.gatewayState === "OFFLINE" ? "#DC2626" : "#F59E0B";

  return (
    <svg viewBox="0 0 720 220" className="mx-auto w-full" role="img" aria-label="Topologie réseau jumeau numérique">
      {/* ── Compteur capteur ── */}
      <g transform="translate(20, 30)">
        <rect width={180} height={150} rx={12} fill="#1F2937" stroke={ORANGE} strokeWidth={2} />
        <text x={90} y={22} textAnchor="middle" fontSize={10} fill={ORANGE} fontWeight="bold">
          CAPTEUR · Shengda
        </text>
        <text x={90} y={36} textAnchor="middle" fontSize={8} fill="#94A3B8" fontFamily="monospace">
          {devEui.slice(0, 8)}…
        </text>
        <rect x={30} y={48} width={120} height={32} rx={4} fill="#0F172A" stroke="#334155" />
        <text x={90} y={62} textAnchor="middle" fontSize={8} fill="#64748B">
          INDEX m³
        </text>
        <text x={90} y={76} textAnchor="middle" fontSize={14} fontWeight="bold" fill={ORANGE} fontFamily="monospace">
          {indexM3 != null ? indexM3.toFixed(3) : "—"}
        </text>
        <g transform="translate(40, 92)">
          <rect width={40} height={40} rx={6} fill="#0F172A" stroke={valveColor} strokeWidth={2} />
          {valveOpen === false ? (
            <>
              <line x1={8} y1={8} x2={32} y2={32} stroke={valveColor} strokeWidth={2.5} />
              <line x1={32} y1={8} x2={8} y2={32} stroke={valveColor} strokeWidth={2.5} />
            </>
          ) : (
            <>
              <line x1={6} y1={20} x2={34} y2={20} stroke={valveColor} strokeWidth={2.5} />
              <line x1={20} y1={6} x2={20} y2={34} stroke={valveColor} strokeWidth={2.5} />
            </>
          )}
          <text x={20} y={52} textAnchor="middle" fontSize={7} fill={valveColor}>
            VANNE
          </text>
        </g>
        <text x={120} y={115} textAnchor="middle" fontSize={8} fill="#94A3B8">
          {batt != null ? `${batt} V` : "Batt."}
        </text>
        <text x={90} y={138} textAnchor="middle" fontSize={8} fill="#38BDF8">
          {formatFlow(flowM3h)}
        </text>
        {indexLiters != null && (
          <text x={90} y={152} textAnchor="middle" fontSize={7} fill="#64748B">
            {indexLiters.toLocaleString("fr-FR")} imp.
          </text>
        )}
      </g>

      {/* ── Lien LoRaWAN ── */}
      <g transform="translate(230, 50)">
        <text x={120} y={12} textAnchor="middle" fontSize={9} fill="#94A3B8" fontWeight="bold">
          LIEN LoRaWAN EU868
        </text>
        <line x1={0} y1={80} x2={240} y2={80} stroke="#334155" strokeWidth={3} strokeDasharray={linkActive ? "0" : "6 4"} />
        {linkActive &&
          [0, 1, 2].map((i) => (
            <circle key={i} cx={40 + i * 70} cy={80} r={5} fill={rssi.color} opacity={0.9} />
          ))}
        <rect x={60} y={100} width={120} height={50} rx={8} fill="#0F172A" stroke={rssi.color} strokeWidth={1.5} />
        <text x={120} y={118} textAnchor="middle" fontSize={9} fill="#E2E8F0">
          RSSI {network?.rssi != null ? `${network.rssi} dBm` : "—"}
        </text>
        <text x={120} y={132} textAnchor="middle" fontSize={9} fill="#E2E8F0">
          SNR {network?.snr != null ? `${Number(network.snr).toFixed(1)} dB` : "—"}
        </text>
        <text x={120} y={144} textAnchor="middle" fontSize={8} fill={rssi.color}>
          {rssi.label} · DR{network?.dr ?? "?"}
        </text>
        <rect x={60} y={158} width={120} height={6} rx={3} fill="#1E293B" />
        <rect x={60} y={158} width={(120 * rssi.pct) / 100} height={6} rx={3} fill={rssi.color} />
      </g>

      {/* ── Gateway ── */}
      <g transform="translate(500, 25)">
        <rect width={200} height={160} rx={12} fill="#1F2937" stroke={gwColor} strokeWidth={2} />
        <text x={100} y={22} textAnchor="middle" fontSize={10} fill={gwColor} fontWeight="bold">
          GATEWAY
        </text>
        <path d="M100 40 L100 28 M88 40 Q100 32 112 40" stroke={gwColor} strokeWidth={2} fill="none" />
        <rect x={70} y={48} width={60} height={40} rx={6} fill="#0F172A" stroke={gwColor} strokeWidth={1.5} />
        <rect x={82} y={58} width={8} height={20} fill={gwColor} opacity={0.6} />
        <rect x={96} y={52} width={8} height={26} fill={gwColor} opacity={0.8} />
        <rect x={110} y={60} width={8} height={18} fill={gwColor} opacity={0.5} />
        <text x={100} y={104} textAnchor="middle" fontSize={9} fill="#E2E8F0" fontWeight="bold">
          {network?.gatewayState ?? "—"}
        </text>
        <text x={100} y={118} textAnchor="middle" fontSize={8} fill="#94A3B8" fontFamily="monospace">
          {(network?.gatewayId ?? "—").slice(0, 12)}
        </text>
        <text x={100} y={132} textAnchor="middle" fontSize={7} fill="#64748B">
          {network?.gatewayName ?? "Passerelle LoRaWAN"}
        </text>
        {network?.gatewayLastSeen && (
          <text x={100} y={146} textAnchor="middle" fontSize={7} fill="#64748B">
            vu {new Date(network.gatewayLastSeen).toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          </text>
        )}
      </g>

      {/* Flux eau (bas) */}
      {isFlowing && (
        <text x={110} y={210} fontSize={8} fill="#38BDF8">
          ● Écoulement détecté
        </text>
      )}
    </svg>
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
    const ageMin = Math.round((Date.now() - new Date(lastAt).getTime()) / 60_000);
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
          { label: "RSSI", value: network?.rssi != null ? `${network.rssi} dBm` : "—" },
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
