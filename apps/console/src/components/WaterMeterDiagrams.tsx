"use client";

type ReadingPoint = {
  time: string;
  index_m3?: number;
  valve_open?: boolean;
};

type Props = {
  indexM3?: number;
  valveOpen?: boolean | null;
  batteryV?: number;
  lastReadingAt?: string;
  readings?: ReadingPoint[];
};

const ORANGE = "#FF7900";
const ORANGE_LIGHT = "#FFF4EB";
const GRAY = "#525252";
const GRAY_LIGHT = "#F4F4F4";

function asNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Schéma physique : tuyau → compteur → vanne */
function MeterSchematic({ indexM3, valveOpen, batteryV }: Pick<Props, "indexM3" | "valveOpen" | "batteryV">) {
  const idx = asNumber(indexM3);
  const batt = asNumber(batteryV);
  const valveColor = valveOpen === false ? "#DC2626" : valveOpen === true ? "#059669" : GRAY;
  const valveLabel = valveOpen === false ? "FERMÉE" : valveOpen === true ? "OUVERTE" : "?";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-brand-dark">Anatomie du compteur</p>
      <svg viewBox="0 0 420 120" className="mx-auto w-full max-w-lg" role="img" aria-label="Schéma compteur eau">
        {/* Entrée eau */}
        <rect x={8} y={48} width={60} height={24} rx={4} fill={GRAY_LIGHT} stroke="#CBD5E1" />
        <text x={38} y={64} textAnchor="middle" fontSize={9} fill={GRAY}>
          Entrée
        </text>
        <line x1={68} y1={60} x2={95} y2={60} stroke="#94A3B8" strokeWidth={4} />

        {/* Corps compteur */}
        <rect x={95} y={30} width={100} height={60} rx={8} fill={ORANGE_LIGHT} stroke={ORANGE} strokeWidth={2} />
        <circle cx={145} cy={60} r={22} fill="white" stroke={ORANGE} strokeWidth={2} />
        <text x={145} y={56} textAnchor="middle" fontSize={8} fontWeight="bold" fill={GRAY}>
          INDEX
        </text>
        <text x={145} y={68} textAnchor="middle" fontSize={10} fontWeight="bold" fill={ORANGE}>
          {idx != null ? `${idx}` : "—"}
        </text>
        <text x={145} y={78} textAnchor="middle" fontSize={7} fill={GRAY}>
          m³
        </text>

        {/* Vanne */}
        <line x1={195} y1={60} x2={218} y2={60} stroke="#94A3B8" strokeWidth={4} />
        <g transform="translate(218, 38)">
          <rect width={44} height={44} rx={6} fill="white" stroke={valveColor} strokeWidth={2} />
          {valveOpen === false ? (
            <>
              <line x1={10} y1={10} x2={34} y2={34} stroke={valveColor} strokeWidth={3} strokeLinecap="round" />
              <line x1={34} y1={10} x2={10} y2={34} stroke={valveColor} strokeWidth={3} strokeLinecap="round" />
            </>
          ) : (
            <>
              <line x1={8} y1={22} x2={36} y2={22} stroke={valveColor} strokeWidth={3} strokeLinecap="round" />
              <line x1={22} y1={8} x2={22} y2={36} stroke={valveColor} strokeWidth={3} strokeLinecap="round" />
            </>
          )}
          <text x={22} y={54} textAnchor="middle" fontSize={7} fontWeight="bold" fill={valveColor}>
            {valveLabel}
          </text>
        </g>

        {/* Sortie */}
        <line x1={262} y1={60} x2={290} y2={60} stroke="#94A3B8" strokeWidth={4} />
        <rect x={290} y={48} width={60} height={24} rx={4} fill={GRAY_LIGHT} stroke="#CBD5E1" />
        <text x={320} y={64} textAnchor="middle" fontSize={9} fill={GRAY}>
          Sortie
        </text>

        {/* Batterie */}
        <rect x={360} y={36} width={48} height={24} rx={4} fill="white" stroke="#CBD5E1" />
        <rect x={408} y={42} width={4} height={12} rx={1} fill="#CBD5E1" />
        <rect
          x={364}
          y={40}
          width={Math.min(40, batt != null ? ((batt - 2.5) / 1.5) * 40 : 20)}
          height={16}
          rx={2}
          fill={batt != null && batt < 3.2 ? "#F59E0B" : "#059669"}
        />
        <text x={384} y={72} textAnchor="middle" fontSize={8} fill={GRAY}>
          {batt != null ? `${batt} V` : "Batt."}
        </text>

        {/* Impulsions */}
        <text x={145} y={22} textAnchor="middle" fontSize={8} fill={GRAY}>
          1 impulsion = 1 litre
        </text>
      </svg>
      <p className="mt-2 text-center text-[11px] text-gray-500">
        L&apos;index monte à chaque litre consommé · La vanne coupe ou autorise l&apos;eau · La batterie alimente le module LoRaWAN
      </p>
    </div>
  );
}

