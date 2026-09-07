"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/ui";

type TelemetryRow = {
  time: string;
  protocol: string;
  externalId: string;
  payload?: Record<string, unknown>;
  payloadRaw?: string;
  payloadSize?: number;
};

export default function IoTDeviceDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const [device, setDevice] = useState<{ name?: string; protocol?: string; externalId?: string; status?: string } | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [d, t] = await Promise.all([
      apiFetch<{ device: { name?: string; protocol?: string; externalId?: string; status?: string } }>(`/api/v1/iot/devices/${id}`),
      apiFetch<{ result: TelemetryRow[] }>(`/api/v1/iot/devices/${id}/telemetry?limit=50`),
    ]);
    setDevice(d?.device ?? null);
    setTelemetry(Array.isArray(t?.result) ? t.result : []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={device?.name ?? "Device LTE-M"}
        subtitle={`${device?.protocol?.toUpperCase() ?? ""} · ${device?.externalId ?? id}`}
      />
      <Link href="/iot-devices" className="text-sm text-orange-600 underline">
        ← Retour liste LTE-M
      </Link>

      {loading ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : telemetry.length === 0 ? (
        <EmptyState message="Aucune télémétrie — vérifiez que le device est configuré et envoie des données." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3">Heure</th>
                <th className="px-4 py-3">Payload</th>
                <th className="px-4 py-3">Taille</th>
              </tr>
            </thead>
            <tbody>
              {telemetry.map((row, i) => (
                <tr key={`${row.time}-${i}`} className="border-t border-gray-100 align-top">
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600">{row.time}</td>
                  <td className="px-4 py-3">
                    <pre className="max-w-xl overflow-x-auto rounded bg-gray-50 p-2 text-xs">
                      {row.payload ? JSON.stringify(row.payload, null, 2) : row.payloadRaw}
                    </pre>
                  </td>
                  <td className="px-4 py-3">{row.payloadSize ?? 0} o</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
