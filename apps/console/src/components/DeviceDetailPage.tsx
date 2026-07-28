"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, apiMutate } from "@/lib/api";
import { useClientAuth } from "@/lib/useClientAuth";
import { PageHeader, Section, RoleBanner } from "@/components/ui";

export default function DeviceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const devEui = String(params.devEui ?? "").toLowerCase();
  const { write } = useClientAuth();
  const [device, setDevice] = useState<Record<string, unknown> | null>(null);
  const [events, setEvents] = useState<unknown[]>([]);
  const [payloads, setPayloads] = useState<Array<{ id: number; time: string; payloadHex?: string; payloadSize: number; fPort?: number }>>([]);
  const [radio, setRadio] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!devEui) return;
    Promise.all([
      apiFetch<{ device?: Record<string, unknown> } & Record<string, unknown>>(`/api/v1/lorawan/devices/${devEui}`),
      apiFetch<{ result?: unknown[] }>(`/api/v1/lorawan/devices/${devEui}/events?limit=20`),
      apiFetch<{ result?: Array<{ id: number; time: string; payloadHex?: string; payloadSize: number; fPort?: number }> }>(`/api/v1/lorawan/devices/${devEui}/payloads?limit=10`),
      apiFetch<Record<string, unknown>>(`/api/v1/analytics/devices/${devEui}/radio?hours=24`),
    ]).then(([d, e, p, r]) => {
      setDevice((d?.device as Record<string, unknown>) ?? d);
      setEvents(e?.result ?? []);
      setPayloads(p?.result ?? []);
      setRadio(r);
    });
  }, [devEui]);

  async function remove() {
    if (!confirm(`Supprimer ${devEui} ?`)) return;
    await apiMutate(`/api/v1/lorawan/devices/${devEui}`, "DELETE");
    router.push("/devices");
  }

  const d = device ?? {};

  return (
    <div className="p-4 lg:p-6">
      <Link href="/devices" className="text-sm text-brand hover:underline">← Devices</Link>
      <PageHeader
        title={String(d.name ?? devEui)}
        subtitle={`DevEUI ${devEui}`}
        action={write ? <button onClick={remove} className="rounded-lg border border-red-500/50 px-4 py-2 text-sm text-red-600 hover:bg-red-950/30">Supprimer</button> : undefined}
      />
      <RoleBanner />

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Informations">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-gray-600">Application</dt><dd className="font-mono text-xs">{String(d.applicationId ?? "—")}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-600">Profile</dt><dd className="font-mono text-xs">{String(d.deviceProfileId ?? "—")}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-600">JoinEUI</dt><dd className="font-mono text-xs">{String(d.joinEui ?? "—")}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-600">Désactivé</dt><dd>{d.isDisabled ? "Oui" : "Non"}</dd></div>
          </dl>
        </Section>

        <Section title="Radio 24h">
          {radio ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-gray-600">Uplinks</dt><dd>{String(radio.uplinkCount ?? 0)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-600">RSSI min/max</dt><dd>{String(radio.minRssi ?? "—")} / {String(radio.maxRssi ?? "—")} dBm</dd></div>
              <div className="flex justify-between"><dt className="text-gray-600">SNR moyen</dt><dd>{radio.avgSnr != null ? `${Number(radio.avgSnr).toFixed(1)} dB` : "—"}</dd></div>
            </dl>
          ) : (
            <p className="text-sm text-gray-500">Pas de données radio.</p>
          )}
        </Section>

        <Section title="Payloads archivés (MinIO)">
          {payloads.length === 0 ? (
            <p className="text-sm text-gray-500">Aucun payload archivé — activez MinIO dans mqtt-ingestion.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {payloads.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                  <span className="text-gray-600">{new Date(p.time).toLocaleString("fr-FR")}</span>
                  <span className="font-mono text-xs">{p.payloadHex?.slice(0, 24) || "—"}… ({p.payloadSize} o)</span>
                  <span className="text-gray-500">FPort {p.fPort ?? "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Events récents">
          <pre className="max-h-96 overflow-auto rounded-lg bg-neutral-100 p-4 text-xs text-gray-700">{JSON.stringify(events, null, 2)}</pre>
        </Section>
      </div>
    </div>
  );
}
