"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatDecodedPreview, normalizePayloadToHex, testDecodeUplink, unwrapDecodedData } from "@/lib/codecTest";
import { decodeShengdaPayload } from "@/lib/shengdaDecode";
import DataShell, { CopyIcon } from "@/components/DataShell";
import { EmptyState, PageHeader, RoleBanner } from "@/components/ui";

type MessageRow = {
  id: number;
  time: string;
  devEui: string;
  applicationId?: string;
  gatewayId?: string;
  payloadHex?: string;
  payloadSize: number;
  fPort?: number;
  fCnt?: number;
  decoded?: Record<string, unknown>;
  decodePreview?: string;
};

type AppRow = { id?: string; application?: { id?: string; name?: string } };
type DecoderRow = { vendor?: string; script?: string; name?: string };
type DecodedEntry = { data: Record<string, unknown>; preview: string } | { error: string };

function messagePreview(m: MessageRow): { preview: string; data?: Record<string, unknown>; error?: string } {
  if (m.decodePreview) {
    return { preview: m.decodePreview, data: m.decoded };
  }
  if (m.decoded && Object.keys(m.decoded).length > 0) {
    return { preview: formatDecodedPreview({ data: m.decoded }), data: m.decoded };
  }
  if (!m.payloadHex) {
    return { preview: "—" };
  }
  try {
    const data = decodeShengdaPayload(m.payloadHex);
    return { preview: formatDecodedPreview({ data }), data };
  } catch (e) {
    return { preview: "Payload brut", error: e instanceof Error ? e.message : "Décodage impossible" };
  }
}

