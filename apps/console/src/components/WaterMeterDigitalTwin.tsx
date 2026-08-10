"use client";

import Link from "next/link";
import { useMemo } from "react";

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

type Props = {
  meter?: TwinMeter;
  readings?: TwinReading[];
  commands?: TwinCommand[];
  leaks?: TwinLeak[];
};

const ORANGE = "#FF7900";
const ORANGE_LIGHT = "#FFF4EB";

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
  valveOpen: boolean | null | undefined
): { label: string; tone: "ok" | "warn" | "crit" } {
  if (leaks.some((l) => l.severity === "critical")) return { label: "Alerte critique", tone: "crit" };
  if (meter?.magnetic_attack) return { label: "Attaque magnétique", tone: "crit" };
  if (valveOpen === false && flowM3h != null && flowM3h > 0.02) return { label: "Fuite probable", tone: "crit" };
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

function TwinCanvas({
  indexM3,
  indexLiters,
  valveOpen,
  batteryV,
  flowM3h,
  isFlowing,
  health,
  devEui,
}: {
  indexM3?: number;
  indexLiters?: number;
  valveOpen?: boolean | null;
  batteryV?: number;
  flowM3h: number | null;
  isFlowing: boolean;
  health: { label: string; tone: "ok" | "warn" | "crit" };
  devEui: string;
}) {
  const valveColor = valveOpen === false ? "#DC2626" : valveOpen === true ? "#059669" : "#94A3B8";
  const healthColor = health.tone === "crit" ? "#DC2626" : health.tone === "warn" ? "#D97706" : "#059669";
  const battPct = batteryV != null ? Math.min(100, Math.max(0, ((batteryV - 2.5) / 1.5) * 100)) : 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-brand bg-gradient-to-b from-neutral-900 to-neutral-950 p-4 sm:p-6">
      <style>{`
        .twin-pulse {
          animation: twin-pulse 2s ease-in-out infinite;
        }
        @keyframes twin-pulse {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 1; }
        }
      `}</style>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand">Jumeau numérique</p>
          <p className="font-mono text-xs text-neutral-400">{devEui}</p>
        </div>
        <span
          className="rounded-full px-3 py-1 text-xs font-bold text-white"
          style={{ background: healthColor }}
        >
          {health.label}
        </span>
      </div>

      <svg viewBox="0 0 400 200" className="mx-auto w-full max-w-2xl" role="img" aria-label="Jumeau numérique compteur eau">
        {/* LoRa module */}
        <rect x={165} y={8} width={70} height={28} rx={6} fill="#1F2937" stroke={ORANGE} strokeWidth={1.5} />
        <path d="M200 8 V2 M190 8 Q200 0 210 8" stroke={ORANGE} strokeWidth={2} fill="none" className="twin-pulse" />
        <text x={200} y={26} textAnchor="middle" fontSize={8} fill={ORANGE} fontWeight="bold">
          LoRaWAN
        </text>

        {/* Tuyau principal */}
        <rect x={20} y={118} width={360} height={24} rx={12} fill="#1E293B" stroke="#334155" strokeWidth={2} />
        <rect x={24} y={122} width={352} height={16} rx={8} fill="#0F172A" />

        {/* Flux animé */}
        {isFlowing &&
          [0, 1, 2].map((i) => (
            <circle key={i} r={4} fill="#38BDF8" opacity={0.9}>
              <animate
                attributeName="cx"
                values="40;360"
                dur="2.5s"
                repeatCount="indefinite"
                begin={`${i * 0.7}s`}
              />
              <animate attributeName="cy" values="130;130" dur="2.5s" repeatCount="indefinite" begin={`${i * 0.7}s`} />
              <animate
                attributeName="opacity"
                values="0;1;1;0"
                dur="2.5s"
                repeatCount="indefinite"
                begin={`${i * 0.7}s`}
              />
            </circle>
          ))}

        {/* Compteur — corps */}
        <rect x={130} y={88} width={140} height={84} rx={12} fill={ORANGE_LIGHT} stroke={ORANGE} strokeWidth={2.5} />
        <rect x={145} y={102} width={110} height={36} rx={4} fill="#0F172A" stroke="#334155" />
        <text x={200} y={116} textAnchor="middle" fontSize={8} fill="#64748B">
          INDEX NUMÉRIQUE
        </text>
        <text x={200} y={132} textAnchor="middle" fontSize={16} fontWeight="bold" fill={ORANGE} fontFamily="monospace">
          {indexM3 != null ? indexM3.toFixed(3) : "—"}
        </text>
        <text x={200} y={144} textAnchor="middle" fontSize={8} fill="#94A3B8">
          m³ {indexLiters != null ? `· ${indexLiters.toLocaleString("fr-FR")} L` : ""}
        </text>

        {/* Roue à impulsions */}
        <circle cx={200} cy={168} r={14} fill="white" stroke={ORANGE} strokeWidth={2} />
        {[0, 45, 90, 135].map((deg) => (
          <line
            key={deg}
            x1={200}
            y1={168}
            x2={200 + 10 * Math.cos((deg * Math.PI) / 180)}
            y2={168 + 10 * Math.sin((deg * Math.PI) / 180)}
            stroke={ORANGE}
            strokeWidth={2}
          />
        ))}

        {/* Vanne */}
        <g transform="translate(300, 100)">
          <rect width={52} height={52} rx={8} fill="#1F2937" stroke={valveColor} strokeWidth={2.5} />
          {valveOpen === false ? (
            <>
              <line x1={12} y1={12} x2={40} y2={40} stroke={valveColor} strokeWidth={3} strokeLinecap="round" />
              <line x1={40} y1={12} x2={12} y2={40} stroke={valveColor} strokeWidth={3} strokeLinecap="round" />
            </>
          ) : (
            <>
              <line x1={10} y1={26} x2={42} y2={26} stroke={valveColor} strokeWidth={3} strokeLinecap="round" />
              <line x1={26} y1={10} x2={26} y2={42} stroke={valveColor} strokeWidth={3} strokeLinecap="round" />
            </>
          )}
          <text x={26} y={62} textAnchor="middle" fontSize={8} fontWeight="bold" fill={valveColor}>
            VANNE
          </text>
        </g>

        {/* Entrée / sortie labels */}
        <text x={40} y={112} fontSize={9} fill="#94A3B8">
          Entrée réseau
        </text>
        <text x={340} y={112} textAnchor="end" fontSize={9} fill="#94A3B8">
          Sortie
        </text>

        {/* Débit live */}
        <rect x={20} y={168} width={90} height={24} rx={6} fill="#1F2937" stroke="#334155" />
        <text x={65} y={184} textAnchor="middle" fontSize={9} fill="#38BDF8" fontWeight="bold">
          {formatFlow(flowM3h)}
        </text>

        {/* Batterie */}
        <rect x={290} y={168} width={90} height={24} rx={6} fill="#1F2937" stroke="#334155" />
        <rect x={296} y={174} width={60} height={12} rx={2} fill="#0F172A" />
        <rect
          x={296}
          y={174}
          width={(60 * battPct) / 100}
          height={12}
          rx={2}
          fill={batteryV != null && batteryV < 3.2 ? "#F59E0B" : "#059669"}
        />
        <text x={335} y={184} textAnchor="middle" fontSize={8} fill="#E2E8F0">
          {batteryV != null ? `${batteryV} V` : "Batt."}
        </text>
      </svg>

      <p className="mt-2 text-center text-[11px] text-neutral-500">
        {isFlowing
          ? "Écoulement détecté — consommation en cours"
          : valveOpen === false
            ? "Vanne fermée — pas d'écoulement attendu"
            : "En attente de consommation mesurable entre deux relevés"}
      </p>
    </div>
  );
}

