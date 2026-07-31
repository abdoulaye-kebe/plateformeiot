"use client";

type ChartPoint = { time: string; value: number };

function pad(min: number, max: number, ratio = 0.1) {
  const span = max - min || 1;
  return { min: min - span * ratio, max: max + span * ratio };
}

export default function LinkMetricsChart({
  title,
  points,
  yMin,
  yMax,
  unit = "",
  variant = "line",
}: {
  title: string;
  points: ChartPoint[];
  yMin?: number;
  yMax?: number;
  unit?: string;
  variant?: "line" | "bar";
}) {
  const width = 640;
  const height = 140;
  const padX = 36;
  const padY = 16;

  if (points.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="mb-2 text-sm font-medium text-gray-800">{title}</p>
        <p className="text-sm text-gray-500">Aucune donnée sur cette période.</p>
      </div>
    );
  }

  const times = points.map((p) => new Date(p.time).getTime());
  const values = points.map((p) => p.value);
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const vRawMin = Math.min(...values);
  const vRawMax = Math.max(...values);
  const yPad = pad(yMin ?? vRawMin, yMax ?? vRawMax, 0.15);
  const y0 = yPad.min;
  const y1 = yPad.max;

  const xScale = (t: number) => padX + ((t - tMin) / Math.max(tMax - tMin, 1)) * (width - padX * 2);
  const yScale = (v: number) => height - padY - ((v - y0) / Math.max(y1 - y0, 0.001)) * (height - padY * 2);

  const coords = points.map((p) => ({
    x: xScale(new Date(p.time).getTime()),
    y: yScale(p.value),
    v: p.value,
  }));

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-gray-800">{title}</p>
        <p className="text-xs text-gray-500">
          {y0.toFixed(0)}{unit} — {y1.toFixed(0)}{unit}
        </p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full" role="img" aria-label={title}>
        <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="#e5e7eb" strokeWidth="1" />
        {variant === "bar" ? (
          coords.map((c, i) => {
            const barW = Math.max(4, (width - padX * 2) / Math.max(points.length, 1) - 2);
            return (
              <rect
                key={i}
                x={c.x - barW / 2}
                y={c.y}
                width={barW}
                height={height - padY - c.y}
                fill="#f16e00"
                opacity={0.85}
                rx={1}
              />
            );
          })
        ) : (
          <>
            <path d={linePath} fill="none" stroke="#2563eb" strokeWidth="1.5" />
            {coords.map((c, i) => (
              <circle key={i} cx={c.x} cy={c.y} r={3} fill="#2563eb" />
            ))}
          </>
        )}
      </svg>
    </div>
  );
}