function decodeMessageRow(m: MessageRow): DecodedEntry | undefined {
  if (m.decoded && Object.keys(m.decoded).length > 0) {
    return {
      data: { data: m.decoded },
      preview: m.decodePreview || formatDecodedPreview({ data: m.decoded }),
    };
  }
  if (!m.payloadHex) return undefined;
  try {
    const data = decodeShengdaPayload(m.payloadHex);
    return { data: { data }, preview: formatDecodedPreview({ data }) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Décodage impossible" };
  }
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function DataMessagesPage() {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [total, setTotal] = useState(0);
  const [apps, setApps] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [decoderScript, setDecoderScript] = useState<string | null>(null);

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const [from, setFrom] = useState(toLocalInput(weekAgo));
  const [to, setTo] = useState(toLocalInput(now));
  const [search, setSearch] = useState("");
  const [devEuiFilter, setDevEuiFilter] = useState("");
  const [appFilter, setAppFilter] = useState("");
  const [fPortFilter, setFPortFilter] = useState("");
  const [activeFilters, setActiveFilters] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (from) params.set("from", new Date(from).toISOString());
    if (to) params.set("to", new Date(to).toISOString());
    if (search) params.set("q", search);
    if (devEuiFilter) params.set("devEui", devEuiFilter);
    if (appFilter) params.set("applicationId", appFilter);
    if (fPortFilter) params.set("fPort", fPortFilter);

    const data = await apiFetch<{ result?: MessageRow[]; totalCount?: number }>(
      `/api/v1/data/messages?${params.toString()}`
    );
    setMessages(data?.result ?? []);
    setTotal(data?.totalCount ?? data?.result?.length ?? 0);
    setLoading(false);
  }, [from, to, search, devEuiFilter, appFilter, fPortFilter]);

  useEffect(() => {
    apiFetch<{ result?: AppRow[] }>("/api/v1/lorawan/applications?limit=50").then((d) =>
      setApps(d?.result ?? [])
    );
  }, []);

  useEffect(() => {
    (async () => {
      const tpl = await apiFetch<{ script?: string }>("/api/v1/decoders/template/shengda");
      if (tpl?.script) {
        setDecoderScript(tpl.script);
        return;
      }
      const list = await apiFetch<{ result?: DecoderRow[] }>("/api/v1/decoders");
      const tenant =
        list?.result?.find((d) => d.vendor === "shengda" && d.script) ??
        list?.result?.find((d) => d.script);
      setDecoderScript(tenant?.script ?? null);
    })();
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decodedById = useMemo(() => {
    const next: Record<number, DecodedEntry> = {};
    for (const m of messages) {
      const entry = decodeMessageRow(m);
      if (!entry && m.payloadHex && decoderScript) {
        try {
          const raw = testDecodeUplink(decoderScript, m.payloadHex, m.fPort ?? 1);
          next[m.id] = { data: raw, preview: formatDecodedPreview(raw) };
          continue;
        } catch {
          /* codec JS tenant */
        }
      }
      if (entry) next[m.id] = entry;
    }
    return next;
  }, [messages, decoderScript]);

  const toggleFilter = (key: string) => {
    setActiveFilters((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  function expandMessage(row: MessageRow) {
    setExpanded((prev) => (prev === row.id ? null : row.id));
  }

  function exportCsv() {
    const header = "time,devEui,applicationId,gatewayId,fPort,fCnt,payloadHex\n";
    const rows = messages
      .map(
        (m) =>
          `"${m.time}","${m.devEui}","${m.applicationId ?? ""}","${m.gatewayId ?? ""}",${m.fPort ?? ""},${m.fCnt ?? ""},"${m.payloadHex ?? ""}"`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "data-messages.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const appName = useMemo(() => {
    const map: Record<string, string> = {};
    apps.forEach((a) => {
      const id = a.application?.id ?? a.id ?? "";
      map[id] = a.application?.name ?? id;
    });
    return map;
  }, [apps]);

  return (
    <DataShell>
      <div className="p-4 lg:p-6">
        <PageHeader
          title="Data Messages"
          subtitle="Journal des uplinks LoRaWAN — filtre par source, stream et période"
        />
        <RoleBanner />

        <nav className="mb-4 text-xs text-gray-500">
          <Link href="/data/messages" className="hover:text-brand">
            Data
          </Link>
          <span className="mx-1">›</span>
          <span className="text-gray-800">Data Messages</span>
        </nav>

        <div className="mb-4 grid gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs text-gray-500">From</label>
            <input type="datetime-local" className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">To</label>
            <input type="datetime-local" className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-gray-500">Search or filter results…</label>
            <input
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
              placeholder="DevEUI, application, gateway…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
            />
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {(["Source", "Stream", "Tag"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => toggleFilter(f)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                activeFilters.includes(f) ? "border-brand bg-brand-light text-brand-dark" : "border-gray-300 text-gray-600"
              }`}
            >
              {f}
            </button>
          ))}
          {activeFilters.includes("Source") && (
            <input
              className="rounded border border-gray-300 px-2 py-1 font-mono text-xs"
              placeholder="devEui"
              value={devEuiFilter}
              onChange={(e) => setDevEuiFilter(e.target.value)}
            />
          )}
          {activeFilters.includes("Stream") && (
            <>
              <select className="rounded border border-gray-300 px-2 py-1 text-xs" value={appFilter} onChange={(e) => setAppFilter(e.target.value)}>
                <option value="">Application…</option>
                {apps.map((a) => {
                  const id = a.application?.id ?? a.id ?? "";
                  return (
                    <option key={id} value={id}>
                      {a.application?.name ?? id}
                    </option>
                  );
                })}
              </select>
              <input
                className="w-16 rounded border border-gray-300 px-2 py-1 text-xs"
                placeholder="fPort"
                value={fPortFilter}
                onChange={(e) => setFPortFilter(e.target.value)}
              />
            </>
          )}
          <button type="button" onClick={load} className="ml-auto rounded-lg bg-brand px-4 py-1.5 text-xs font-medium text-white">
            {loading ? "…" : "Appliquer"}
          </button>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-gray-600">
          <span>
            <strong>{messages.length}</strong> messages affichés / {total} total
          </span>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showDetails} onChange={(e) => setShowDetails(e.target.checked)} />
            Show details
          </label>
          <button type="button" onClick={load} className="text-brand hover:underline">
            Refresh
          </button>
          <button type="button" onClick={exportCsv} className="text-brand hover:underline">
            Export CSV
          </button>
        </div>

        {messages.length === 0 ? (
          <EmptyState message="Aucun message — vérifiez mqtt-ingestion et MinIO (archivage payloads)." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-600">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Stream</th>
                  <th className="px-3 py-2">Data</th>
                  {showDetails && <th className="px-3 py-2">Tags</th>}
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {messages.map((m) => {
                  const row = messagePreview(m);
                  const decoded = decodedById[m.id] ?? decodeMessageRow(m);
                  const preview = decoded && "preview" in decoded ? decoded.preview : row.preview;
                  const detail = decoded && "data" in decoded ? decoded.data : row.data ? { data: row.data } : undefined;
                  const error = decoded && "error" in decoded ? decoded.error : row.error;
                  return (
                    <tr key={m.id} className="border-b border-gray-100 align-top hover:bg-gray-50/80">
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-600">
                        {new Date(m.time).toLocaleString("fr-FR")}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-mono text-xs">
                          <span className="text-gray-500">devEui:</span> {m.devEui}
                          <CopyIcon value={m.devEui} />
                        </div>
                        {showDetails && m.gatewayId && (
                          <div className="mt-0.5 font-mono text-[10px] text-gray-400">
                            gateway: {m.gatewayId}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px] text-gray-500">
                        {appName[m.applicationId ?? ""] ?? m.applicationId ?? "—"}
                        {m.fPort != null && <div>fPort {m.fPort}</div>}
                      </td>
                      <td className="max-w-md px-3 py-2">
                        {expanded === m.id && detail ? (
                          <pre className="max-h-40 overflow-auto rounded bg-gray-900 p-2 text-[10px] text-emerald-300">
                            {JSON.stringify(unwrapDecodedData(detail), null, 2)}
                          </pre>
                        ) : error ? (
                          <span className="text-xs text-amber-700">{error}</span>
                        ) : preview && preview !== "—" ? (
                          <div>
                            <div className="text-xs font-medium text-gray-900">{preview}</div>
                            {showDetails && m.payloadHex && (() => {
                              try {
                                const hex = normalizePayloadToHex(m.payloadHex);
                                return (
                                  <code className="mt-0.5 block truncate font-mono text-[10px] text-gray-400">
                                    hex {hex.slice(0, 32)}
                                    {hex.length > 32 ? "…" : ""}
                                  </code>
                                );
                              } catch {
                                return null;
                              }
                            })()}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500">—</span>
                        )}
                      </td>
                      {showDetails && (
                        <td className="px-3 py-2">
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px]">LoRaWAN</span>
                          {m.fCnt != null && (
                            <span className="ml-1 rounded-full bg-brand-light px-2 py-0.5 text-[10px] text-brand-dark">
                              fCnt {m.fCnt}
                            </span>
                          )}
                        </td>
                      )}
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => expandMessage(m)} className="text-brand hover:underline">
                          {expanded === m.id ? "−" : "🔍"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DataShell>
  );
}