function MetricTile({ label, value, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${alert ? "border-red-200 bg-red-50" : "border-gray-200 bg-white"}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${alert ? "text-red-700" : "text-gray-900"}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-[10px] text-gray-500">{sub}</p> : null}
    </div>
  );
}

function EventTimeline({ readings, commands }: { readings: TwinReading[]; commands: TwinCommand[] }) {
  const events = useMemo(() => {
    const items: { time: string; kind: string; label: string; detail?: string }[] = [];
    for (const r of readings.slice(0, 8)) {
      const idx = asNumber(r.index_m3);
      items.push({
        time: r.time,
        kind: "reading",
        label: `Relevé · ${idx != null ? `${idx} m³` : "—"}`,
        detail: [r.trigger_label, r.valve_open != null ? (r.valve_open ? "vanne ouverte" : "vanne fermée") : null]
          .filter(Boolean)
          .join(" · "),
      });
    }
    for (const c of commands.slice(0, 5)) {
      items.push({
        time: c.created_at,
        kind: "command",
        label: `Commande · ${c.command_type}`,
        detail: c.status,
      });
    }
    return items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 10);
  }, [readings, commands]);

  if (events.length === 0) {
    return <p className="text-xs text-gray-500">Aucun événement récent pour alimenter le jumeau.</p>;
  }

  return (
    <ul className="space-y-2">
      {events.map((e, i) => (
        <li key={`${e.time}-${i}`} className="flex gap-3 text-xs">
          <span
            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
              e.kind === "command" ? "bg-brand" : "bg-emerald-500"
            }`}
          />
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

export default function WaterMeterDigitalTwin({ meter, readings = [], commands = [], leaks = [] }: Props) {
  const devEui = meter?.dev_eui ?? "";
  const valveOpen = meter?.valve_open ?? readings[0]?.valve_open;
  const indexM3 = asNumber(meter?.last_index_m3 ?? readings[0]?.index_m3);
  const indexLiters = asNumber(meter?.last_index_liters);
  const batteryV = asNumber(meter?.battery_v ?? readings[0]?.battery_v);
  const lastAt = meter?.last_reading_at ?? readings[0]?.time;

  const flowM3h = useMemo(() => computeFlowM3h(readings), [readings]);
  const health = healthStatus(meter, leaks, flowM3h, valveOpen);
  const isFlowing = valveOpen !== false && flowM3h != null && flowM3h > 0.001;

  const syncAge = lastAt
    ? Math.round((Date.now() - new Date(lastAt).getTime()) / 60_000)
    : null;

  return (
    <section className="mb-8 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Jumeau numérique</h2>
          <p className="text-sm text-gray-500">
            Réplique virtuelle synchronisée avec le compteur physique
            {lastAt ? ` · sync il y a ${syncAge != null && syncAge < 120 ? `${syncAge} min` : new Date(lastAt).toLocaleString("fr-FR")}` : ""}
          </p>
        </div>
        {leaks.length > 0 && (
          <Link href="/apps/shengda/leak-detection" className="text-xs font-medium text-red-600 hover:underline">
            {leaks.length} alerte(s) fuite active(s) →
          </Link>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <TwinCanvas
            devEui={devEui}
            indexM3={indexM3}
            indexLiters={indexLiters}
            valveOpen={valveOpen}
            batteryV={batteryV}
            flowM3h={flowM3h}
            isFlowing={isFlowing}
            health={health}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 content-start">
          <MetricTile label="Index" value={indexM3 != null ? `${indexM3} m³` : "—"} />
          <MetricTile
            label="Vanne"
            value={valveOpen == null ? "—" : valveOpen ? "Ouverte" : "Fermée"}
            alert={valveOpen === false && isFlowing}
          />
          <MetricTile label="Débit estimé" value={formatFlow(flowM3h)} sub="Δindex / Δtemps" />
          <MetricTile
            label="Batterie"
            value={batteryV != null ? `${batteryV} V` : "—"}
            alert={meter?.battery_low}
          />
          <MetricTile
            label="Impulsions"
            value={indexLiters != null ? indexLiters.toLocaleString("fr-FR") : "—"}
            sub="1 imp = 1 litre"
          />
          <MetricTile
            label="Santé jumeau"
            value={health.label}
            alert={health.tone !== "ok"}
          />
        </div>
      </div>

      {leaks.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-xs font-bold uppercase text-red-800">Alertes synchronisées</p>
          <ul className="mt-2 space-y-1">
            {leaks.map((l) => (
              <li key={l.id} className="text-sm text-red-900">
                <span className="font-medium capitalize">{l.severity}</span> — {l.title}
                {l.flow_m3h != null ? ` (${formatFlow(asNumber(l.flow_m3h) ?? null)})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-brand-dark">Historique jumeau</p>
          <EventTimeline readings={readings} commands={commands} />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-brand-dark">Correspondance physique ↔ virtuel</p>
          <dl className="space-y-2 text-sm">
            {[
              ["Index m³", "Volume cumulé mesuré par impulsions"],
              ["Vanne", "État réel du clapet sur le compteur"],
              ["Débit estimé", "Calcul plateforme entre 2 uplinks"],
              ["Batterie", "Tension module radio embarqué"],
              ["LoRaWAN", "Lien radio vers la passerelle"],
              ["Alertes fuite", "Règles shengda-water en temps réel"],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-2 border-b border-gray-100 pb-2 last:border-0">
                <dt className="w-28 shrink-0 font-medium text-gray-800">{k}</dt>
                <dd className="text-gray-600">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
