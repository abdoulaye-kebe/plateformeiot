"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import LinkMetricsChart from "@/components/LinkMetricsChart";

type Range = "24h" | "31d" | "1y";

type LinkMetrics = {
  devEui: string;
  received: Array<{ bucket: string; count: number }>;
  points: Array<{ time: string; rssi?: number; snr?: number }>;
};

const RANGES: { id: Range; label: string }[] = [
  { id: "24h", label: "24h" },
  { id: "31d", label: "31d" },
  { id: "1y", label: "1y" },
];

export default function DeviceLinkMetricsPanel({
  devEui,
  lastSeenAt,
  profileName,
  enabled,
}: {
  devEui: string;
  lastSeenAt?: string | null;
  profileName?: string;
  enabled?: boolean;
}) {
  const [range, setRange] = useState<Range>("31d");
  const [metrics, setMetrics] = useState<LinkMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await apiFetch<LinkMetrics>(`/api/v1/analytics/devices/${devEui}/link-metrics?range=${range}`);
    setMetrics(data);
    setLoading(false);
  }, [devEui, range]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const received = (metrics?.received ?? []).map((b) => ({ time: b.bucket, value: b.count }));
  const rssi = (metrics?.points ?? [])
    .filter((p) => p.rssi != null)
    .map((p) => ({ time: p.time, value: Number(p.rssi) }));
  const snr = (metrics?.points ?? [])
    .filter((p) => p.snr != null)
    .map((p) => ({ time: p.time, value: Number(p.snr) }));

  return (
    <div className="col-span-full space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-gray-600">Dernière vue</dt>
            <dd className="font-medium">{lastSeenAt ? new Date(lastSeenAt).toLocaleString("fr-FR") : "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-600">Device profile</dt>
            <dd className="font-medium">{profileName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-600">Activé</dt>
            <dd className="font-medium">{enabled === false ? "Non" : "Oui"}</dd>
          </div>
          <div>
            <dt className="text-gray-600">Uplinks (période)</dt>
            <dd className="font-medium">{metrics?.points?.length ?? 0}</dd>
          </div>
        </dl>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">Link metrics</span>
        <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${range === r.id ? "bg-white text-brand shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {loading && <span className="text-xs text-gray-500">Actualisation…</span>}
      </div>

      <div className="grid gap-4 lg:grid-cols-1">
        <LinkMetricsChart title="Received" points={received} variant="bar" yMin={0} />
        <LinkMetricsChart title="RSSI" points={rssi} unit=" dBm" yMin={-120} yMax={0} />
        <LinkMetricsChart title="SNR" points={snr} unit=" dB" yMin={-20} yMax={15} />
      </div>

      {metrics && metrics.points.length === 0 && (
        <p className="text-sm text-gray-500">
          Les graphiques se remplissent via mqtt-ingestion (TimescaleDB). Si ChirpStack affiche des frames mais pas ici, vérifiez que le service mqtt-ingestion tourne sur la VM.
        </p>
      )}
    </div>
  );
}
