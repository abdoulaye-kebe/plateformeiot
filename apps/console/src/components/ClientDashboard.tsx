"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useClientAuth } from "@/lib/useClientAuth";
import { DashboardCard, DashboardLink, LegendItem, MetricLarge, SparkBars } from "@/components/dashboard-ui";
import TenantOnboardingWizard from "@/components/TenantOnboardingWizard";
import { RoleBanner } from "@/components/ui";

type Overview = { totalUplinks24h: number; activeDevices24h: number; activeGateways24h: number; avgRssi24h?: number };
type Alert = { id: number; ruleName: string; matchedAt: string };
type PlanDetails = { name: string; maxDevices: number; maxGateways: number; maxUplinksMonth: number };
type TenantMe = { name: string; slug: string; plan: string; planDetails?: PlanDetails };
type UsageQuota = {
  plan?: PlanDetails;
  deviceCount: number;
  gatewayCount: number;
  uplinkCount: number;
  devicesRemaining: number;
  gatewaysRemaining: number;
  uplinksRemaining: number;
};
type SubscriptionResponse = { tenant?: TenantMe; usage?: UsageQuota };
type HistoryDay = { day: string; uplinkCount: number };

function DonutChart({ active, total }: { active: number; total: number }) {
  const pct = total > 0 ? (active / total) * 100 : 0;
  const silentPct = 100 - pct;
  return (
    <div className="relative mx-auto h-[140px] w-[140px]">
      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#ebebeb" strokeWidth="3.2" />
        {silentPct > 0 && (
          <circle
            cx="18"
            cy="18"
            r="15.915"
            fill="none"
            stroke="#FF7900"
            strokeWidth="3.2"
            strokeDasharray={`${silentPct} ${100 - silentPct}`}
            strokeDashoffset={-pct}
          />
        )}
        {pct > 0 && (
          <circle
            cx="18"
            cy="18"
            r="15.915"
            fill="none"
            stroke="#32C5FF"
            strokeWidth="3.2"
            strokeDasharray={`${pct} ${100 - pct}`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold leading-none text-black">{active}</span>
        <span className="mt-0.5 text-xs text-gray-500">actifs</span>
      </div>
    </div>
  );
}

export default function ClientDashboard() {
  const { isAdmin } = useClientAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [devices, setDevices] = useState(0);
  const [gateways, setGateways] = useState(0);
  const [apps, setApps] = useState(0);
  const [rules, setRules] = useState(0);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [tenant, setTenant] = useState<TenantMe | null>(null);
  const [usage, setUsage] = useState<UsageQuota | null>(null);
  const [history, setHistory] = useState<HistoryDay[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [rightTab, setRightTab] = useState<"quota" | "alerts">("quota");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    async function load() {
      const [status, ov, d, g, a, r, al, t, sub, hist] = await Promise.all([
        apiFetch<{ networkConnected?: boolean }>("/api/v1/status"),
        apiFetch<Overview>("/api/v1/analytics/overview"),
        apiFetch<{ totalCount?: number }>("/api/v1/lorawan/devices?limit=1"),
        apiFetch<{ totalCount?: number }>("/api/v1/lorawan/gateways?limit=1"),
        apiFetch<{ totalCount?: number }>("/api/v1/lorawan/applications?limit=50"),
        apiFetch<{ result?: unknown[] }>("/api/v1/rules/"),
        apiFetch<{ alerts?: Alert[] }>("/api/v1/noc/alerts?limit=5"),
        apiFetch<TenantMe>("/api/v1/tenants/me"),
        apiFetch<SubscriptionResponse>("/api/v1/billing/subscription"),
        apiFetch<{ result?: HistoryDay[] }>("/api/v1/billing/history?days=7"),
      ]);
      setConnected(status?.networkConnected ?? null);
      setOverview(ov);
      setDevices(d?.totalCount ?? 0);
      setGateways(g?.totalCount ?? 0);
      setApps(a?.totalCount ?? 0);
      setRules(r?.result?.length ?? 0);
      setAlerts(al?.alerts ?? []);
      setTenant(t);
      setHistory(hist?.result ?? []);

      const plan = sub?.usage?.plan ?? t?.planDetails;
      if (sub?.usage) {
        setUsage(sub.usage);
      } else if (plan && t) {
        const dc = d?.totalCount ?? 0;
        const gc = g?.totalCount ?? 0;
        const uc = ov?.totalUplinks24h ?? 0;
        setUsage({
          plan,
          deviceCount: dc,
          gatewayCount: gc,
          uplinkCount: uc,
          devicesRemaining: plan.maxDevices - dc,
          gatewaysRemaining: plan.maxGateways - gc,
          uplinksRemaining: plan.maxUplinksMonth - uc,
        });
      }
    }
    load();
  }, [refreshKey]);

  const reloadDashboard = () => setRefreshKey((k) => k + 1);

  const activeDevices = overview?.activeDevices24h ?? 0;
  const silentDevices = Math.max(0, devices - activeDevices);
  const plan = usage?.plan ?? tenant?.planDetails;

  const sparkUplinks = useMemo(() => {
    if (history.length > 0) return history.map((h) => h.uplinkCount);
    return [0, 0, 0, overview?.totalUplinks24h ?? 0, 0, 0, 0];
  }, [history, overview]);

  const kpis: { label: string; value: string | number; bars: number[]; text?: boolean; href?: string }[] = [
    { label: "Uplinks 24h", value: overview?.totalUplinks24h ?? 0, bars: sparkUplinks },
    { label: "Gateways actifs", value: overview?.activeGateways24h ?? 0, bars: [0, 0, 0, overview?.activeGateways24h ?? 0, 0, 0, 0], href: "/gateways" },
    {
      label: "RSSI moyen",
      value: overview?.avgRssi24h != null && Number.isFinite(Number(overview.avgRssi24h))
        ? `${Number(overview.avgRssi24h).toFixed(1)} dBm`
        : "—",
      bars: [20, 40, 30, 50, 35, 45, 25],
    },
    { label: "Tenant", value: tenant?.name ?? "—", bars: [10, 10, 10, 10, 10, 10, 10], text: true },
  ];

  return (
    <div className="mx-auto max-w-[1400px] p-4 lg:p-5">
      <RoleBanner />

      {isAdmin && (
        <div className="mb-4 border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-700">
          Administration plateforme
          {tenant?.name && (
            <span>
              {" "}
              — tenant actif : <strong>{tenant.name}</strong> ({tenant.slug})
            </span>
          )}
          {" "}
          —{" "}
          <Link href="/admin/tenants" className="font-medium text-brand hover:underline">
            Gérer les tenants
          </Link>
        </div>
      )}

      {connected === false && (
        <div className="mb-4 border-l-4 border-brand bg-white px-4 py-2.5 text-sm">Réseau LoRaWAN temporairement indisponible.</div>
      )}

      {!isAdmin && <TenantOnboardingWizard tenantName={tenant?.name} onRefresh={reloadDashboard} />}

      {/* Rangée principale 60/40 */}
      <div className="grid gap-4 lg:grid-cols-5">
        <DashboardCard
          title="Devices status"
          className="lg:col-span-3"
          footer={
            <div className="flex flex-wrap gap-4">
              <DashboardLink href="/devices">See all devices →</DashboardLink>
              <DashboardLink href="/gateways">See all gateways →</DashboardLink>
            </div>
          }
        >
          <div className="grid gap-6 md:grid-cols-[1fr_auto_1fr] md:items-center">
            <div className="flex gap-10">
              <MetricLarge value={devices} label="devices" />
              <MetricLarge value={silentDevices} label="silent devices" highlight />
            </div>

            <DonutChart active={activeDevices} total={devices} />

            <ul className="space-y-0.5">
              <LegendItem color="bg-sky-400" label="Devices actifs (24h)" value={activeDevices} />
              <LegendItem color="bg-brand" label="Devices silencieux" value={silentDevices} />
              <li>
                <Link href="/gateways" className="block rounded hover:bg-gray-50">
                  <LegendItem color="bg-emerald-500" label="Gateways" value={gateways} />
                </Link>
              </li>
              <LegendItem color="bg-violet-500" label="Applications" value={apps} />
              <LegendItem color="bg-gray-400" label="Règles actives" value={rules} />
            </ul>
          </div>
        </DashboardCard>

        <DashboardCard
          title=""
          className="lg:col-span-2"
          tabs={[
            { id: "quota", label: "Plans and Quota" },
            { id: "alerts", label: "Error logs" },
          ]}
          activeTab={rightTab}
          onTabChange={(id) => setRightTab(id as "quota" | "alerts")}
          footer={
            rightTab === "quota" ? (
              <DashboardLink href="/billing">Manage subscription →</DashboardLink>
            ) : (
              <DashboardLink href="/noc">See data as table and export →</DashboardLink>
            )
          }
        >
          {rightTab === "quota" ? (
            <div className="space-y-5">
              <MetricLarge value={(tenant?.plan ?? plan?.name ?? "—").toString().toUpperCase()} label="current plan" size="md" />
              {usage && plan ? (
                <ul className="divide-y divide-gray-100 text-sm">
                  <li className="flex justify-between py-2.5">
                    <span className="text-gray-600">Devices</span>
                    <span>
                      <strong className="text-black">{usage.deviceCount}</strong>
                      <span className="text-gray-500"> / {plan.maxDevices}</span>
                    </span>
                  </li>
                  <li className="flex justify-between py-2.5">
                    <span className="text-gray-600">Gateways</span>
                    <span>
                      <strong className="text-black">{usage.gatewayCount}</strong>
                      <span className="text-gray-500"> / {plan.maxGateways}</span>
                    </span>
                  </li>
                  <li className="flex justify-between py-2.5">
                    <span className="text-gray-600">Uplinks (mois)</span>
                    <span>
                      <strong className={usage.uplinksRemaining < plan.maxUplinksMonth * 0.1 ? "text-brand" : "text-black"}>
                        {usage.uplinkCount.toLocaleString("fr-FR")}
                      </strong>
                      <span className="text-gray-500"> / {plan.maxUplinksMonth.toLocaleString("fr-FR")}</span>
                    </span>
                  </li>
                </ul>
              ) : (
                <p className="text-sm text-gray-500">Plan {tenant?.plan ?? "starter"} — quotas calculés au prochain chargement.</p>
              )}
            </div>
          ) : alerts.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">No error logs in the last period.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {alerts.map((a) => (
                <li key={a.id} className="flex justify-between gap-2 py-2.5 text-sm">
                  <span className="font-medium text-brand">{a.ruleName}</span>
                  <time className="shrink-0 text-xs text-gray-500">{new Date(a.matchedAt).toLocaleString("fr-FR")}</time>
                </li>
              ))}
            </ul>
          )}
        </DashboardCard>
      </div>

      {/* Gateways — carte dédiée */}
      <div className="mt-4">
        <DashboardCard
          title="Gateways status"
          footer={<DashboardLink href="/gateways">Manage gateways →</DashboardLink>}
        >
          <div className="flex flex-wrap items-center gap-10">
            <MetricLarge value={gateways} label="gateways enregistrés" />
            <MetricLarge
              value={overview?.activeGateways24h ?? 0}
              label="gateways actifs (24h)"
              highlight={(overview?.activeGateways24h ?? 0) > 0}
            />
            {usage && plan && (
              <MetricLarge
                value={`${usage.gatewayCount} / ${plan.maxGateways}`}
                label="quota gateways"
                size="md"
              />
            )}
          </div>
        </DashboardCard>
      </div>

      {/* KPI compacts */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => {
          const inner = (
            <>
              <p className="text-xs font-medium text-gray-500">{kpi.label}</p>
              <p className={`mt-1 tabular-nums font-bold text-black ${kpi.text ? "truncate text-lg" : "text-2xl"}`}>{kpi.value}</p>
              {!kpi.text && <SparkBars values={kpi.bars} />}
            </>
          );
          return kpi.href ? (
            <Link key={kpi.label} href={kpi.href} className="card-live block px-5 py-4 transition-colors hover:border-brand">
              {inner}
            </Link>
          ) : (
            <div key={kpi.label} className="card-live px-5 py-4">
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