/** Graphique évolution index */
function IndexChart({ readings }: { readings: ReadingPoint[] }) {
  const points = [...readings]
    .map((r) => ({ ...r, index_m3: asNumber(r.index_m3) }))
    .filter((r) => r.index_m3 != null)
    .reverse()
    .slice(-12);

  if (points.length < 2) {
    return (
      <div className="flex h-36 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white text-xs text-gray-500">
        Au moins 2 relevés nécessaires pour afficher la courbe
      </div>
    );
  }

  const values = points.map((p) => p.index_m3 as number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 360;
  const h = 100;
  const pad = 8;

  const coords = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });

  const delta = values[values.length - 1] - values[0];
  const firstTime = new Date(points[0].time).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  const lastTime = new Date(points[points.length - 1].time).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-brand-dark">Évolution de l&apos;index</p>
        <p className="text-xs text-gray-500">
          Δ {delta >= 0 ? "+" : ""}
          {delta.toFixed(3)} m³ · {firstTime} → {lastTime}
        </p>
      </div>
      <svg viewBox={`0 0 ${w} ${h + 24}`} className="w-full" role="img" aria-label="Courbe index m3">
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#E5E7EB" strokeWidth={1} />
        <polyline points={coords.join(" ")} fill="none" stroke={ORANGE} strokeWidth={2.5} strokeLinejoin="round" />
        {values.map((v, i) => {
          const x = pad + (i / (values.length - 1)) * (w - pad * 2);
          const y = pad + (1 - (v - min) / range) * (h - pad * 2);
          return <circle key={i} cx={x} cy={y} r={3} fill={ORANGE} />;
        })}
        <text x={pad} y={h + 14} fontSize={9} fill={GRAY}>
          min {min.toFixed(2)} m³
        </text>
        <text x={w - pad} y={h + 14} textAnchor="end" fontSize={9} fill={GRAY}>
          max {max.toFixed(2)} m³
        </text>
      </svg>
    </div>
  );
}

/** Détection fuite — principe */
function LeakPrincipleDiagram({ valveOpen }: { valveOpen?: boolean | null }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-brand-dark">Détection de fuite</p>
      <p className="mb-3 text-[11px] text-gray-500">Analyse automatique à chaque uplink — voir page Détection de fuites</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
          <p className="text-lg font-bold text-amber-700">Δindex / Δtemps</p>
          <p className="mt-1 text-[10px] text-gray-600">Débit calculé entre 2 relevés</p>
        </div>
        <div
          className={`rounded-lg border p-3 text-center ${
            valveOpen === false ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50"
          }`}
        >
          <p className={`text-lg font-bold ${valveOpen === false ? "text-red-600" : "text-gray-700"}`}>
            Vanne {valveOpen === false ? "fermée" : valveOpen === true ? "ouverte" : "?"}
          </p>
          <p className="mt-1 text-[10px] text-gray-600">
            {valveOpen === false ? "Débit &gt; seuil = fuite probable" : "Consommation = usage normal ou fuite aval"}
          </p>
        </div>
        <div className="rounded-lg border border-brand-muted bg-brand-light p-3 text-center">
          <p className="text-lg font-bold text-brand-dark">Alarmes</p>
          <p className="mt-1 text-[10px] text-gray-600">flowAlarm · waterInlet · nuit 22h–6h</p>
        </div>
      </div>
    </div>
  );
}

export default function WaterMeterDiagrams({
  indexM3,
  valveOpen,
  batteryV,
  lastReadingAt,
  readings = [],
}: Props) {
  return (
    <section className="mb-8 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Vue schématique</h2>
          <p className="text-sm text-gray-500">
            État actuel du compteur et évolution de l&apos;index
            {lastReadingAt ? ` · dernier relevé ${new Date(lastReadingAt).toLocaleString("fr-FR")}` : ""}
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <MeterSchematic indexM3={indexM3} valveOpen={valveOpen} batteryV={batteryV} />
        <IndexChart readings={readings} />
      </div>

      <LeakPrincipleDiagram valveOpen={valveOpen} />
    </section>
  );
}
