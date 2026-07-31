"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, apiMutate } from "@/lib/api";
import { useClientAuth } from "@/lib/useClientAuth";
import { PageHeader, Section, StatusBadge, RoleBanner } from "@/components/ui";
import GatewayRfScanPanel from "@/components/GatewayRfScanPanel";

const RF_MODELS = [
  { id: "", label: "— Non compatible —" },
  { id: "corecell-sx1302-sx1261", label: "Corecell SX1302 + SX1261" },
  { id: "semtech-sx1302-sx1261", label: "Semtech SX1302 + SX1261" },
  { id: "rak2287", label: "RAK2287" },
  { id: "rak5148", label: "RAK5148" },
];

export default function GatewayDetailPage() {
  const params = useParams();
  const router = useRouter();
  const gatewayId = String(params.gatewayId ?? "").toLowerCase();
  const { write } = useClientAuth();
  const [gateway, setGateway] = useState<Record<string, unknown> | null>(null);
  const [rfModel, setRfModel] = useState("");
  const [savingRf, setSavingRf] = useState(false);

  useEffect(() => {
    if (!gatewayId) return;
    apiFetch<{ gateway?: Record<string, unknown> } & Record<string, unknown>>(`/api/v1/lorawan/gateways/${gatewayId}`).then((resp) => {
      const nested = (resp?.gateway as Record<string, unknown>) ?? {};
      setGateway({
        ...nested,
        state: resp?.state ?? nested.state,
        lastSeenAt: resp?.lastSeenAt ?? nested.lastSeenAt,
        createdAt: resp?.createdAt ?? nested.createdAt,
        updatedAt: resp?.updatedAt ?? nested.updatedAt,
      });
      setRfModel(String(nested.rfScanModel ?? resp?.rfScanModel ?? ""));
    });
  }, [gatewayId]);

  async function remove() {
    if (!confirm(`Supprimer ${gatewayId} ?`)) return;
    await apiMutate(`/api/v1/lorawan/gateways/${gatewayId}`, "DELETE");
    router.push("/gateways");
  }

  async function saveRfSupport(e: React.FormEvent) {
    e.preventDefault();
    setSavingRf(true);
    await apiMutate(`/api/v1/lorawan/gateways/${gatewayId}`, "PUT", {
      rfScanSupported: rfModel !== "",
      rfScanModel: rfModel || undefined,
    });
    const g = await apiFetch<{ gateway?: Record<string, unknown> } & Record<string, unknown>>(`/api/v1/lorawan/gateways/${gatewayId}`);
    const gw = (g?.gateway as Record<string, unknown>) ?? g ?? {};
    setGateway(gw);
    setSavingRf(false);
  }

  const g = gateway ?? {};
  const rfSupported = Boolean(g.rfScanSupported);
  const lastSeenAt = g.lastSeenAt ? new Date(String(g.lastSeenAt)) : null;
  const lastSeenMinutes = lastSeenAt ? (Date.now() - lastSeenAt.getTime()) / 60000 : null;
  const chirpstackState = String(g.state ?? "UNKNOWN");
  const udpRecent = lastSeenMinutes != null && lastSeenMinutes < 3;
  const statsMissing = udpRecent && chirpstackState !== "ONLINE";

  return (
    <div className="p-4 lg:p-6">
      <Link href="/gateways" className="text-sm text-brand hover:underline">← Gateways</Link>
      <PageHeader
        title={String(g.name ?? gatewayId)}
        subtitle={`Gateway ID ${gatewayId}`}
        action={write ? <button onClick={remove} className="rounded-lg border border-red-500/50 px-4 py-2 text-sm text-red-600 hover:bg-red-950/30">Supprimer</button> : undefined}
      />
      <RoleBanner />

      <Section title="Informations">
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between"><dt className="text-gray-600">État ChirpStack</dt><dd><StatusBadge status={chirpstackState} /></dd></div>
          <div className="flex justify-between"><dt className="text-gray-600">Dernière activité UDP</dt><dd>{lastSeenAt ? lastSeenAt.toLocaleString("fr-FR") : "Jamais"}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-600">Description</dt><dd>{String(g.description ?? "—")}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-600">Scan RF</dt><dd>{rfSupported ? <span className="text-brand font-medium">Compatible</span> : <span className="text-gray-500">Non supporté</span>}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-600">Tenant</dt><dd className="font-mono text-xs">{String(g.tenantId ?? "—")}</dd></div>
        </dl>
        {statsMissing && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-medium">UDP OK, mais statut OFFLINE</p>
            <p className="mt-1 text-amber-900">
              ChirpStack reçoit des keep-alive (PULL_DATA) mais pas les statistiques gateway (STATS).
              Activez l&apos;envoi des stats toutes les 30 s dans le packet forwarder (Semtech UDP v2).
            </p>
          </div>
        )}
        {!udpRecent && chirpstackState !== "ONLINE" && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p className="font-medium">Gateway injoignable</p>
            <p className="mt-1">
              Vérifiez l&apos;alimentation, le réseau, le Gateway ID ({gatewayId}) et la cible serveur UDP{" "}
              <code className="rounded bg-red-100 px-1">&lt;IP_VM&gt;:1700</code>.
            </p>
          </div>
        )}
      </Section>

      {write && (
        <Section title="Compatibilité scan RF">
          <p className="mb-4 text-sm text-gray-600">
            Activez le scan spectral uniquement pour les gateways équipées d&apos;un radio SX1261 (Corecell, RAK2287, etc.).
          </p>
          <form onSubmit={saveRfSupport} className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-gray-600">Modèle hardware</span>
              <select
                className="rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm"
                value={rfModel}
                onChange={(e) => setRfModel(e.target.value)}
              >
                {RF_MODELS.map((m) => (
                  <option key={m.id || "none"} value={m.id}>{m.label}</option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={savingRf} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              Enregistrer
            </button>
          </form>
        </Section>
      )}

      <div className="mt-6">
        <GatewayRfScanPanel gatewayId={gatewayId} write={write} />
      </div>
    </div>
  );
}
