"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiMutate } from "@/lib/api";
import { Section } from "@/components/ui";

type QueueItem = {
  id?: string;
  fPort?: number;
  confirmed?: boolean;
  data?: string;
  fCnt?: number;
  isPending?: boolean;
  isEncrypted?: boolean;
  devEui?: string;
};

function b64ToHex(b64: string): string {
  try {
    const bin = atob(b64);
    return [...bin].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
  } catch {
    return b64;
  }
}

export default function DeviceDownlinkQueuePanel({
  devEui,
  write,
}: {
  devEui: string;
  write: boolean;
}) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [fPort, setFPort] = useState(1);
  const [confirmed, setConfirmed] = useState(false);
  const [dataHex, setDataHex] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const data = await apiFetch<{ result?: QueueItem[]; totalCount?: number }>(
      `/api/v1/lorawan/devices/${devEui}/downlink`,
    );
    setItems(data?.result ?? []);
    setTotalCount(data?.totalCount ?? data?.result?.length ?? 0);
  }, [devEui]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  async function enqueue(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    setErr("");
    const hex = dataHex.replace(/\s+/g, "");
    const { error } = await apiMutate(`/api/v1/lorawan/devices/${devEui}/downlink`, "POST", {
      dataHex: hex,
      fPort,
      confirmed,
    });
    setBusy(false);
    if (error) {
      setErr(error);
      return;
    }
    setMsg("Commande ajoutée à la queue ChirpStack.");
    setDataHex("");
    load();
  }

  async function flush() {
    if (!confirm("Vider toute la queue downlink de ce device ?")) return;
    setBusy(true);
    setErr("");
    const { error } = await apiMutate(`/api/v1/lorawan/devices/${devEui}/downlink`, "DELETE");
    setBusy(false);
    if (error) {
      setErr(error);
      return;
    }
    setMsg("Queue vidée.");
    load();
  }

  return (
    <Section title="Queue downlink">
      <p className="mb-4 text-sm text-gray-600">
        Enfilez des commandes LoRaWAN (comme l&apos;onglet Queue ChirpStack). Le device doit envoyer un uplink pour recevoir le downlink (Class A).
      </p>

      {write && (
        <form onSubmit={enqueue} className="mb-6 grid gap-3 rounded-xl border border-gray-200 bg-neutral-50 p-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-gray-600">FPort</span>
            <input
              type="number"
              min={1}
              max={223}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm"
              value={fPort}
              onChange={(e) => setFPort(Number(e.target.value) || 1)}
              required
            />
          </label>
          <label className="flex items-end gap-2 text-sm">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>Confirmed downlink</span>
          </label>
          <label className="sm:col-span-2 text-sm">
            <span className="mb-1 block text-gray-600">Payload (hex)</span>
            <textarea
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm"
              rows={3}
              placeholder="01020304…"
              value={dataHex}
              onChange={(e) => setDataHex(e.target.value)}
              required
            />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Enqueue
            </button>
            <button
              type="button"
              disabled={busy || totalCount === 0}
              onClick={flush}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Flush queue
            </button>
          </div>
          {msg && <p className="sm:col-span-2 text-sm text-green-700">{msg}</p>}
          {err && <p className="sm:col-span-2 text-sm text-red-600">{err}</p>}
        </form>
      )}

      <div className="mb-2 flex items-center justify-between text-sm text-gray-600">
        <span>{totalCount} élément(s) en queue</span>
        <button type="button" onClick={load} className="text-brand hover:underline">
          Rafraîchir
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-gray-500">Queue vide.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-600">
                <th className="px-3 py-2">FPort</th>
                <th className="px-3 py-2">Confirmed</th>
                <th className="px-3 py-2">Payload (hex)</th>
                <th className="px-3 py-2">FCnt</th>
                <th className="px-3 py-2">Pending</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id ?? `${item.fCnt}-${item.fPort}`} className="border-b border-gray-100">
                  <td className="px-3 py-2">{item.fPort ?? "—"}</td>
                  <td className="px-3 py-2">{item.confirmed ? "Oui" : "Non"}</td>
                  <td className="max-w-xs truncate px-3 py-2 font-mono text-xs">
                    {item.data ? b64ToHex(item.data) : "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{item.fCnt ?? "—"}</td>
                  <td className="px-3 py-2">{item.isPending ? "Oui" : "Non"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
