"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiMutate } from "@/lib/api";
import { Section } from "@/components/ui";

type RfBin = { freqHz: number; rssiDbm: number };
type RfPolluter = { freqHz: number; rssiDbm: number; severity: string };
type RfScanPayload = {
  supported: boolean;
  model?: string;
  latest?: {
    bins: RfBin[];
    polluters: RfPolluter[];
    scannedAt: string;
    freqStartHz: number;
    channelStepHz: number;
  };
  pendingRequest?: { id: string; status: string; createdAt: string };
};

function mhz(hz: number) {
  return (hz / 1_000_000).toFixed(3);
}

function Histogram({ bins }: { bins: RfBin[] }) {
  if (!bins.length) return <p className="text-sm text-gray-500">Aucune mesure disponible.</p>;
  const min = Math.min(...bins.map((b) => b.rssiDbm));
  const max = Math.max(...bins.map((b) => b.rssiDbm));
  const span = Math.max(max - min, 1);

  return (
    <div className="overflow-x-auto">
      <div className="flex h-36 min-w-[480px] items-end gap-px border-b border-gray-300 pb-1">
        {bins.map((b) => {
          const h = ((b.rssiDbm - min) / span) * 100;
          const hot = b.rssiDbm > min + 15;
          return (
            <div
              key={b.freqHz}
              title={`${mhz(b.freqHz)} MHz — ${b.rssiDbm.toFixed(1)} dBm`}
              className={`flex-1 rounded-t ${hot ? "bg-brand" : "bg-gray-300"}`}
              style={{ height: `${Math.max(h, 8)}%` }}
            />
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs text-gray-500">
        <span>{mhz(bins[0].freqHz)} MHz</span>
        <span>{mhz(bins[bins.length - 1].freqHz)} MHz</span>
      </div>
    </div>
  );
}

export default function GatewayRfScanPanel({ gatewayId, write }: { gatewayId: string; write: boolean }) {
  const [data, setData] = useState<RfScanPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<RfScanPayload>(`/api/v1/lorawan/gateways/${gatewayId}/rf-scan`);
    setData(res);
    setLoading(false);
  }, [gatewayId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  async function requestScan() {
    setBusy(true);
    setError("");
    const { error: err } = await apiMutate(`/api/v1/lorawan/gateways/${gatewayId}/rf-scan/request`, "POST");
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    load();
  }

  if (loading) return null;
  if (!data?.supported) return null;

  const latest = data.latest;
  const pending = data.pendingRequest;

  return (
    <Section
      title="Scan RF (bande ISM)"
      action={
        write ? (
          <button
            type="button"
            disabled={busy || !!pending}
            onClick={requestScan}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Scan en cours…" : "Lancer un scan"}
          </button>
        ) : undefined
      }
    >
      <p className="mb-4 text-sm text-gray-600">
        Modèle compatible : <strong>{data.model ?? "Corecell SX1302 + SX1261"}</strong>.
        Détection des signaux anormaux (pollueurs RF) sur la bande LoRaWAN.
      </p>

      {pending && (
        <div className="mb-4 rounded-lg border border-brand/30 bg-brand-light px-4 py-3 text-sm text-brand-dark">
          Demande de scan en attente depuis {new Date(pending.createdAt).toLocaleString("fr-FR")}.
          L&apos;agent edge sur la gateway exécutera le scan spectral.
        </div>
      )}

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {latest ? (
        <>
          <p className="mb-3 text-xs text-gray-500">
            Dernier scan : {new Date(latest.scannedAt).toLocaleString("fr-FR")}
          </p>
          <Histogram bins={latest.bins} />

          {latest.polluters.length > 0 ? (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold text-black">Signaux suspects ({latest.polluters.length})</h3>
              <ul className="space-y-2 text-sm">
                {latest.polluters.map((p) => (
                  <li key={p.freqHz} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                    <span className="font-mono">{mhz(p.freqHz)} MHz</span>
                    <span>{p.rssiDbm.toFixed(1)} dBm</span>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        p.severity === "high"
                          ? "bg-red-100 text-red-700"
                          : p.severity === "medium"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {p.severity}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-4 text-sm text-green-700">Aucun pollueur RF détecté sur le dernier scan.</p>
          )}
        </>
      ) : (
        <p className="text-sm text-gray-500">Aucun scan enregistré. Lancez un scan pour analyser le spectre.</p>
      )}
    </Section>
  );
}
