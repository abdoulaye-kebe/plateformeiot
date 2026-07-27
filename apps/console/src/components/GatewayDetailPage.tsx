"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, apiMutate } from "@/lib/api";
import { useClientAuth } from "@/lib/useClientAuth";
import { PageHeader, Section, StatusBadge, RoleBanner } from "@/components/ui";

export default function GatewayDetailPage() {
  const params = useParams();
  const router = useRouter();
  const gatewayId = String(params.gatewayId ?? "").toLowerCase();
  const { write } = useClientAuth();
  const [gateway, setGateway] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!gatewayId) return;
    apiFetch<{ gateway?: Record<string, unknown> } & Record<string, unknown>>(`/api/v1/lorawan/gateways/${gatewayId}`).then((g) => {
      setGateway((g?.gateway as Record<string, unknown>) ?? g);
    });
  }, [gatewayId]);

  async function remove() {
    if (!confirm(`Supprimer ${gatewayId} ?`)) return;
    await apiMutate(`/api/v1/lorawan/gateways/${gatewayId}`, "DELETE");
    router.push("/gateways");
  }

  const g = gateway ?? {};

  return (
    <div className="p-8">
      <Link href="/gateways" className="text-sm text-emerald-400 hover:underline">← Gateways</Link>
      <PageHeader
        title={String(g.name ?? gatewayId)}
        subtitle={`Gateway ID ${gatewayId}`}
        action={write ? <button onClick={remove} className="rounded-lg border border-red-500/50 px-4 py-2 text-sm text-red-400 hover:bg-red-950/30">Supprimer</button> : undefined}
      />
      <RoleBanner />

      <Section title="Informations">
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between"><dt className="text-slate-400">État</dt><dd><StatusBadge status={String(g.state ?? "UNKNOWN")} /></dd></div>
          <div className="flex justify-between"><dt className="text-slate-400">Dernière vue</dt><dd>{g.lastSeenAt ? new Date(String(g.lastSeenAt)).toLocaleString("fr-FR") : "Jamais"}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-400">Description</dt><dd>{String(g.description ?? "—")}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-400">Tenant</dt><dd className="font-mono text-xs">{String(g.tenantId ?? "—")}</dd></div>
        </dl>
      </Section>
    </div>
  );
}
