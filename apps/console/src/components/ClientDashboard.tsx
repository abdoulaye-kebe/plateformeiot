"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useClientAuth } from "@/lib/useClientAuth";
import { PageHeader, StatCard, Section, RoleBanner } from "@/components/ui";

type Overview = { totalUplinks24h: number; activeDevices24h: number; activeGateways24h: number; avgRssi24h?: number };
type Alert = { id: number; ruleName: string; matchedAt: string; event: Record<string, unknown> };
type Tenant = { name: string; slug: string; plan: string };

export default function ClientDashboard() {
  const { user, isAdmin } = useClientAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [devices, setDevices] = useState(0);
  const [gateways, setGateways] = useState(0);
  const [apps, setApps] = useState(0);
  const [rules, setRules] = useState(0);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    async function load() {
      const [status, ov, d, g, a, r, al, t] = await Promise.all([
        apiFetch<{ networkConnected?: boolean; chirpstackConnected?: boolean }>("/api/v1/status"),
        apiFetch<Overview>("/api/v1/analytics/overview"),
        apiFetch<{ totalCount?: number }>("/api/v1/lorawan/devices?limit=1"),
        apiFetch<{ totalCount?: number }>("/api/v1/lorawan/gateways?limit=1"),
        apiFetch<{ totalCount?: number }>("/api/v1/lorawan/applications?limit=50"),
        apiFetch<{ result?: unknown[] }>("/api/v1/rules/"),
        apiFetch<{ alerts?: Alert[] }>("/api/v1/noc/alerts?limit=5"),
        apiFetch<Tenant>("/api/v1/tenants/me"),
      ]);
      setConnected(status?.networkConnected ?? status?.chirpstackConnected ?? null);
      setOverview(ov);
      setDevices(d?.totalCount ?? 0);
      setGateways(g?.totalCount ?? 0);
      setApps(a?.totalCount ?? 0);
      setRules(r?.result?.length ?? 0);
      setAlerts(al?.alerts ?? []);
      setTenant(t);
    }
    load();
  }, []);

  const quickLinks = [
    { href: "/agent", label: "Agent IA", desc: "Assistant MCP — CRUD & diagnostics" },
    { href: "/devices", label: "Devices", desc: "Gérer capteurs LoRaWAN" },
    { href: "/gateways", label: "Gateways", desc: "Infrastructure radio" },
    { href: "/applications", label: "Applications", desc: "Groupes de devices" },
    { href: "/rules", label: "Règles", desc: "Routage & webhooks" },
    { href: "/analytics", label: "Analytics", desc: "Trafic & radio" },
    { href: "/noc", label: "NOC", desc: "Alertes temps réel" },
  ];

  return (
    <div className="p-8">
      <PageHeader
        title={`Bonjour${user?.email ? `, ${user.email.split("@")[0]}` : ""}`}
        subtitle={tenant ? `${tenant.name} · plan ${tenant.plan}` : "Portail client LoRaWAN"}
      />
      <RoleBanner />

      {isAdmin && (
        <section className="mb-6 rounded-xl border border-emerald-500/50 bg-emerald-950/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-emerald-200">Administration plateforme</p>
              <p className="mt-1 text-sm text-slate-300">
                Créez des tenants clients et provisionnez leurs utilisateurs (admin, operator, viewer).
              </p>
            </div>
            <Link
              href="/admin/tenants"
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Gérer les tenants clients →
            </Link>
          </div>
        </section>
      )}

      {connected === false && (
        <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm text-amber-100">
          Réseau LoRaWAN temporairement indisponible — contactez le support si le problème persiste.
        </div>
      )}

      <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Uplinks 24h" value={overview?.totalUplinks24h ?? 0} />
        <StatCard label="Devices actifs" value={overview?.activeDevices24h ?? 0} tone="text-emerald-300" />
        <StatCard label="Gateways actifs" value={overview?.activeGateways24h ?? 0} tone="text-sky-300" />
        <StatCard
          label="RSSI moyen"
          value={overview?.avgRssi24h != null ? `${overview.avgRssi24h.toFixed(1)} dBm` : "—"}
        />
      </section>

      <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Devices enregistrés" value={devices} />
        <StatCard label="Gateways" value={gateways} />
        <StatCard label="Applications" value={apps} />
        <StatCard label="Règles actives" value={rules} />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Accès rapide" action={isAdmin ? <Link href="/admin/tenants" className="text-xs text-emerald-400 hover:underline">Tenants clients →</Link> : undefined}>
          <div className="grid gap-2 sm:grid-cols-2">
            {quickLinks.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-lg border border-slate-800 p-3 hover:border-emerald-500/40 hover:bg-slate-900">
                <p className="font-medium text-emerald-300">{l.label}</p>
                <p className="text-xs text-slate-500">{l.desc}</p>
              </Link>
            ))}
          </div>
        </Section>

        <Section title="Alertes récentes">
          {alerts.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune alerte — voir /noc</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {alerts.map((a) => (
                <li key={a.id} className="flex justify-between rounded-lg border border-slate-800 px-3 py-2">
                  <span className="text-amber-200">{a.ruleName}</span>
                  <time className="text-xs text-slate-500">{new Date(a.matchedAt).toLocaleTimeString("fr-FR")}</time>
                </li>
              ))}
            </ul>
          )}
          <Link href="/noc" className="mt-3 inline-block text-xs text-emerald-400 hover:underline">Voir NOC →</Link>
        </Section>

        <Section title="Mon compte">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-400">Email</dt><dd>{user?.email || "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Rôles</dt><dd>{user?.roles?.join(", ") || "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Tenant CS</dt><dd className="font-mono text-xs">{user?.tenantId?.slice(0, 13) ?? "—"}…</dd></div>
          </dl>
          <Link href="/settings" className="mt-4 inline-block text-xs text-emerald-400 hover:underline">Paramètres →</Link>
        </Section>
      </div>
    </div>
  );
}
